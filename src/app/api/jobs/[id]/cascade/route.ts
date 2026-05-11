import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCascade } from "@/lib/cascade";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * Cascade endpoint. See docs/cascade-spec.md for the full contract.
 *
 * POST  — preview the cascade (no DB writes). Returns jobUpdates, orderUpdates,
 *         conflicts, and deltaDays (in working days).
 * PUT   — apply the cascade. Returns a 409 if there are conflicts unless the
 *         caller passes `force: true`.
 *
 * The trigger job is handled uniformly with downstream jobs — calculateCascade
 * returns an updates list that includes the trigger. This fixes the prior bug
 * where the trigger's end was set to the raw client value while its start was
 * recomputed separately, causing duration drift.
 */

function buildCascadeArgs(allPlotJobs: Array<{ id: string; name: string; startDate: Date | null; endDate: Date | null; sortOrder: number; status: string; parentId?: string | null }>, allOrders: Array<{ id: string; jobId: string | null; dateOfOrder: Date; expectedDeliveryDate: Date | null; status: string }>) {
  return {
    jobs: allPlotJobs.map((j) => ({
      id: j.id,
      name: j.name,
      startDate: j.startDate,
      endDate: j.endDate,
      sortOrder: j.sortOrder,
      status: j.status,
      // Pass parentId so the cascade engine can treat parent stages as
      // aggregates (re-derived from children) rather than independently
      // shifted jobs. Keith Apr 2026: Brickwork parent kept flagging
      // "would start in the past" because the engine was shifting it
      // by the full -N WD delta from its own current start.
      parentId: j.parentId ?? null,
    })),
    orders: allOrders.map((o) => ({
      id: o.id,
      jobId: o.jobId,
      dateOfOrder: o.dateOfOrder,
      expectedDeliveryDate: o.expectedDeliveryDate,
      status: o.status,
    })),
  };
}

// POST /api/jobs/[id]/cascade — preview cascade effects
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
  const { newEndDate, assumeOrdersSent } = body as {
    newEndDate: string;
    assumeOrdersSent?: string[];
  };

  if (!newEndDate) {
    return NextResponse.json({ error: "newEndDate is required" }, { status: 400 });
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: { plot: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const allPlotJobs = await prisma.job.findMany({
    where: { plotId: job.plotId, status: { not: "ON_HOLD" } },
    orderBy: { sortOrder: "asc" },
  });
  const allOrders = await prisma.materialOrder.findMany({
    where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
    include: { supplier: { select: { name: true } } },
  });

  const { jobs, orders } = buildCascadeArgs(allPlotJobs, allOrders);
  const result = calculateCascade(
    id,
    new Date(newEndDate),
    jobs,
    orders,
    new Set(assumeOrdersSent ?? []),
  );

  // (#167) Enrich order_in_past conflicts with supplier name so the
  // "Start anyway" UI can name the supplier it's about to flip to SENT.
  const orderById = new Map(allOrders.map((o) => [o.id, o]));
  const enrichedConflicts = result.conflicts.map((c) => {
    if (c.kind !== "order_in_past" || !c.orderId) return c;
    const o = orderById.get(c.orderId);
    return o ? { ...c, supplierName: o.supplier?.name } : c;
  });

  return NextResponse.json({
    preview: true,
    ...JSON.parse(JSON.stringify({ ...result, conflicts: enrichedConflicts })),
  });
}

// PUT /api/jobs/[id]/cascade — apply the cascade
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
  const { newEndDate, confirm, force, assumeOrdersSent } = body as {
    newEndDate: string;
    confirm: boolean;
    force?: boolean;
    assumeOrdersSent?: string[];
  };

  if (!newEndDate || !confirm) {
    return NextResponse.json(
      { error: "newEndDate and confirm: true are required" },
      { status: 400 }
    );
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: { plot: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const allPlotJobs = await prisma.job.findMany({
    where: { plotId: job.plotId, status: { not: "ON_HOLD" } },
    orderBy: { sortOrder: "asc" },
  });
  const allOrders = await prisma.materialOrder.findMany({
    where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
  });

  const overrideOrderIds = new Set(assumeOrdersSent ?? []);
  const { jobs: cascadeJobs, orders: cascadeOrders } = buildCascadeArgs(allPlotJobs, allOrders);
  const result = calculateCascade(
    id,
    new Date(newEndDate),
    cascadeJobs,
    cascadeOrders,
    overrideOrderIds,
  );

  // I7: block the apply if there are conflicts unless force=true.
  if (result.conflicts.length > 0 && !force) {
    return NextResponse.json(
      {
        error: "Cascade would cause conflicts",
        conflicts: JSON.parse(JSON.stringify(result.conflicts)),
        deltaDays: result.deltaDays,
      },
      { status: 409 }
    );
  }

  try {
    // Build a lookup so we can preserve originalStart/End on first move (I9).
    // `allPlotJobs` was already fetched with parentId in scope — use it
    // instead of issuing one findUnique per updated job (previously N+1).
    const jobMap = new Map(allPlotJobs.map((j) => [j.id, j]));

    // (#167) "Start anyway" override — flip the supplied orders to ORDERED
    // with dateOfOrder=today before applying the cascade. Only flip orders
    // currently PENDING — anything else is already past the gate.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overriddenOrders = allOrders.filter(
      (o) => overrideOrderIds.has(o.id) && o.status === "PENDING",
    );

    // Run job + order updates concurrently (both resolve against the same
    // plot, so there's no cross-write hazard worth a transaction).
    await Promise.all([
      ...result.jobUpdates.map((update) => {
        const current = jobMap.get(update.jobId);
        return prisma.job.update({
          where: { id: update.jobId },
          data: {
            startDate: update.newStart,
            endDate: update.newEnd,
            ...(!current?.originalStartDate && current?.startDate
              ? { originalStartDate: current.startDate }
              : {}),
            ...(!current?.originalEndDate && current?.endDate
              ? { originalEndDate: current.endDate }
              : {}),
          },
        });
      }),
      ...result.orderUpdates.map((update) =>
        prisma.materialOrder.update({
          where: { id: update.orderId },
          data: {
            dateOfOrder: update.newOrderDate,
            expectedDeliveryDate: update.newDeliveryDate,
          },
        })
      ),
      ...overriddenOrders.map((o) =>
        prisma.materialOrder.update({
          where: { id: o.id },
          data: { status: "ORDERED", dateOfOrder: today },
        })
      ),
    ]);

    // I6: parent-stage rollup — recompute any parent whose children moved.
    // Pull parentIds from the already-loaded jobMap (no extra queries).
    const { recomputeParentFromChildren } = await import("@/lib/parent-job");
    const parentIds = new Set<string>();
    for (const update of result.jobUpdates) {
      const j = jobMap.get(update.jobId);
      if (j?.parentId) parentIds.add(j.parentId);
    }
    // Recompute parents concurrently — each call reads its own children, but
    // different parents don't overlap.
    await Promise.all(
      Array.from(parentIds).map((pid) => recomputeParentFromChildren(prisma, pid))
    );

    // (#180) Defensive plot-percent recompute — cascade only changes
    // dates, not statuses, so the percent shouldn't change. But if a
    // job's endDate moves across today and a downstream watcher reads
    // a derived state from it (e.g. status auto-flips somewhere we
    // haven't audited), the cache could drift. Match the pattern used
    // by /api/jobs/[id]/delay and bulk-delay.
    {
      const { recomputePlotPercent } = await import("@/lib/plot-percent");
      await recomputePlotPercent(prisma, job.plotId);
    }

    await prisma.eventLog.create({
      data: {
        type: "SCHEDULE_CASCADED",
        description: `Schedule cascaded from "${job.name}" — ${result.deltaDays > 0 ? "+" : ""}${result.deltaDays} working days, ${result.jobUpdates.length} jobs shifted`,
        siteId: job.plot.siteId,
        plotId: job.plotId,
        jobId: id,
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      applied: true,
      deltaDays: result.deltaDays,
      jobsUpdated: result.jobUpdates.length,
      ordersUpdated: result.orderUpdates.length,
      // (#167) Tell the client which orders were just flipped so it can
      // show the "mark delivered today / set new delivery date" prompt.
      overriddenOrders: overriddenOrders.map((o) => ({ id: o.id })),
      conflicts: JSON.parse(JSON.stringify(result.conflicts)), // included for visibility, caller opted in via force
    });
  } catch (err) {
    return apiError(err, "Failed to apply cascade");
  }
}
