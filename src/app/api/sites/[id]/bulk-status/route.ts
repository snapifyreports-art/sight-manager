import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getServerCurrentDate } from "@/lib/dev-date";
import { sessionHasPermission } from "@/lib/permissions";
import type { JobStatus } from "@prisma/client";
import { canAccessSite } from "@/lib/site-access";
import { snapToWorkingDay } from "@/lib/working-days";

export const dynamic = "force-dynamic";

const ACTION_STATUS_MAP: Record<string, JobStatus> = {
  start: "IN_PROGRESS",
  complete: "COMPLETED",
};

// POST /api/sites/[id]/bulk-status — bulk start/complete jobs
// Callers: DailySiteBrief.handleQuickBulk + handleBulkAction — one-click
// "Start All" / "Complete All" from programme select mode. Bypasses the
// pre-start dialog flow intentionally — used for trusted batch operations
// where the user has already confirmed. Individual starts still go through
// useJobAction.
// Keep. Consumer audit last run: Apr 2026 session handover spot-check.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: siteId } = await params;

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
  const { jobIds, action } = await req.json();

  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return NextResponse.json({ error: "jobIds required" }, { status: 400 });
  }
  if (!action || !ACTION_STATUS_MAP[action]) {
    return NextResponse.json(
      { error: 'action must be "start" or "complete"' },
      { status: 400 }
    );
  }

  // Permission check for complete/signoff actions
  if (action === "complete" && !sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "SIGN_OFF_JOBS")) {
    return NextResponse.json({ error: "You do not have permission to complete jobs" }, { status: 403 });
  }

  const newStatus = ACTION_STATUS_MAP[action];
  const now = getServerCurrentDate(req);
  const results: Array<{ jobId: string; jobName: string; newStatus: string }> = [];

  // (May 2026 audit B-P1-25) Sort the jobIds by (plotId, sortOrder) so
  // an earlier job's auto-cascade lands BEFORE we evaluate a later
  // sibling's lateness. Pre-fix the loop processed jobIds in whatever
  // order the client supplied; if a downstream-late job's cascade ran
  // first, its shifted positions then double-counted when the upstream
  // job's cascade ran on the same plot. The cascade engine reads the
  // current DB state each iteration so processing in plot order means
  // the later-iteration sees the already-shifted (= correct) state.
  const orderedJobs = await prisma.job.findMany({
    where: { id: { in: jobIds } },
    select: { id: true, plotId: true, sortOrder: true },
  });
  const orderedJobMap = new Map(orderedJobs.map((j) => [j.id, j]));
  const sortedJobIds = [...jobIds].sort((a, b) => {
    const ja = orderedJobMap.get(a);
    const jb = orderedJobMap.get(b);
    if (!ja || !jb) return 0;
    if (ja.plotId !== jb.plotId) return ja.plotId.localeCompare(jb.plotId);
    return ja.sortOrder - jb.sortOrder;
  });

  // (May 2026 audit B-P1-27) Dedupe NEXT_STAGE_READY pushes across the
  // batch — when every job on a plot has the same assignedToId
  // (typical: cascaded from the site assignee), bulk-completing 5 jobs
  // pre-fix blasted 5 separate "next stage ready" notifications to the
  // same person. We track (plotId|assignedToId) keys that have already
  // been pushed and skip duplicates within this single batch.
  const nextStagePushKeysFired = new Set<string>();

  // Process sequentially to respect Supabase connection limits
  for (const jobId of sortedJobIds) {
    try {
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        include: { plot: true },
      });

      if (!job || job.plot.siteId !== siteId) continue;

      // Idempotency: skip jobs already in the target state
      if (action === "start" && job.status === "IN_PROGRESS") continue;
      if (action === "complete" && job.status === "COMPLETED") continue;
      // Prevent completing a job that was never started (matches /api/jobs/[id]/actions)
      if (action === "complete" && job.status === "NOT_STARTED") continue;

      // Build update data
      const updateData: Record<string, unknown> = { status: newStatus };

      if (action === "start" && !job.actualStartDate) {
        updateData.actualStartDate = now;
      }
      if (action === "complete") {
        // (May 2026 audit B-8) Backfill actualStartDate when a job is
        // completed without ever having a start stamped. Previously a
        // bulk-complete on a job that was IN_PROGRESS but had no
        // actualStartDate (corrupted by a half-failed earlier write or
        // legacy data) would leave it COMPLETED with end-date set but
        // no start-date, breaking lateness math + Story tab variance.
        // Fall back to the planned startDate, then to now.
        if (!job.actualStartDate) {
          updateData.actualStartDate = job.startDate ?? now;
        }
        updateData.actualEndDate = now;
        updateData.signedOffById = session.user.id;
        updateData.signedOffAt = now;
      }

      // Update job
      await prisma.job.update({
        where: { id: jobId },
        data: updateData,
      });

      // (#9) Starting any job clears the plot's deferred state — the
      // plot is back in motion. Mirrors single-job /actions/start.
      if (action === "start") {
        await prisma.plot.updateMany({
          where: {
            id: job.plotId,
            OR: [{ awaitingRestart: true }, { awaitingContractorConfirmation: true }],
          },
          data: { awaitingRestart: false, awaitingContractorConfirmation: false },
        });
      }

      // Progress orders: start → ORDERED; complete+signoff → DELIVERED.
      // (#179/180) Per-row through enforceOrderInvariants so we
      // can't write impossible date orderings (expectedDeliveryDate
      // < dateOfOrder, etc.) — the bulk paths used to use updateMany
      // which bypassed every invariant. Same fix as /api/jobs/[id]/actions.
      if (action === "start") {
        const { enforceOrderInvariants } = await import("@/lib/order-invariants");
        const pending = await prisma.materialOrder.findMany({
          where: { jobId, status: "PENDING" },
          select: {
            id: true,
            dateOfOrder: true,
            expectedDeliveryDate: true,
            deliveredDate: true,
            leadTimeDays: true,
          },
        });
        await Promise.all(
          pending.map((o) => {
            const patch = enforceOrderInvariants(
              {
                dateOfOrder: o.dateOfOrder,
                expectedDeliveryDate: o.expectedDeliveryDate,
                deliveredDate: o.deliveredDate,
                leadTimeDays: o.leadTimeDays,
              },
              { dateOfOrder: now, status: "ORDERED", leadTimeDays: o.leadTimeDays },
              now,
            );
            return prisma.materialOrder.update({
              where: { id: o.id },
              data: { status: "ORDERED", dateOfOrder: now, ...patch },
            });
          }),
        );
      }
      if (action === "complete") {
        // Bulk-status "complete" performs sign-off in one step — mirror
        // /api/jobs/[id]/actions signoff branch with same invariants.
        const { enforceOrderInvariants } = await import("@/lib/order-invariants");
        const ordered = await prisma.materialOrder.findMany({
          where: { jobId, status: "ORDERED" },
          select: {
            id: true,
            dateOfOrder: true,
            expectedDeliveryDate: true,
            deliveredDate: true,
            leadTimeDays: true,
          },
        });
        await Promise.all(
          ordered.map((o) => {
            const patch = enforceOrderInvariants(
              {
                dateOfOrder: o.dateOfOrder,
                expectedDeliveryDate: o.expectedDeliveryDate,
                deliveredDate: o.deliveredDate,
                leadTimeDays: o.leadTimeDays,
              },
              { deliveredDate: now, status: "DELIVERED" },
              now,
            );
            return prisma.materialOrder.update({
              where: { id: o.id },
              data: { status: "DELIVERED", deliveredDate: now, ...patch },
            });
          }),
        );
      }

      // Create job action record. (#10) Bulk "complete" performs both
      // complete + signoff in one shot — emit BOTH action records so
      // any downstream report filtering on action="signoff" (Delay
      // Report's signoff lookup) finds bulk completions too.
      await prisma.jobAction.create({
        data: {
          jobId,
          userId: session.user.id,
          action,
        },
      });
      if (action === "complete") {
        await prisma.jobAction.create({
          data: {
            jobId,
            userId: session.user.id,
            action: "signoff",
          },
        });
      }

      // Create event log
      const eventType = action === "complete" ? "JOB_SIGNED_OFF" : "JOB_STARTED";
      await prisma.eventLog.create({
        data: {
          type: eventType,
          description: `Job "${job.name}" was ${action === "start" ? "started" : "signed off"} (bulk)`,
          siteId,
          plotId: job.plotId,
          jobId,
          userId: session.user.id,
        },
      });

      // If this job has a parent, let the parent's dates/status follow
      {
        const { recomputeParentOf } = await import("@/lib/parent-job");
        await recomputeParentOf(prisma, jobId);
      }

      // (#189) Auto-cascade on LATE completion — mirrors
      // /api/jobs/[id]/actions. Bulk complete sets actualEndDate=now;
      // if that's later than the planned endDate the downstream MUST
      // shift by the delta or it'll overlap with this still-active
      // chain. Manager doesn't have to remember to click anything.
      if (action === "complete" && job.endDate) {
        const planned = new Date(job.endDate);
        const actual = new Date(now);
        planned.setHours(0, 0, 0, 0);
        actual.setHours(0, 0, 0, 0);
        if (actual.getTime() > planned.getTime()) {
          try {
            const { calculateCascade } = await import("@/lib/cascade");
            const allPlotJobs = await prisma.job.findMany({
              where: { plotId: job.plotId, status: { not: "ON_HOLD" } },
              orderBy: { sortOrder: "asc" },
            });
            const allOrders = await prisma.materialOrder.findMany({
              where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
            });
            const cascadeResult = calculateCascade(
              jobId,
              actual,
              allPlotJobs.map((j) => ({
                id: j.id,
                name: j.name,
                startDate: j.startDate,
                endDate: j.endDate,
                sortOrder: j.sortOrder,
                status: j.status,
                parentId: j.parentId ?? null,
              })),
              allOrders.map((o) => ({
                id: o.id,
                jobId: o.jobId,
                dateOfOrder: o.dateOfOrder,
                expectedDeliveryDate: o.expectedDeliveryDate,
                status: o.status,
              })),
            );
            const jobMap = new Map(allPlotJobs.map((j) => [j.id, j]));
            await Promise.all([
              ...cascadeResult.jobUpdates
                .filter((u) => u.jobId !== jobId)
                .map((u) => {
                  const current = jobMap.get(u.jobId);
                  return prisma.job.update({
                    where: { id: u.jobId },
                    data: {
                      startDate: u.newStart,
                      endDate: u.newEnd,
                      ...(!current?.originalStartDate && current?.startDate
                        ? { originalStartDate: current.startDate }
                        : {}),
                      ...(!current?.originalEndDate && current?.endDate
                        ? { originalEndDate: current.endDate }
                        : {}),
                    },
                  });
                }),
              ...cascadeResult.orderUpdates.map((u) =>
                prisma.materialOrder.update({
                  where: { id: u.orderId },
                  data: {
                    dateOfOrder: u.newOrderDate,
                    expectedDeliveryDate: u.newDeliveryDate,
                  },
                }),
              ),
            ]);
            const { recomputeParentFromChildren } = await import("@/lib/parent-job");
            const parentIds = new Set<string>();
            for (const u of cascadeResult.jobUpdates) {
              const j = jobMap.get(u.jobId);
              if (j?.parentId) parentIds.add(j.parentId);
            }
            await Promise.all(
              Array.from(parentIds).map((pid) =>
                recomputeParentFromChildren(prisma, pid),
              ),
            );
            await prisma.eventLog.create({
              data: {
                type: "SCHEDULE_CASCADED",
                description: `Auto-cascaded ${cascadeResult.jobUpdates.length - 1} downstream job(s) — "${job.name}" finished ${cascadeResult.deltaDays} working day(s) late (bulk complete)`,
                siteId,
                plotId: job.plotId,
                jobId,
                userId: session.user.id,
                delayReasonType: "OTHER",
              },
            });
          } catch (cascadeErr) {
            console.error("[BULK-STATUS] Auto-cascade on late complete failed:", cascadeErr);
          }
        }
      }

      // Recalculate plot buildCompletePercent — centralised in
      // recomputePlotPercent so every mutation site uses the same
      // formula (May 2026 audit).
      {
        const { recomputePlotPercent } = await import("@/lib/plot-percent");
        await recomputePlotPercent(prisma, job.plotId);
      }

      // Fire-and-forget push notifications — mirrors /api/jobs/[id]/actions
      if (action === "start" && job.assignedToId && job.assignedToId !== session.user.id) {
        sendPushToUser(job.assignedToId, "JOBS_STARTING_TODAY", {
          title: "Job Started",
          body: `"${job.name}" has been started (bulk)`,
          url: `/jobs/${jobId}`,
          tag: `job-started-${jobId}`,
        }).catch(() => {});
      }
      if (action === "complete") {
        // Notify next-stage assignee that predecessor is done
        const allPlotJobs = await prisma.job.findMany({
          where: { plotId: job.plotId },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, sortOrder: true, assignedToId: true },
        });
        const nextSortOrder = allPlotJobs
          .filter((j) => j.sortOrder > job.sortOrder)
          .reduce((min, j) => (j.sortOrder < min ? j.sortOrder : min), Infinity);
        if (nextSortOrder !== Infinity) {
          const nextJobs = allPlotJobs.filter((j) => j.sortOrder === nextSortOrder);
          for (const nj of nextJobs) {
            if (nj.assignedToId) {
              // Dedupe per (plot, recipient) so the same person doesn't
              // get spammed when a chain of sibling jobs all complete in
              // the same batch on the same plot.
              const dedupeKey = `${job.plotId}|${nj.assignedToId}`;
              if (nextStagePushKeysFired.has(dedupeKey)) continue;
              nextStagePushKeysFired.add(dedupeKey);
              sendPushToUser(nj.assignedToId, "NEXT_STAGE_READY", {
                title: "Next Stage Ready",
                body: `"${job.name}" is complete — "${nj.name}" can begin`,
                url: `/jobs/${nj.id}`,
                tag: `next-stage-${nj.id}`,
              }).catch(() => {});
            }
          }
        }
      }

      // Auto-reorder on start (simplified — trigger template orders)
      if (action === "start" && job.stageCode) {
        try {
          const templateJobs = await prisma.templateJob.findMany({
            where: {
              OR: [
                { stageCode: job.stageCode },
                { name: job.name },
              ],
            },
            include: {
              orders: {
                include: { items: true },
              },
            },
          });

          for (const tj of templateJobs) {
            for (const to of tj.orders) {
              if (!to.supplierId || to.items.length === 0) continue;

              const existingOrder = await prisma.materialOrder.findFirst({
                where: { jobId, supplierId: to.supplierId, automated: true },
              });
              if (existingOrder) continue;

              let expectedDelivery: Date | null = null;
              if (to.leadTimeAmount && to.leadTimeUnit) {
                expectedDelivery = new Date(now.getTime());
                const days =
                  to.leadTimeUnit === "weeks"
                    ? to.leadTimeAmount * 7
                    : to.leadTimeAmount;
                expectedDelivery.setDate(expectedDelivery.getDate() + days);
                // Snap result to a working day — same as
                // apply-template-helpers / actions/route.ts auto-reorder.
                // Suppliers don't deliver on weekends regardless of
                // lead-time arithmetic.
                expectedDelivery = snapToWorkingDay(expectedDelivery, "forward");
              }

              await prisma.materialOrder.create({
                data: {
                  supplierId: to.supplierId,
                  jobId,
                  automated: true,
                  status: "PENDING",
                  itemsDescription: to.itemsDescription,
                  expectedDeliveryDate: expectedDelivery,
                  leadTimeDays: to.leadTimeAmount
                    ? to.leadTimeUnit === "weeks"
                      ? to.leadTimeAmount * 7
                      : to.leadTimeAmount
                    : null,
                  orderItems: {
                    create: to.items.map((item) => ({
                      name: item.name,
                      quantity: item.quantity,
                      unit: item.unit,
                      unitCost: item.unitCost,
                      totalCost: item.quantity * item.unitCost,
                    })),
                  },
                },
              });
            }
          }
        } catch (e) {
          console.error("Auto-reorder error in bulk:", e);
        }
      }

      results.push({ jobId, jobName: job.name, newStatus: newStatus });
    } catch (e) {
      console.error(`Bulk action error for job ${jobId}:`, e);
    }
  }

  return NextResponse.json({ updated: results.length, results });
}
