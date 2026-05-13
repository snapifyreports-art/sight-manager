import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { differenceInWorkingDays } from "@/lib/working-days";
import { openOrUpdateLateness, resolveLateness } from "@/lib/lateness-event";
import { getServerCurrentDate } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

/**
 * (#191) Daily lateness scanner.
 *
 * For every active site, finds:
 *   - Jobs past planned endDate, not COMPLETED → JOB_END_OVERDUE
 *   - NOT_STARTED jobs past planned startDate → JOB_START_OVERDUE
 *   - ORDERED orders past expectedDeliveryDate → ORDER_DELIVERY_OVERDUE
 *   - PENDING orders past dateOfOrder → ORDER_SEND_OVERDUE
 *
 * For each: upserts a LatenessEvent row keyed by
 * (target, kind, day-it-first-went-late). Refreshes daysLate.
 *
 * Also resolves any open events whose target has reached a non-late
 * terminal state since last scan (job COMPLETED, order DELIVERED).
 *
 * Scheduled in vercel.json at 6am UTC alongside the daily-email and
 * notifications crons.
 */
export async function GET(req: NextRequest) {
  const { checkCronAuth } = await import("@/lib/cron-auth");
  const authCheck = checkCronAuth(req.headers.get("authorization"));
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized", reason: authCheck.reason },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  const today = getServerCurrentDate(req);
  today.setHours(0, 0, 0, 0);

  let jobsScanned = 0;
  let ordersScanned = 0;
  let opened = 0;
  let updated = 0;
  let resolved = 0;
  const errors: Array<{ target: string; error: string }> = [];

  // ----- Sweep all active sites' jobs -----
  const activeSiteIds = await prisma.site.findMany({
    where: { status: { not: "COMPLETED" } },
    select: { id: true },
  });
  const siteIds = activeSiteIds.map((s) => s.id);
  if (siteIds.length === 0) {
    return NextResponse.json({ skipped: "no active sites", durationMs: Date.now() - startedAt });
  }

  // ----- Open / refresh jobs lateness -----
  const lateJobs = await prisma.job.findMany({
    where: {
      plot: { siteId: { in: siteIds } },
      children: { none: {} },
      OR: [
        { status: { not: "COMPLETED" }, endDate: { lt: today } },
        { status: "NOT_STARTED", startDate: { lt: today } },
      ],
    },
    select: {
      id: true,
      plotId: true,
      startDate: true,
      endDate: true,
      status: true,
      plot: { select: { siteId: true } },
    },
  });
  jobsScanned = lateJobs.length;
  for (const j of lateJobs) {
    try {
      // JOB_END_OVERDUE — any non-COMPLETED job past endDate.
      if (j.status !== "COMPLETED" && j.endDate && j.endDate < today) {
        const wentLateOn = new Date(j.endDate);
        wentLateOn.setHours(0, 0, 0, 0);
        // Skip the day the endDate falls on — only count strictly past.
        wentLateOn.setDate(wentLateOn.getDate() + 1);
        const daysLate = Math.max(1, differenceInWorkingDays(today, j.endDate));
        const r = await openOrUpdateLateness(prisma, {
          kind: "JOB_END_OVERDUE",
          targetType: "job",
          targetId: j.id,
          siteId: j.plot.siteId,
          plotId: j.plotId,
          jobId: j.id,
          wentLateOn,
          daysLate,
        });
        if (r.created) opened++;
        else updated++;
      }
      // JOB_START_OVERDUE — NOT_STARTED past startDate.
      if (j.status === "NOT_STARTED" && j.startDate && j.startDate < today) {
        const wentLateOn = new Date(j.startDate);
        wentLateOn.setHours(0, 0, 0, 0);
        wentLateOn.setDate(wentLateOn.getDate() + 1);
        const daysLate = Math.max(1, differenceInWorkingDays(today, j.startDate));
        const r = await openOrUpdateLateness(prisma, {
          kind: "JOB_START_OVERDUE",
          targetType: "job",
          targetId: j.id,
          siteId: j.plot.siteId,
          plotId: j.plotId,
          jobId: j.id,
          wentLateOn,
          daysLate,
        });
        if (r.created) opened++;
        else updated++;
      }
    } catch (e) {
      errors.push({ target: `job:${j.id}`, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ----- Open / refresh orders lateness -----
  const lateOrders = await prisma.materialOrder.findMany({
    where: {
      OR: [
        // Order placed but not delivered, past expectedDeliveryDate
        { status: "ORDERED", expectedDeliveryDate: { lt: today } },
        // Order still pending, past dateOfOrder
        { status: "PENDING", dateOfOrder: { lt: today } },
      ],
    },
    select: {
      id: true,
      status: true,
      expectedDeliveryDate: true,
      dateOfOrder: true,
      jobId: true,
      plotId: true,
      siteId: true,
      supplierId: true,
      contactId: true,
      job: { select: { plotId: true, plot: { select: { siteId: true } } } },
    },
  });

  for (const o of lateOrders) {
    try {
      const siteId = o.job?.plot?.siteId ?? o.siteId ?? null;
      if (!siteId) continue;
      // Only consider orders on active sites.
      if (!siteIds.includes(siteId)) continue;
      ordersScanned++;
      const plotId = o.job?.plotId ?? o.plotId ?? null;
      const attributedContactId = o.contactId ?? null;
      // (May 2026 audit S-P1) Auto-attribute to the Supplier — every
      // MaterialOrder has supplierId, so order-driven lateness now
      // gets attribution day-one without manager intervention. The
      // Analytics widget's supplier section finally populates.
      const attributedSupplierId = o.supplierId ?? null;

      if (o.status === "ORDERED" && o.expectedDeliveryDate && o.expectedDeliveryDate < today) {
        const wentLateOn = new Date(o.expectedDeliveryDate);
        wentLateOn.setHours(0, 0, 0, 0);
        wentLateOn.setDate(wentLateOn.getDate() + 1);
        const daysLate = Math.max(1, differenceInWorkingDays(today, o.expectedDeliveryDate));
        const r = await openOrUpdateLateness(prisma, {
          kind: "ORDER_DELIVERY_OVERDUE",
          targetType: "order",
          targetId: o.id,
          siteId,
          plotId,
          jobId: o.jobId ?? null,
          orderId: o.id,
          wentLateOn,
          daysLate,
          reasonCode: "MATERIAL_LATE",
          attributedContactId,
          attributedSupplierId,
        });
        if (r.created) opened++;
        else updated++;
      }
      if (o.status === "PENDING" && o.dateOfOrder < today) {
        const wentLateOn = new Date(o.dateOfOrder);
        wentLateOn.setHours(0, 0, 0, 0);
        wentLateOn.setDate(wentLateOn.getDate() + 1);
        const daysLate = Math.max(1, differenceInWorkingDays(today, o.dateOfOrder));
        const r = await openOrUpdateLateness(prisma, {
          kind: "ORDER_SEND_OVERDUE",
          targetType: "order",
          targetId: o.id,
          siteId,
          plotId,
          jobId: o.jobId ?? null,
          orderId: o.id,
          wentLateOn,
          daysLate,
        });
        if (r.created) opened++;
        else updated++;
      }
    } catch (e) {
      errors.push({ target: `order:${o.id}`, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // ----- Resolve events whose targets are no longer late -----
  // Find all open events; for each, check the target's current state.
  const openEvents = await prisma.latenessEvent.findMany({
    where: { resolvedAt: null, siteId: { in: siteIds } },
    select: { id: true, kind: true, targetType: true, targetId: true },
  });
  for (const ev of openEvents) {
    try {
      let isResolved = false;
      if (ev.targetType === "job") {
        const job = await prisma.job.findUnique({
          where: { id: ev.targetId },
          select: { status: true, startDate: true, endDate: true },
        });
        if (!job) {
          // Target deleted — resolve to avoid orphan.
          isResolved = true;
        } else if (ev.kind === "JOB_END_OVERDUE") {
          if (job.status === "COMPLETED") isResolved = true;
          else if (job.endDate && job.endDate >= today) isResolved = true;
        } else if (ev.kind === "JOB_START_OVERDUE") {
          if (job.status !== "NOT_STARTED") isResolved = true;
          else if (job.startDate && job.startDate >= today) isResolved = true;
        }
      } else if (ev.targetType === "order") {
        const order = await prisma.materialOrder.findUnique({
          where: { id: ev.targetId },
          select: { status: true, expectedDeliveryDate: true, dateOfOrder: true },
        });
        if (!order) {
          isResolved = true;
        } else if (ev.kind === "ORDER_DELIVERY_OVERDUE") {
          if (order.status === "DELIVERED" || order.status === "CANCELLED") isResolved = true;
          else if (order.expectedDeliveryDate && order.expectedDeliveryDate >= today) isResolved = true;
        } else if (ev.kind === "ORDER_SEND_OVERDUE") {
          if (order.status !== "PENDING") isResolved = true;
          else if (order.dateOfOrder >= today) isResolved = true;
        }
      }
      if (isResolved) {
        const r = await resolveLateness(prisma, ev.targetType as "job" | "order", ev.targetId, today);
        resolved += r.resolved;
      }
    } catch (e) {
      errors.push({ target: `${ev.targetType}:${ev.targetId}`, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const durationMs = Date.now() - startedAt;

  // (May 2026 audit B-P2-6) Summary EventLog row when work happened
  // so an operator scanning the events log can tell when the cron
  // last ran. Matches the pattern used by the reconcile cron.
  if (opened > 0 || updated > 0 || resolved > 0 || errors.length > 0) {
    await prisma.eventLog
      .create({
        data: {
          type: "NOTIFICATION",
          description: `Lateness cron: ${opened} opened, ${updated} updated, ${resolved} resolved${errors.length > 0 ? ` (${errors.length} errors)` : ""} — ${jobsScanned} jobs + ${ordersScanned} orders scanned in ${durationMs}ms`,
        },
      })
      .catch((err) => console.warn("[lateness cron] summary log failed:", err));
  }

  return NextResponse.json({
    jobsScanned,
    ordersScanned,
    opened,
    updated,
    resolved,
    errors: errors.length,
    errorsSample: errors.slice(0, 10),
    durationMs,
  });
}
