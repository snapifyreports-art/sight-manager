import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getServerCurrentDate } from "@/lib/dev-date";
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
