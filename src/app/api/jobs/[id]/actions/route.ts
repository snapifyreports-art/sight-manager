import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getServerCurrentDate } from "@/lib/dev-date";
import { sessionHasPermission } from "@/lib/permissions";
import { recomputeParentOf } from "@/lib/parent-job";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import type { EventType, JobStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const ACTION_STATUS_MAP: Record<string, JobStatus> = {
  start: "IN_PROGRESS",
  stop: "ON_HOLD",
  complete: "COMPLETED",
};

const ACTION_EVENT_MAP: Record<string, EventType> = {
  start: "JOB_STARTED",
  stop: "JOB_STOPPED",
  complete: "JOB_COMPLETED",
  signoff: "JOB_SIGNED_OFF",
  edit: "JOB_EDITED",
  note: "JOB_EDITED",
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const { action, notes, signOffNotes, skipOrderProgression, actualStartDate } = body;

  if (!action) {
    return NextResponse.json(
      { error: "action is required (start, stop, complete, edit)" },
      { status: 400 }
    );
  }

  const existing = await prisma.job.findUnique({
    where: { id },
    include: { plot: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Site-access check — caller must have access to the job's site
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, existing.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  // Guard against double-start and double-complete
  if (action === "start" && existing.status === "IN_PROGRESS") {
    return NextResponse.json(
      { error: "Job is already in progress" },
      { status: 400 }
    );
  }
  if (action === "complete" && existing.status === "COMPLETED") {
    return NextResponse.json(
      { error: "Job is already completed" },
      { status: 400 }
    );
  }
  // Prevent completing a job that was never started
  if (action === "complete" && existing.status === "NOT_STARTED") {
    return NextResponse.json(
      { error: "Job must be started before it can be completed" },
      { status: 400 }
    );
  }

  // Signoff action: requires job to be COMPLETED already
  if (action === "signoff" && existing.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Job must be completed before it can be signed off" },
      { status: 400 }
    );
  }

  // Permission check: completing/signing off requires SIGN_OFF_JOBS
  if ((action === "complete" || action === "signoff") && !sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "SIGN_OFF_JOBS")) {
    return NextResponse.json({ error: "You do not have permission to sign off jobs" }, { status: 403 });
  }

  const now = getServerCurrentDate(req);

  try {
  // Create the job action record
  await prisma.jobAction.create({
    data: {
      jobId: id,
      userId: session.user.id,
      action,
      notes: notes || signOffNotes || null,
    },
  });

  // Update job status if applicable
  const newStatus = ACTION_STATUS_MAP[action];
  let job;

  if (newStatus) {
    // Build update data
    const updateData: Record<string, unknown> = { status: newStatus };

    // Handle start action — set actualStartDate + progress orders + clear awaitingRestart
    // Supports an optional `actualStartDate` override for backdating (late-start "Start from Original Date")
    if (action === "start" && !existing.actualStartDate) {
      const backdated = actualStartDate ? new Date(actualStartDate) : null;
      // Only accept backdates — never future dates — and never later than `now`
      updateData.actualStartDate = backdated && backdated < now ? backdated : now;
    }
    if (action === "start") {
      // Progress PENDING material orders to ORDERED — unless user chose "start anyway"
      // (user wants to handle orders themselves via Daily Brief / Orders page)
      if (!skipOrderProgression) {
        await prisma.materialOrder.updateMany({
          where: { jobId: id, status: "PENDING" },
          data: { status: "ORDERED", dateOfOrder: now },
        });
      }
      // If the plot was awaiting a restart/contractor decision, clear both flags
      if (existing.plot.awaitingRestart || existing.plot.awaitingContractorConfirmation) {
        await prisma.plot.update({
          where: { id: existing.plotId },
          data: { awaitingRestart: false, awaitingContractorConfirmation: false },
        });
      }
    }

    // Handle complete action — set end date but do NOT sign off (separate action)
    // Note: orders are NOT auto-progressed on complete — user manages delivery status
    // via the Orders page or Daily Brief
    if (action === "complete") {
      updateData.actualEndDate = now;
    }

    job = await prisma.job.update({
      where: { id },
      data: updateData,
      include: {
        plot: { include: { site: true } },
        assignedTo: true,
        _count: { select: { orders: true } },
      },
    });
  } else if (action === "signoff") {
    // Sign off a COMPLETED job — set signedOffBy, signedOffAt, signOffNotes
    job = await prisma.job.update({
      where: { id },
      data: {
        signedOffById: session.user.id,
        signedOffAt: now,
        ...(signOffNotes ? { signOffNotes } : {}),
      },
      include: {
        plot: { include: { site: true } },
        assignedTo: true,
        _count: { select: { orders: true } },
      },
    });
    // Sign-off is the explicit approval — materials are confirmed used on site
    // Progress any remaining ORDERED orders to DELIVERED
    await prisma.materialOrder.updateMany({
      where: { jobId: id, status: "ORDERED" },
      data: { status: "DELIVERED", deliveredDate: now },
    });
  } else {
    job = await prisma.job.findUnique({
      where: { id },
      include: {
        plot: { include: { site: true } },
        assignedTo: true,
        _count: { select: { orders: true } },
      },
    });
  }

  // Create event log entry
  const eventType = ACTION_EVENT_MAP[action] || "USER_ACTION";
  const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
  const actionVerb = action === "start" ? "started" : action === "stop" ? "stopped" : action === "complete" ? "completed" : action === "signoff" ? "signed off" : action === "note" ? "had a note added" : "updated";

  // For note action with notes text, include it in the event description
  const notesSuffix = action === "note" && notes ? `: "${notes.substring(0, 100)}"` : "";

  await prisma.eventLog.create({
    data: {
      type: eventType,
      description: `Job "${existing.name}" was ${actionVerb}${notesSuffix}`,
      siteId: existing.plot.siteId,
      plotId: existing.plotId,
      jobId: id,
      userId: session.user.id,
    },
  });

  // Auto-reorder: when a job starts, create draft orders from template orders.
  // Previously this loop issued 1 findFirst per template order (N+1) and 1
  // sequential create per new order. Now we fetch existing orders once, skip
  // the ones we already have, and create the rest in parallel.
  //
  // SSOT note (May 2026): the order's lead-time math now mirrors the apply-
  // template path. Order date = job start (today, since the job is starting
  // now), delivery date = today + leadTimeDays. We deliberately don't try to
  // use anchor fields here — the auto-reorder fires when the job has
  // actually started (today), so the order CANNOT be placed `dateOfOrder
  // weeks before job-start` retrospectively. Place it now, deliver it as
  // soon as the supplier can after lead time. Apply-time uses anchor-fields
  // to backdate orders into the future; this path lives in the present.
  if (action === "start" && existing.stageCode) {
    try {
      const [templateJobs, existingAutomatedOrders] = await Promise.all([
        prisma.templateJob.findMany({
          where: {
            OR: [
              { stageCode: existing.stageCode },
              { name: existing.name },
            ],
          },
          include: {
            orders: { include: { supplier: true, items: true } },
          },
        }),
        prisma.materialOrder.findMany({
          where: { jobId: id, automated: true },
          select: { supplierId: true },
        }),
      ]);

      const existingSupplierIds = new Set(existingAutomatedOrders.map((o) => o.supplierId));

      const ordersToCreate = templateJobs.flatMap((tj) =>
        tj.orders.filter(
          (to) => to.supplierId && to.items.length > 0 && !existingSupplierIds.has(to.supplierId)
        )
      );

      await Promise.all(
        ordersToCreate.map((to) => {
          // Lead-time precedence: anchor-era leadTimeAmount/leadTimeUnit
          // first, legacy deliveryWeekOffset second. Same precedence as
          // apply-template-helpers.resolveOrderDates.
          let leadTimeDays: number | null = null;
          if (to.leadTimeAmount && to.leadTimeUnit) {
            leadTimeDays = to.leadTimeUnit === "weeks"
              ? to.leadTimeAmount * 7
              : to.leadTimeAmount;
          } else if (to.deliveryWeekOffset && to.deliveryWeekOffset > 0) {
            leadTimeDays = to.deliveryWeekOffset * 7;
          }
          let expectedDelivery: Date | null = null;
          if (leadTimeDays) {
            expectedDelivery = new Date(now.getTime());
            expectedDelivery.setDate(expectedDelivery.getDate() + leadTimeDays);
          }
          return prisma.materialOrder.create({
            data: {
              supplierId: to.supplierId!,
              jobId: id,
              automated: true,
              status: "PENDING",
              itemsDescription: to.itemsDescription,
              expectedDeliveryDate: expectedDelivery,
              leadTimeDays,
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
        })
      );
    } catch (e) {
      // Don't fail the action if auto-reorder fails
      console.error("Auto-reorder error:", e);
    }
  }

  // If this job has a parent (is a sub-job), recompute parent's dates/status
  // so the parent stretches with its children and its status follows theirs
  await recomputeParentOf(prisma, id);

  // Auto-update plot buildCompletePercent when job status changes.
  // Only count LEAF jobs (jobs with no children) — parent jobs are derived
  // roll-ups, counting them would double-count the plot's true progress.
  if (action === "complete" || action === "start") {
    const plotJobs = await prisma.job.findMany({
      where: { plotId: existing.plotId, children: { none: {} } },
      select: { status: true },
    });
    const total = plotJobs.length;
    const completed = plotJobs.filter((j) => j.status === "COMPLETED").length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    await prisma.plot.update({
      where: { id: existing.plotId },
      data: { buildCompletePercent: pct },
    });
  }

  // Fire-and-forget push notification for relevant actions
  if (action === "complete" && existing.assignedToId) {
    sendPushToUser(existing.assignedToId, "JOBS_READY_FOR_SIGNOFF", {
      title: "Job Completed",
      body: `"${existing.name}" has been completed and is ready for sign-off`,
      url: `/jobs/${id}`,
      tag: `job-complete-${id}`,
    }).catch(() => {});
  }

  // Notify contractors on job start — tell them work is ready
  if (action === "start") {
    const jobContractors = await prisma.jobContractor.findMany({
      where: { jobId: id },
      select: { contact: { select: { name: true, company: true } } },
    });
    // Notify assigned internal user that job has started (they may need to coordinate)
    if (existing.assignedToId && existing.assignedToId !== session.user.id) {
      sendPushToUser(existing.assignedToId, "JOBS_STARTING_TODAY", {
        title: "Job Started",
        body: `"${existing.name}" has been started${jobContractors.length > 0 ? ` — ${jobContractors[0].contact.company || jobContractors[0].contact.name}` : ""}`,
        url: `/jobs/${id}`,
        tag: `job-started-${id}`,
      }).catch(() => {});
    }
  }

  // Push notification to next-stage contractors when a job is completed
  if (action === "complete") {
    const allPlotJobs = await prisma.job.findMany({
      where: { plotId: existing.plotId },
      orderBy: { sortOrder: "asc" },
    });
    const nextSortOrder = allPlotJobs
      .filter((j) => j.sortOrder > existing.sortOrder)
      .reduce((min, j) => (j.sortOrder < min ? j.sortOrder : min), Infinity);

    if (nextSortOrder !== Infinity) {
      const nextJobs = allPlotJobs.filter((j) => j.sortOrder === nextSortOrder);
      for (const nj of nextJobs) {
        if (nj.assignedToId) {
          sendPushToUser(nj.assignedToId, "NEXT_STAGE_READY", {
            title: "Next Stage Ready",
            body: `"${existing.name}" is complete — "${nj.name}" can begin`,
            url: `/jobs/${nj.id}`,
            tag: `next-stage-${nj.id}`,
          }).catch(() => {});
        }
      }
    }
  }

  if (action === "note" && existing.assignedToId && existing.assignedToId !== session.user.id) {
    sendPushToUser(existing.assignedToId, "NEW_NOTES_PHOTOS", {
      title: "New Note Added",
      body: `A note was added to "${existing.name}"`,
      url: `/jobs/${id}`,
      tag: `note-${id}`,
    }).catch(() => {});
  }

  // For completion or signoff: attach context for the post-completion dialog
  if ((action === "complete" || action === "signoff") && job) {
    const allPlotJobs = await prisma.job.findMany({
      where: { plotId: existing.plotId },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        name: true,
        status: true,
        sortOrder: true,
        startDate: true,
        endDate: true,
        contractors: {
          select: { contact: { select: { id: true, name: true, company: true, email: true, phone: true } } },
          orderBy: { createdAt: "asc" },
          take: 1,
        },
        assignedTo: { select: { name: true } },
      },
    });

    const nextJob = allPlotJobs.find(
      (j) => j.sortOrder > existing.sortOrder && j.status !== "COMPLETED"
    ) ?? null;

    // Fetch next job's orders if it exists
    let nextJobOrders: Array<{
      id: string;
      status: string;
      itemsDescription: string | null;
      expectedDeliveryDate: Date | null;
      supplier: { name: string; contactEmail: string | null; contactName: string | null };
    }> = [];
    if (nextJob) {
      nextJobOrders = await prisma.materialOrder.findMany({
        where: { jobId: nextJob.id },
        select: {
          id: true,
          status: true,
          itemsDescription: true,
          expectedDeliveryDate: true,
          supplier: { select: { name: true, contactEmail: true, contactName: true } },
        },
      });
    }

    // Deviation: how far ahead/behind vs original schedule
    const completedJobWithOriginal = await prisma.job.findUnique({
      where: { id },
      select: { originalEndDate: true, actualEndDate: true },
    });

    // Working-day deviation — matches the cascade engine's delta so any
    // downstream "shift programme" action applies a consistent amount.
    let daysDeviation = 0;
    if (completedJobWithOriginal?.originalEndDate && completedJobWithOriginal?.actualEndDate) {
      const { differenceInWorkingDays } = await import("@/lib/working-days");
      daysDeviation = differenceInWorkingDays(
        completedJobWithOriginal.originalEndDate,
        completedJobWithOriginal.actualEndDate
      );
    }

    const contractor = nextJob?.contractors?.[0]?.contact ?? null;

    return NextResponse.json({
      ...job,
      _completionContext: {
        daysDeviation,
        nextJob: nextJob
          ? {
              id: nextJob.id,
              name: nextJob.name,
              status: nextJob.status,
              startDate: nextJob.startDate?.toISOString() ?? null,
              endDate: nextJob.endDate?.toISOString() ?? null,
              contractorName: contractor ? contractor.company || contractor.name : null,
              contractorEmail: contractor?.email ?? null,
              contractorPhone: contractor?.phone ?? null,
              assignedToName: nextJob.assignedTo?.name ?? null,
              orders: nextJobOrders.map((o) => ({
                id: o.id,
                status: o.status,
                itemsDescription: o.itemsDescription,
                expectedDeliveryDate: o.expectedDeliveryDate?.toISOString() ?? null,
                supplierName: o.supplier.name,
                supplierEmail: o.supplier.contactEmail,
                supplierContactName: o.supplier.contactName,
              })),
            }
          : null,
        plotId: existing.plotId,
      },
    });
  }

  return NextResponse.json(job);
  } catch (err) {
    return apiError(err, "Failed to update job");
  }
}
