import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getServerCurrentDate } from "@/lib/dev-date";
import { sessionHasPermission } from "@/lib/permissions";
import type { JobStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const ACTION_STATUS_MAP: Record<string, JobStatus> = {
  start: "IN_PROGRESS",
  complete: "COMPLETED",
};

// POST /api/sites/[id]/bulk-status — bulk start/complete jobs
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: siteId } = await params;
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

  // Process sequentially to respect Supabase connection limits
  for (const jobId of jobIds) {
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
        updateData.actualEndDate = now;
        updateData.signedOffById = session.user.id;
        updateData.signedOffAt = now;
      }

      // Update job
      await prisma.job.update({
        where: { id: jobId },
        data: updateData,
      });

      // Progress orders: start → ORDERED; complete+signoff → DELIVERED
      if (action === "start") {
        await prisma.materialOrder.updateMany({
          where: { jobId, status: "PENDING" },
          data: { status: "ORDERED", dateOfOrder: now },
        });
      }
      if (action === "complete") {
        // Bulk-status "complete" performs sign-off in one step (sets signedOffAt above),
        // so remaining ORDERED orders are confirmed as delivered — mirrors signoff in /api/jobs/[id]/actions
        await prisma.materialOrder.updateMany({
          where: { jobId, status: "ORDERED" },
          data: { status: "DELIVERED", deliveredDate: now },
        });
      }

      // Create job action record
      await prisma.jobAction.create({
        data: {
          jobId,
          userId: session.user.id,
          action,
        },
      });

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

      // Recalculate plot buildCompletePercent — mirrors /api/jobs/[id]/actions
      const plotJobs = await prisma.job.findMany({
        where: { plotId: job.plotId },
        select: { status: true },
      });
      const total = plotJobs.length;
      const completed = plotJobs.filter((j) => j.status === "COMPLETED").length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      await prisma.plot.update({
        where: { id: job.plotId },
        data: { buildCompletePercent: pct },
      });

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
