import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getServerCurrentDate } from "@/lib/dev-date";
import { sessionHasPermission } from "@/lib/permissions";
import { canAccessSite, getUserSiteIds } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { enforceOrderInvariants } from "@/lib/order-invariants";
import { addWorkingDays, differenceInWorkingDays } from "@/lib/working-days";
import { calculateCascade } from "@/lib/cascade";
import { openOrUpdateLateness } from "@/lib/lateness-event";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.materialOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      contact: true,
      orderItems: true,
      job: {
        include: {
          plot: { include: { site: true } },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Site-access guard. Orders are bound to a site either via the job's
  // plot or directly (for plot-less / site-level orders). Either way the
  // caller must be able to see that site. 404 not 403 so we don't leak
  // existence of the order.
  const orderSiteId = order.job?.plot.siteId ?? order.siteId ?? null;
  if (!orderSiteId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      orderSiteId,
    ))
  ) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(order);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.materialOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      job: { include: { plot: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Site-access guard for the SOURCE order. Previously only checked on
  // cross-site jobId reassignment, so a same-job PUT (status flip,
  // supplier change, dates edit) bypassed access checks entirely. 404
  // instead of 403 so we don't leak existence to a caller without
  // rights.
  const sourceSiteId = existing.job?.plot.siteId ?? existing.siteId ?? null;
  if (!sourceSiteId) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      sourceSiteId,
    ))
  ) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Guard cross-site job reassignment — separate concern, must also be
  // able to reach the TARGET site.
  if (body.jobId !== undefined && body.jobId !== existing.jobId) {
    const targetJob = await prisma.job.findUnique({
      where: { id: body.jobId },
      select: { plot: { select: { siteId: true } } },
    });
    if (!targetJob) {
      return NextResponse.json({ error: "Target job not found" }, { status: 404 });
    }
    const accessibleSites = await getUserSiteIds(
      session.user.id,
      (session.user as { role: string }).role,
    );
    if (accessibleSites !== null) {
      if (
        !accessibleSites.includes(sourceSiteId) ||
        !accessibleSites.includes(targetJob.plot.siteId)
      ) {
        return NextResponse.json(
          { error: "You do not have access to both the source and target site" },
          { status: 403 }
        );
      }
    }
  }

  const data: Record<string, unknown> = {};

  if (body.supplierId !== undefined) data.supplierId = body.supplierId;
  if (body.jobId !== undefined) data.jobId = body.jobId;
  if (body.contactId !== undefined) data.contactId = body.contactId || null;
  if (body.orderDetails !== undefined)
    data.orderDetails = body.orderDetails || null;
  if (body.orderType !== undefined) data.orderType = body.orderType || null;
  if (body.expectedDeliveryDate !== undefined) {
    data.expectedDeliveryDate = body.expectedDeliveryDate
      ? new Date(body.expectedDeliveryDate)
      : null;
  }
  if (body.leadTimeDays !== undefined) {
    if (!body.leadTimeDays) {
      data.leadTimeDays = null;
    } else {
      // Guard NaN — a malformed body shouldn't poison the DB. parseInt
      // coerces "" → NaN; falsy check above handles "" but not "abc".
      const n = parseInt(String(body.leadTimeDays), 10);
      data.leadTimeDays = Number.isFinite(n) && n >= 0 ? n : null;
    }
  }
  if (body.itemsDescription !== undefined) data.itemsDescription = body.itemsDescription || null;

  // Accept explicit deliveredDate
  if (body.deliveredDate !== undefined) {
    data.deliveredDate = body.deliveredDate
      ? new Date(body.deliveredDate)
      : null;
  }

  // Accept explicit dateOfOrder
  if (body.dateOfOrder !== undefined) {
    data.dateOfOrder = body.dateOfOrder
      ? new Date(body.dateOfOrder)
      : null;
  }

  // Handle status changes
  if (body.status !== undefined) {
    // PENDING → DELIVERED previously returned 400. But a ton of UI surfaces
    // ("Confirm Delivery" buttons in Daily Brief / Walkthrough / Programme)
    // let users jump straight from PENDING to DELIVERED — the action reads as
    // "this order arrived on site today" and nobody cares whether we ticked
    // Sent earlier. The block caused silent 400s: user thought they confirmed
    // delivery, system stayed PENDING, Daily Brief still showed "1 order not
    // sent" and "0 awaiting delivery" forever. Now we auto-bridge: mark the
    // order as placed + delivered in one call, server-side, so the state
    // machine stays consistent without blocking the user.
    const autoBridgePendingToDelivered =
      existing.status === "PENDING" && body.status === "DELIVERED";

    data.status = body.status;

    // Auto-set dateOfOrder when status changes to ORDERED (if not explicitly set)
    // Mirrors the behavior of start → PENDING→ORDERED auto-progression
    if (
      body.status === "ORDERED" &&
      existing.status !== "ORDERED" &&
      !existing.dateOfOrder &&
      body.dateOfOrder === undefined
    ) {
      data.dateOfOrder = getServerCurrentDate(req);
    }

    // Auto-set deliveredDate when status changes to DELIVERED (if not explicitly set)
    if (
      body.status === "DELIVERED" &&
      existing.status !== "DELIVERED" &&
      !body.deliveredDate
    ) {
      data.deliveredDate = getServerCurrentDate(req);
    }

    // Bridge case: if user jumped PENDING → DELIVERED, also back-fill
    // dateOfOrder so reports and supplier performance don't see a null.
    if (autoBridgePendingToDelivered && !existing.dateOfOrder && body.dateOfOrder === undefined) {
      data.dateOfOrder = getServerCurrentDate(req);
    }
  }

  // (#179) Enforce date invariants — the math should be the math.
  // Before this, the PENDING→DELIVERED bridge could leave the order
  // with deliveredDate=today but expectedDeliveryDate weeks in the
  // future (set previously by cascade), producing "delivered 8 months
  // early" artifacts in reports. The helper clamps so the date
  // ordering is always consistent.
  const today = getServerCurrentDate(req);
  const invariantPatch = enforceOrderInvariants(
    {
      dateOfOrder: existing.dateOfOrder,
      expectedDeliveryDate: existing.expectedDeliveryDate,
      deliveredDate: existing.deliveredDate,
      leadTimeDays: existing.leadTimeDays,
    },
    {
      dateOfOrder: data.dateOfOrder as Date | undefined,
      expectedDeliveryDate: data.expectedDeliveryDate as Date | null | undefined,
      deliveredDate: data.deliveredDate as Date | null | undefined,
      status: data.status as string | undefined,
      leadTimeDays: existing.leadTimeDays,
    },
    today,
  );
  Object.assign(data, invariantPatch);

  try {
    // Create event log for status changes
    if (body.status !== undefined && body.status !== existing.status) {
      const eventType =
        body.status === "DELIVERED"
          ? "DELIVERY_CONFIRMED"
          : body.status === "CANCELLED"
            ? "ORDER_CANCELLED"
            : "ORDER_PLACED";

      const orderLabel = existing.job?.name ?? "one-off order";
      await prisma.eventLog.create({
        data: {
          type: eventType,
          description: `[${existing.supplier.name}] Order for ${orderLabel} ${body.status === "DELIVERED" ? "delivery confirmed" : `status changed to ${body.status}`}`,
          siteId: existing.job?.plot.siteId ?? existing.siteId ?? null,
          plotId: existing.job?.plotId ?? existing.plotId ?? null,
          jobId: existing.jobId,
          userId: session.user?.id || null,
        },
      });
    }

    // (#191) Resolve any open lateness for this order when it reaches
    // a non-late terminal state. PENDING → anything-else resolves the
    // SEND_OVERDUE bucket; ORDERED → DELIVERED resolves DELIVERY_OVERDUE.
    if (body.status !== undefined && body.status !== existing.status) {
      const movedFromPending = existing.status === "PENDING" && body.status !== "PENDING";
      const movedToDelivered = body.status === "DELIVERED";
      if (movedFromPending || movedToDelivered) {
        const { resolveLateness } = await import("@/lib/lateness-event");
        await resolveLateness(prisma, "order", id, today).catch((err) =>
          console.error("[orders PUT] resolveLateness failed:", err),
        );
      }
    }

    const order = await prisma.materialOrder.update({
      where: { id },
      data,
      include: {
        supplier: true,
        contact: true,
        orderItems: true,
        job: {
          include: {
            plot: { include: { site: true } },
          },
        },
      },
    });

    // (#191 phase 5) Manager-driven "Change Delivery Date" workflow.
    // When the delivery date is pushed LATER than it was and the order
    // is attached to a (non-completed) job, the system always:
    //   1. Records a LatenessEvent attributed to the supplier so the
    //      delay is captured in reporting + analytics. This fires
    //      regardless of which UI surface initiated the edit (inline
    //      editor, Daily Brief quick-edit, follow-up dialog, etc.) so
    //      no lateness slips through unrecorded.
    //   2. If the caller passed `latenessImpact`, ALSO applies the
    //      manager's downstream impact choice:
    //        PUSH_JOB   — shift job start to new_delivery + 1 WD and
    //                     cascade everything downstream by that delta
    //        EXPAND_JOB — keep job start, extend job end by delta WD,
    //                     shift successors by the same delta
    //        LEAVE_AS_IS — record lateness only, leave schedule alone
    //
    // Edge cases handled:
    //   - oldDelivery null            → no lateness event; the order
    //                                   didn't have a promise before.
    //   - new <= old                  → delivery is being pulled
    //                                   forward; not lateness, skip.
    //   - completed/cancelled order   → invalid; skip impact.
    //   - one-off order (no jobId)    → record lateness, but the
    //                                   PUSH_JOB / EXPAND_JOB choices
    //                                   have nothing to apply.
    const latenessImpact = body.latenessImpact as
      | {
          choice: "PUSH_JOB" | "EXPAND_JOB" | "LEAVE_AS_IS";
          reasonNote?: string;
        }
      | undefined;

    if (data.expectedDeliveryDate && existing.expectedDeliveryDate) {
      const oldDelivery = new Date(existing.expectedDeliveryDate);
      oldDelivery.setHours(0, 0, 0, 0);
      const newDelivery = new Date(data.expectedDeliveryDate as Date);
      newDelivery.setHours(0, 0, 0, 0);
      const deltaWD = differenceInWorkingDays(newDelivery, oldDelivery);

      // Auto-fire on already-late orders (UX surfaces don't always show
      // the picker, but the lateness still has to land). Pre-emptive
      // pushes (old >= today) only fire when the manager went through
      // the InlineOrderEditor's downstream-impact picker — passing
      // latenessImpact signals deliberate intent to record this as
      // lateness rather than just a quiet reschedule.
      const isAlreadyLate = oldDelivery < today;
      const shouldRecordLateness =
        deltaWD > 0 &&
        existing.status !== "DELIVERED" &&
        existing.status !== "CANCELLED" &&
        (isAlreadyLate || latenessImpact !== undefined);

      if (shouldRecordLateness) {
        const siteId = existing.job?.plot.siteId ?? existing.siteId ?? null;
        if (siteId) {
          // 1. Open or update the LatenessEvent on this order. Attributed
          //    to supplier if there's a contact mapping (order.contactId);
          //    note records the manager's reason if provided.
          //
          // wentLateOn convention matches the cron: original-delivery + 1
          // day. For pre-emptive pushes where old is still in the future,
          // use today+1 day so the unique key doesn't clash with a future
          // cron run that opens its own (oldDelivery+1) event.
          const wentLateOn = new Date(isAlreadyLate ? oldDelivery : today);
          wentLateOn.setHours(0, 0, 0, 0);
          wentLateOn.setDate(wentLateOn.getDate() + 1);

          await openOrUpdateLateness(prisma, {
            kind: "ORDER_DELIVERY_OVERDUE",
            targetType: "order",
            targetId: id,
            siteId,
            plotId: existing.job?.plotId ?? existing.plotId ?? null,
            jobId: existing.jobId,
            orderId: id,
            wentLateOn,
            daysLate: deltaWD,
            reasonCode: "MATERIAL_LATE",
            reasonNote: latenessImpact?.reasonNote ?? null,
            attributedContactId: existing.contactId ?? null,
            recordedById: session.user?.id ?? null,
          }).catch((err) =>
            console.error("[orders PUT] openOrUpdateLateness failed:", err),
          );

          // 2. Apply the manager's downstream impact decision (only
          //    when latenessImpact was explicitly passed; surfaces
          //    that don't show the picker leave the schedule alone).
          if (
            latenessImpact &&
            existing.jobId &&
            existing.job &&
            (latenessImpact.choice === "PUSH_JOB" ||
              latenessImpact.choice === "EXPAND_JOB") &&
            existing.job.startDate &&
            existing.job.endDate
          ) {
            const jobStart = new Date(existing.job.startDate);
            const jobEnd = new Date(existing.job.endDate);
            jobStart.setHours(0, 0, 0, 0);
            jobEnd.setHours(0, 0, 0, 0);

            if (latenessImpact.choice === "PUSH_JOB") {
              // Push so the job starts the working day after the new
              // delivery. New end preserves the job's working-day duration.
              const desiredNewStart = addWorkingDays(newDelivery, 1);
              const startDelta = differenceInWorkingDays(
                desiredNewStart,
                jobStart,
              );
              if (startDelta !== 0) {
                const newJobEnd = addWorkingDays(jobEnd, startDelta);

                // Reuse the existing cascade engine — passes the new end
                // date for the trigger job; engine computes the WD delta
                // and shifts trigger + successors uniformly.
                const allPlotJobs = await prisma.job.findMany({
                  where: { plotId: existing.job.plotId, status: { not: "ON_HOLD" } },
                  orderBy: { sortOrder: "asc" },
                });
                const allOrders = await prisma.materialOrder.findMany({
                  where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
                });
                const cascade = calculateCascade(
                  existing.jobId,
                  newJobEnd,
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

                // Apply only the job + order updates that don't conflict
                // — if any successor would land in the past we skip the
                // cascade and log a warning; the lateness event is still
                // recorded and the manager can re-trigger via the
                // standard cascade UI.
                if (cascade.conflicts.length === 0) {
                  const jobMap = new Map(allPlotJobs.map((j) => [j.id, j]));
                  await Promise.all([
                    ...cascade.jobUpdates.map((u) => {
                      const cur = jobMap.get(u.jobId);
                      return prisma.job.update({
                        where: { id: u.jobId },
                        data: {
                          startDate: u.newStart,
                          endDate: u.newEnd,
                          ...(!cur?.originalStartDate && cur?.startDate
                            ? { originalStartDate: cur.startDate }
                            : {}),
                          ...(!cur?.originalEndDate && cur?.endDate
                            ? { originalEndDate: cur.endDate }
                            : {}),
                        },
                      });
                    }),
                    ...cascade.orderUpdates
                      // Don't shift the order we just updated — it has
                      // its new delivery date already.
                      .filter((u) => u.orderId !== id)
                      .map((u) =>
                        prisma.materialOrder.update({
                          where: { id: u.orderId },
                          data: {
                            dateOfOrder: u.newOrderDate,
                            expectedDeliveryDate: u.newDeliveryDate,
                          },
                        }),
                      ),
                  ]);

                  // Parent rollups
                  const { recomputeParentFromChildren } = await import(
                    "@/lib/parent-job"
                  );
                  const parentIds = new Set<string>();
                  for (const u of cascade.jobUpdates) {
                    const j = jobMap.get(u.jobId);
                    if (j?.parentId) parentIds.add(j.parentId);
                  }
                  await Promise.all(
                    Array.from(parentIds).map((pid) =>
                      recomputeParentFromChildren(prisma, pid),
                    ),
                  );

                  await prisma.eventLog
                    .create({
                      data: {
                        type: "SCHEDULE_CASCADED",
                        description: `Delivery push → cascade: ${cascade.deltaDays > 0 ? "+" : ""}${cascade.deltaDays} WD, ${cascade.jobUpdates.length} jobs shifted`,
                        siteId,
                        plotId: existing.job.plotId,
                        jobId: existing.jobId,
                        userId: session.user?.id ?? null,
                      },
                    })
                    .catch(() => {});
                }
              }
            } else if (latenessImpact.choice === "EXPAND_JOB") {
              // Keep trigger start, extend trigger end by deltaWD.
              // Successors and their PENDING orders shift by deltaWD.
              //
              // (May 2026 audit FC-P0 / B-9) Filter parent jobs out of
              // the successor shift. Parent jobs are derived rollups —
              // calculateCascade explicitly excludes them and re-derives
              // them from children afterward; we mirror that contract
              // here. Pre-fix parents got a direct date update, then
              // `recomputeParentFromChildren` ran below and overwrote
              // — wasteful AND meant the cascade engine's I6 parent-as-
              // aggregate invariant was breached for an instant. Cheaper
              // and cleaner to filter up-front.
              const newJobEnd = addWorkingDays(jobEnd, deltaWD);
              const allPlotJobs = await prisma.job.findMany({
                where: {
                  plotId: existing.job.plotId,
                  status: { not: "ON_HOLD" },
                },
                orderBy: { sortOrder: "asc" },
              });
              const parentIdsForExclusion = new Set<string>();
              for (const j of allPlotJobs) {
                if (j.parentId) parentIdsForExclusion.add(j.parentId);
              }
              const trigger = allPlotJobs.find((j) => j.id === existing.jobId);
              if (trigger) {
                const successors = allPlotJobs.filter(
                  (j) =>
                    j.id !== existing.jobId &&
                    j.status !== "COMPLETED" &&
                    !parentIdsForExclusion.has(j.id) && // skip parent aggregates
                    j.sortOrder > trigger.sortOrder &&
                    j.startDate &&
                    j.endDate,
                );
                const allSuccessorOrders = await prisma.materialOrder.findMany({
                  where: {
                    jobId: { in: successors.map((j) => j.id) },
                    status: "PENDING",
                  },
                });

                await Promise.all([
                  // Extend trigger end only — start stays.
                  // (originalStartDate/EndDate are NOT NULL since the May
                  // 2026 audit so we don't need to backfill them here.)
                  prisma.job.update({
                    where: { id: existing.jobId },
                    data: { endDate: newJobEnd },
                  }),
                  // Shift successors by deltaWD (start + end).
                  ...successors.map((j) =>
                    prisma.job.update({
                      where: { id: j.id },
                      data: {
                        startDate: addWorkingDays(j.startDate!, deltaWD),
                        endDate: addWorkingDays(j.endDate!, deltaWD),
                      },
                    }),
                  ),
                  // Shift pending orders on successors.
                  ...allSuccessorOrders.map((o) =>
                    prisma.materialOrder.update({
                      where: { id: o.id },
                      data: {
                        dateOfOrder: addWorkingDays(o.dateOfOrder, deltaWD),
                        expectedDeliveryDate: o.expectedDeliveryDate
                          ? addWorkingDays(o.expectedDeliveryDate, deltaWD)
                          : null,
                      },
                    }),
                  ),
                ]);

                // Parent rollups affected by either trigger or successors.
                const { recomputeParentFromChildren } = await import(
                  "@/lib/parent-job"
                );
                const parentIds = new Set<string>();
                if (trigger.parentId) parentIds.add(trigger.parentId);
                for (const s of successors) {
                  if (s.parentId) parentIds.add(s.parentId);
                }
                await Promise.all(
                  Array.from(parentIds).map((pid) =>
                    recomputeParentFromChildren(prisma, pid),
                  ),
                );

                await prisma.eventLog
                  .create({
                    data: {
                      type: "SCHEDULE_CASCADED",
                      description: `Delivery push → expand job: end +${deltaWD} WD, ${successors.length} successors shifted`,
                      siteId,
                      plotId: existing.job.plotId,
                      jobId: existing.jobId,
                      userId: session.user?.id ?? null,
                    },
                  })
                  .catch(() => {});
              }
            }
          }

          // Audit row for the delivery push so the timeline shows
          // "manager pushed delivery and chose X" (or just "pushed
          // delivery") alongside the LATENESS_OPENED row above.
          await prisma.eventLog
            .create({
              data: {
                type: "ORDER_PLACED",
                description: `Delivery date changed to ${newDelivery.toISOString().slice(0, 10)} (+${deltaWD} WD)${latenessImpact ? `. Impact: ${latenessImpact.choice}.` : "."}`,
                siteId,
                plotId: existing.job?.plotId ?? existing.plotId ?? null,
                jobId: existing.jobId,
                userId: session.user?.id ?? null,
                delayReasonType: "MATERIAL_LATE",
              },
            })
            .catch(() => {});
        }
      }
    }

    // (May 2026 audit follow-up to #152) Per-site push on delivery
    // confirmation — site assignee + watchers + execs get notified
    // that materials are on site. Best-effort; failure here doesn't
    // fail the order update.
    if (
      body.status === "DELIVERED" &&
      existing.status !== "DELIVERED"
    ) {
      const targetSiteId = existing.job?.plot.siteId ?? existing.siteId;
      if (targetSiteId) {
        const orderLabel = existing.job?.name ?? "one-off order";
        const { sendPushToSiteAudience } = await import("@/lib/push");
        void sendPushToSiteAudience(targetSiteId, "DELIVERY_CONFIRMED", {
          title: "📦 Delivery confirmed",
          body: `${existing.supplier.name}: ${orderLabel}`,
          url: `/orders?orderId=${id}`,
          tag: `delivery-${id}`,
        }).catch((err) => {
          console.warn("[order-update] sendPushToSiteAudience failed:", err);
        });
      }
    }

    return NextResponse.json(order);
  } catch (err) {
    return apiError(err, "Failed to update order");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "MANAGE_ORDERS")) {
    return NextResponse.json({ error: "You do not have permission to delete orders" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.materialOrder.findUnique({
    where: { id },
    include: {
      supplier: true,
      job: { include: { plot: true } },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  try {
    await prisma.eventLog.create({
      data: {
        type: "ORDER_CANCELLED",
        description: `[${existing.supplier.name}] Order for ${existing.job?.name ?? "one-off order"} was deleted`,
        siteId: existing.job?.plot.siteId ?? existing.siteId ?? null,
        plotId: existing.job?.plotId ?? existing.plotId ?? null,
        jobId: existing.jobId,
        userId: session.user?.id || null,
      },
    });

    await prisma.materialOrder.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete order");
  }
}
