import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { isWorkingDay, differenceInWorkingDays, addWorkingDays, snapToWorkingDay } from "@/lib/working-days";
import { apiError } from "@/lib/api-errors";
import { getServerCurrentDate } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/[id]/pull-forward
 *
 * Returns the constraint data the pull-forward dialog needs:
 * - earliestStart: the soonest the job could realistically start, given
 *   predecessor completion + outstanding orders' lead times.
 * - predecessorEndDate: when the previous job on this plot is expected
 *   to finish (if any). If the predecessor is NOT_STARTED, we still
 *   honour its planned end — can't start this job before the work it
 *   depends on.
 * - orderConstraints: for each PENDING/ORDERED order on this job, when
 *   it can realistically be delivered. PENDING orders count the
 *   leadTimeDays forward from today (the earliest the order could be
 *   placed). ORDERED orders use the expectedDeliveryDate directly.
 *
 * The dialog uses this to grey out impossible dates in the "Pick a date"
 * option and explain WHY each blocker exists — so the site manager sees
 * "Can't start until the bricks land on 5 May" instead of a silent grey.
 *
 * Same auth + site-access pattern as the delay suggestion endpoint.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const job = await prisma.job.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        status: true,
        plotId: true,
        sortOrder: true,
        parentId: true,
        plot: { select: { siteId: true } },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (
      !(await canAccessSite(
        session.user.id,
        (session.user as { role: string }).role,
        job.plot.siteId,
      ))
    ) {
      return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
    }

    // ── Predecessor ────────────────────────────────────────────────────
    // The previous job on the same plot by sortOrder. Skip:
    //   - This job's OWN parent (the stage aggregate that contains this job —
    //     its end date represents the whole stage, so counting it as a
    //     predecessor creates a false block).
    //   - Sibling parents whose end dates span their whole group rather
    //     than sit before THIS job. When siblings exist, prefer the last
    //     leaf job that ended before this one's sortOrder.
    //   - ON_HOLD jobs (dormant).
    //
    // If we find a parent with children overlapping this job's window,
    // skip it and take the prior leaf instead.
    // Explicit where — avoid `{ not: undefined }` which Prisma treats as
    // "no constraint" (matches everything). When parentId is null, don't
    // apply the parent exclusion at all; when set, exclude that exact id.
    const siblings = await prisma.job.findMany({
      where: {
        plotId: job.plotId,
        sortOrder: { lt: job.sortOrder },
        status: { not: "ON_HOLD" },
        ...(job.parentId ? { id: { not: job.parentId } } : {}),
      },
      orderBy: { sortOrder: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        endDate: true,
        actualEndDate: true,
        signedOffAt: true,
        parentId: true,
      },
    });

    // Pick the first one that isn't a parent of THIS job's sibling leafs.
    // Leaf = no child rows. We want a predecessor that finished BEFORE this
    // job was meant to start, not an aggregate that spans past it.
    const predecessor = siblings.find((p) => {
      // If the candidate itself has no parentId and is not THIS job's parent,
      // it's either a leaf or a peer parent. We accept peer parents only if
      // their endDate is strictly before this job's startDate (i.e. they
      // don't overlap). Otherwise skip.
      if (!job.startDate) return true;
      if (p.endDate && p.endDate >= job.startDate) {
        // Overlaps or extends past this job — probably an aggregate parent,
        // not a true predecessor. Keep scanning earlier siblings.
        return false;
      }
      return true;
    }) ?? null;

    const predecessorEndDate = predecessor
      ? predecessor.status === "COMPLETED" || predecessor.signedOffAt
        ? predecessor.actualEndDate ?? predecessor.endDate
        : predecessor.endDate
      : null;

    // ── Orders for this job ────────────────────────────────────────────
    const orders = await prisma.materialOrder.findMany({
      where: {
        jobId: id,
        status: { in: ["PENDING", "ORDERED"] },
      },
      select: {
        id: true,
        status: true,
        dateOfOrder: true,
        expectedDeliveryDate: true,
        leadTimeDays: true,
        itemsDescription: true,
        supplier: { select: { name: true } },
      },
    });

    const today = getServerCurrentDate(req);
    today.setHours(0, 0, 0, 0);

    const orderConstraints = orders.map((o) => {
      let earliestDelivery: Date | null = null;
      let reason = "";

      if (o.status === "ORDERED" && o.expectedDeliveryDate) {
        earliestDelivery = o.expectedDeliveryDate;
        reason = `${o.supplier.name} delivery due ${o.expectedDeliveryDate.toISOString().slice(0, 10)}`;
      } else if (o.status === "PENDING" && o.leadTimeDays && o.leadTimeDays > 0) {
        // The earliest we could get this delivered is today + leadTimeDays
        // (assumes the order is placed today). leadTimeDays is calendar
        // days (suppliers don't differentiate weekends), so we add via
        // setDate. Snap forward to a working day so the constraint
        // doesn't pretend a Sat/Sun delivery is feasible.
        const target = new Date(today);
        target.setDate(target.getDate() + o.leadTimeDays);
        earliestDelivery = isWorkingDay(target)
          ? target
          : snapToWorkingDay(target, "forward");
        reason = `${o.supplier.name} hasn't been ordered yet — ${o.leadTimeDays} day lead time`;
      } else if (o.status === "PENDING") {
        // No lead time set, use dateOfOrder (when it was first expected to be placed)
        earliestDelivery = o.dateOfOrder;
        reason = `${o.supplier.name} hasn't been ordered yet`;
      }

      return {
        orderId: o.id,
        supplier: o.supplier.name,
        items: o.itemsDescription,
        status: o.status,
        leadTimeDays: o.leadTimeDays,
        earliestDelivery,
        reason,
      };
    });

    // ── Earliest start ─────────────────────────────────────────────────
    // max(today, predecessor end date, each order's earliest delivery)
    //
    // "Earliest allowed start is today" reads more honestly than "Can't
    // start in the past" — we're telling the user where the floor is,
    // not accusing them of time travel. The message also appears mid-
    // sentence after "can't be pulled forward —", so we phrase it in
    // sentence form.
    const candidates: Array<{ date: Date; why: string }> = [
      { date: today, why: "earliest allowed start is today" },
    ];
    if (predecessorEndDate) {
      candidates.push({
        date: predecessorEndDate,
        why: predecessor?.status === "COMPLETED" || predecessor?.signedOffAt
          ? `Previous job "${predecessor.name}" completed on ${predecessorEndDate.toISOString().slice(0, 10)}`
          : `Previous job "${predecessor?.name}" scheduled to finish ${predecessorEndDate.toISOString().slice(0, 10)}`,
      });
    }
    for (const oc of orderConstraints) {
      if (oc.earliestDelivery) {
        candidates.push({ date: oc.earliestDelivery, why: oc.reason });
      }
    }

    // Pick the latest (the binding constraint).
    const binding = candidates.reduce((a, b) => (a.date >= b.date ? a : b));
    let earliestStart = binding.date;

    // Snap forward to the next working day if the binding falls on a weekend.
    while (!isWorkingDay(earliestStart)) {
      const next = new Date(earliestStart);
      next.setDate(next.getDate() + 1);
      earliestStart = next;
    }

    // Current plan
    const currentStart = job.startDate;
    const canBePulledForward = currentStart
      ? earliestStart < currentStart
      : false;

    return NextResponse.json({
      jobId: id,
      jobName: job.name,
      currentStart: currentStart?.toISOString() ?? null,
      currentEnd: job.endDate?.toISOString() ?? null,
      earliestStart: earliestStart.toISOString(),
      earliestStartReason: binding.why,
      canBePulledForward,
      predecessor: predecessor
        ? {
            id: predecessor.id,
            name: predecessor.name,
            status: predecessor.status,
            endDate: predecessor.endDate?.toISOString() ?? null,
            actualEndDate: predecessor.actualEndDate?.toISOString() ?? null,
            signedOffAt: predecessor.signedOffAt?.toISOString() ?? null,
          }
        : null,
      orderConstraints: orderConstraints.map((oc) => ({
        ...oc,
        earliestDelivery: oc.earliestDelivery?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    return apiError(err, "Failed to compute pull-forward constraints");
  }
}

/**
 * POST /api/jobs/[id]/pull-forward
 *
 * Apply a pull-forward: shift the job earlier to `newStartDate`, preserving
 * working-day duration. This is the opposite direction to /delay. Unlike
 * delay, we DO NOT cascade downstream — a pulled-forward job just gives
 * its downstream neighbours more slack. If the user wants to compress
 * the whole programme they'd call pull-forward on each job in turn.
 *
 * We DO shift this job's own PENDING orders earlier by the same number of
 * working days, otherwise the order would miss its lead time. ORDERED
 * and DELIVERED orders stay put — those dates are already locked in with
 * the supplier.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json() as {
      newStartDate: string;
      assumeOrdersSent?: string[];
    };

    if (!body.newStartDate) {
      return NextResponse.json({ error: "newStartDate required" }, { status: 400 });
    }
    const newStart = new Date(body.newStartDate);
    if (isNaN(newStart.getTime())) {
      return NextResponse.json({ error: "Invalid newStartDate" }, { status: 400 });
    }
    newStart.setHours(0, 0, 0, 0);
    const overrideOrderIds = new Set(body.assumeOrdersSent ?? []);

    const job = await prisma.job.findUnique({
      where: { id },
      include: { plot: { select: { siteId: true } } },
    });
    if (!job || !job.startDate || !job.endDate) {
      return NextResponse.json({ error: "Job not found or missing dates" }, { status: 404 });
    }

    if (
      !(await canAccessSite(
        session.user.id,
        (session.user as { role: string }).role,
        job.plot.siteId,
      ))
    ) {
      return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
    }

    // Must be earlier than current start — otherwise this is a push, not a pull.
    if (newStart >= job.startDate) {
      return NextResponse.json(
        { error: "New start date must be earlier than current start" },
        { status: 400 },
      );
    }

    const shift = differenceInWorkingDays(newStart, job.startDate); // negative
    if (shift === 0) {
      return NextResponse.json({ error: "No change" }, { status: 400 });
    }

    const newEnd = addWorkingDays(job.endDate, shift);

    // Shift PENDING orders so their dateOfOrder tracks the new start.
    const pendingOrders = await prisma.materialOrder.findMany({
      where: { jobId: id, status: "PENDING" },
    });

    // (#167) "Start anyway" override — for any PENDING order whose id is
    // in assumeOrdersSent, don't shift it; instead mark it ORDERED with
    // dateOfOrder=today inside the transaction. Track the IDs so we can
    // return them to the client for the delivery follow-up prompt.
    const today = getServerCurrentDate(req);
    today.setHours(0, 0, 0, 0);
    const ordersToShift = pendingOrders.filter((o) => !overrideOrderIds.has(o.id));
    const ordersToOverride = pendingOrders.filter((o) => overrideOrderIds.has(o.id));

    await prisma.$transaction(async (tx) => {
      await tx.job.update({
        where: { id },
        data: {
          startDate: newStart,
          endDate: newEnd,
          ...(!job.originalStartDate && job.startDate ? { originalStartDate: job.startDate } : {}),
          ...(!job.originalEndDate && job.endDate ? { originalEndDate: job.endDate } : {}),
        },
      });

      for (const o of ordersToShift) {
        const newOrderDate = addWorkingDays(o.dateOfOrder, shift);
        const newDelivery = o.expectedDeliveryDate
          ? addWorkingDays(o.expectedDeliveryDate, shift)
          : null;
        await tx.materialOrder.update({
          where: { id: o.id },
          data: { dateOfOrder: newOrderDate, expectedDeliveryDate: newDelivery },
        });
      }

      for (const o of ordersToOverride) {
        await tx.materialOrder.update({
          where: { id: o.id },
          data: { status: "ORDERED", dateOfOrder: today },
        });
      }

      const wdAbs = Math.abs(shift);
      await tx.jobAction.create({
        data: {
          jobId: id,
          action: "note",
          notes: `⚡ Pulled forward ${wdAbs} working day${wdAbs > 1 ? "s" : ""} — new start ${newStart.toISOString().slice(0, 10)}`,
          userId: session.user.id,
        },
      });

      await tx.eventLog.create({
        data: {
          type: "SCHEDULE_CASCADED",
          description: `"${job.name}" pulled forward ${wdAbs} working day(s) — new start ${newStart.toISOString().slice(0, 10)}`,
          siteId: job.plot.siteId,
          plotId: job.plotId,
          jobId: id,
          userId: session.user.id,
        },
      });

      // (#3) Parent rollup must follow the child shift — without this
      // the parent's cached startDate/endDate go stale immediately on
      // a sub-job pull-forward.
      const { recomputeParentOf } = await import("@/lib/parent-job");
      await recomputeParentOf(tx, id);
    },
    // Bumped to 30s in case a job has many pending orders to shift.
    { timeout: 30_000, maxWait: 10_000 },
    );

    // Plot percent only shifts if status changes — pull-forward
    // doesn't change status — but recompute defensively in case
    // the shifted dates land on/past today and a follow-up runs.
    {
      const { recomputePlotPercent } = await import("@/lib/plot-percent");
      await recomputePlotPercent(prisma, job.plotId);
    }

    return NextResponse.json({
      jobId: id,
      newStartDate: newStart.toISOString(),
      newEndDate: newEnd.toISOString(),
      workingDaysPulledForward: Math.abs(shift),
      ordersShifted: ordersToShift.length,
      // (#167) IDs of orders just flipped to ORDERED so the client can
      // prompt for delivery state (today / new date).
      overriddenOrders: ordersToOverride.map((o) => ({ id: o.id })),
    });
  } catch (err) {
    return apiError(err, "Failed to pull job forward");
  }
}
