import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { startOfDay, endOfDay, subDays, addDays } from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";
import { fetchWeatherForPostcode } from "@/lib/weather";
import { canAccessSite } from "@/lib/site-access";
import {
  whereJobEndOverdue,
  whereJobStartOverdue,
  whereOrderOverdue,
} from "@/lib/lateness";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/daily-brief?date=YYYY-MM-DD
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
  const dateParam = req.nextUrl.searchParams.get("date");
  const targetDate = dateParam ? new Date(dateParam) : getServerCurrentDate(req);
  const dayStart = startOfDay(targetDate);
  const dayEnd = endOfDay(targetDate);

  // Batch 1
  const [site, jobsStartingToday, jobsDueToday] = await Promise.all([
    prisma.site.findUnique({
      where: { id },
      select: { id: true, name: true, location: true, address: true, postcode: true, status: true },
    }),
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        startDate: { gte: dayStart, lte: dayEnd },
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        children: { none: {} }, // leaf-only — parent stages are derived roll-ups
      },
      select: {
        id: true, name: true, status: true, sortOrder: true, plotId: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
        contractors: {
          include: { contact: { select: { name: true, company: true } } },
        },
        orders: {
          where: { status: { not: "CANCELLED" } },
          select: {
            id: true, status: true, itemsDescription: true,
            supplier: { select: { id: true, name: true, contactEmail: true } },
          },
        },
      },
      // (#168) Chronological — sortOrder is the tiebreaker for jobs
      // sharing a start date inside the same plot.
      orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        endDate: { gte: dayStart, lte: dayEnd },
        status: { not: "COMPLETED" },
        children: { none: {} },
      },
      select: {
        id: true, name: true, status: true, plotId: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
        contractors: {
          select: { contactId: true, contact: { select: { name: true, company: true } } },
          orderBy: { createdAt: "asc" as const },
          take: 1,
        },
        orders: {
          where: { status: { not: "CANCELLED" } },
          select: { id: true, status: true },
        },
      },
      orderBy: [{ endDate: "asc" }, { sortOrder: "asc" }],
    }),
  ]);

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Fetch weather in background (HTTP call, doesn't count against Supabase pool)
  const weatherPromise = site.postcode
    ? fetchWeatherForPostcode(site.postcode)
    : Promise.resolve(null);

  // Batch 2
  const [overdueJobs, lateStartJobs, delayedJobs, activeJobs, deliveriesToday] = await Promise.all([
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        ...whereJobEndOverdue(dayStart), // (#177) SSOT
        children: { none: {} },
      },
      select: {
        id: true, name: true, status: true, endDate: true, plotId: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: { endDate: "asc" },
    }),
    // Late starts — SSOT via whereJobStartOverdue
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        ...whereJobStartOverdue(dayStart),
        children: { none: {} },
      },
      select: {
        id: true, name: true, startDate: true, endDate: true, sortOrder: true,
        plotId: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
        contractors: { include: { contact: { select: { name: true, company: true } } } },
      },
      orderBy: { startDate: "asc" },
    }),
    // Delayed jobs: NOT_STARTED, originally due before today, pushed to future
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        status: "NOT_STARTED",
        originalStartDate: { lt: dayStart },
        startDate: { gt: dayEnd },
        children: { none: {} },
      },
      select: {
        id: true, name: true, startDate: true, endDate: true, originalStartDate: true, plotId: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
        contractors: {
          select: { contact: { select: { name: true, company: true } } },
          orderBy: { createdAt: "asc" as const },
          take: 1,
        },
      },
      orderBy: { startDate: "asc" },
      take: 20,
    }),
    prisma.job.findMany({
      where: { plot: { siteId: id }, status: "IN_PROGRESS", children: { none: {} } },
      select: {
        id: true, name: true, endDate: true, plotId: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
        contractors: {
          select: { contactId: true, contact: { select: { name: true, company: true } } },
          orderBy: { createdAt: "asc" as const },
          take: 1,
        },
      },
      // (#168) Chronological — surfaces jobs by their planned start.
      orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        expectedDeliveryDate: { gte: dayStart, lte: dayEnd },
        status: "ORDERED",
      },
      select: {
        id: true, itemsDescription: true, status: true,
        supplier: { select: { id: true, name: true } },
        job: { select: { id: true, name: true, plot: { select: { plotNumber: true, name: true } } } },
      },
    }),
  ]);

  // Split late starts into genuinely late vs blocked by predecessor
  const genuineLateStartJobs: typeof lateStartJobs = [];
  const blockedJobs: Array<
    (typeof lateStartJobs)[number] & { blockedBy: string }
  > = [];

  if (lateStartJobs.length > 0) {
    // Get all plotIds that have late start jobs
    const plotIds = [...new Set(lateStartJobs.map((j) => j.plotId))];

    // Fetch all incomplete predecessor jobs for those plots in one query
    const predecessorJobs = await prisma.job.findMany({
      where: {
        plotId: { in: plotIds },
        status: { not: "COMPLETED" },
      },
      select: { id: true, name: true, sortOrder: true, plotId: true },
    });

    // Group predecessors by plotId for fast lookup
    const predecessorsByPlot = new Map<string, typeof predecessorJobs>();
    for (const pj of predecessorJobs) {
      const existing = predecessorsByPlot.get(pj.plotId) ?? [];
      existing.push(pj);
      predecessorsByPlot.set(pj.plotId, existing);
    }

    for (const job of lateStartJobs) {
      const plotPredecessors = predecessorsByPlot.get(job.plotId) ?? [];
      // Find an incomplete job on the same plot with a lower sortOrder (i.e. should come first)
      const blocker = plotPredecessors.find(
        (p) => p.id !== job.id && p.sortOrder < job.sortOrder
      );
      if (blocker) {
        blockedJobs.push({ ...job, blockedBy: blocker.name });
      } else {
        genuineLateStartJobs.push(job);
      }
    }
  }

  // Batch 3
  const tomorrowStart = startOfDay(addDays(targetDate, 1));
  const tomorrowEnd = endOfDay(addDays(targetDate, 1));

  const [overdueDeliveries, openSnags, openSnagsList, incompleteSnags, rainedOff, outstandingOrders, upcomingOrders, upcomingDeliveries, jobsStartingTomorrow, unassignedJobs, unassignedInternalJobs, unsignedCompletions, awaitingSignOff] = await Promise.all([
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        ...whereOrderOverdue(dayStart), // (#177) SSOT
      },
      select: {
        id: true, itemsDescription: true, expectedDeliveryDate: true,
        supplier: { select: { id: true, name: true } },
        job: { select: { id: true, name: true, plot: { select: { plotNumber: true, name: true } } } },
      },
    }),
    prisma.snag.count({
      where: { plot: { siteId: id }, status: { in: ["OPEN", "IN_PROGRESS"] } },
    }),
    prisma.snag.findMany({
      where: { plot: { siteId: id }, status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: {
        id: true, description: true, status: true, priority: true, location: true,
        plotId: true,
        plot: { select: { plotNumber: true, name: true, siteId: true } },
        assignedTo: { select: { name: true } },
        contact: { select: { name: true, company: true } },
      },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 20,
    }),
    prisma.snag.findMany({
      where: {
        plot: { siteId: id },
        status: { in: ["OPEN", "IN_PROGRESS"] },
        OR: [
          { assignedToId: null },
          { contactId: null },
          { jobId: null },
          { location: null },
        ],
      },
      select: {
        id: true,
        description: true,
        plotId: true,
        assignedToId: true,
        contactId: true,
        jobId: true,
        location: true,
        plot: { select: { plotNumber: true, name: true, siteId: true } },
        _count: { select: { photos: true } },
      },
      take: 20,
      orderBy: { createdAt: "desc" },
    }),
    prisma.rainedOffDay.findFirst({
      where: { siteId: id, date: { gte: dayStart, lte: dayEnd } },
    }),
    // Orders to Place: PENDING where dateOfOrder is today or past (should have been sent by now)
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        status: "PENDING",
        dateOfOrder: { lte: dayEnd },
      },
      select: {
        id: true, itemsDescription: true, status: true, expectedDeliveryDate: true, dateOfOrder: true,
        supplier: { select: { id: true, name: true, contactEmail: true, contactName: true, accountNumber: true } },
        job: { select: { id: true, name: true, plot: { select: { plotNumber: true, name: true } } } },
        orderItems: { select: { id: true, name: true, quantity: true, unit: true, unitCost: true, totalCost: true } },
      },
      orderBy: { dateOfOrder: "asc" },
      take: 30,
    }),
    // Upcoming Orders: PENDING where dateOfOrder is in the future (scheduled, not yet due)
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        status: "PENDING",
        dateOfOrder: { gt: dayEnd },
      },
      select: {
        id: true, itemsDescription: true, status: true, expectedDeliveryDate: true, dateOfOrder: true,
        supplier: { select: { id: true, name: true, contactEmail: true, contactName: true, accountNumber: true } },
        job: { select: { id: true, name: true, plot: { select: { plotNumber: true, name: true } } } },
        orderItems: { select: { id: true, name: true, quantity: true, unit: true, unitCost: true, totalCost: true } },
      },
      orderBy: { dateOfOrder: "asc" },
      take: 20,
    }),
    // Upcoming Deliveries: orders already SENT (ORDERED), delivery date in the future
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        status: "ORDERED",
        expectedDeliveryDate: { gt: dayEnd },
        deliveredDate: null,
      },
      select: {
        id: true, itemsDescription: true, status: true, expectedDeliveryDate: true, dateOfOrder: true,
        supplier: { select: { id: true, name: true } },
        job: { select: { id: true, name: true, plot: { select: { plotNumber: true, name: true } } } },
      },
      orderBy: { expectedDeliveryDate: "asc" },
      take: 30,
    }),
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        startDate: { gte: tomorrowStart, lte: tomorrowEnd },
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        children: { none: {} },
      },
      select: {
        id: true, name: true, status: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
        contractors: { include: { contact: { select: { name: true, company: true } } } },
      },
      // (#168) Chronological sort everywhere a job list is rendered.
      orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
    }),
    // Jobs in progress with no contractor
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        status: "IN_PROGRESS",
        contractors: { none: {} },
        children: { none: {} },
      },
      select: {
        id: true, name: true, plotId: true,
        plot: { select: { plotNumber: true, name: true, siteId: true } },
        assignedTo: { select: { name: true } },
      },
      orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
      take: 20,
    }),
    // Jobs in progress with no internal assignee
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        status: "IN_PROGRESS",
        assignedToId: null,
        children: { none: {} },
      },
      select: {
        id: true, name: true, plotId: true,
        plot: { select: { plotNumber: true, name: true, siteId: true } },
      },
      orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
      take: 20,
    }),
    // Completed jobs with no sign-off documentation
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        status: "COMPLETED",
        OR: [
          { signOffNotes: null },
          { signOffNotes: "" },
        ],
        children: { none: {} },
      },
      select: {
        id: true, name: true, plotId: true, signOffNotes: true,
        plot: { select: { plotNumber: true, name: true, siteId: true } },
        _count: { select: { photos: true } },
      },
      orderBy: [{ endDate: "asc" }, { sortOrder: "asc" }],
      take: 20,
    }),
    // Jobs completed but NOT signed off
    prisma.job.findMany({
      where: {
        plot: { siteId: id },
        status: "COMPLETED",
        signedOffAt: null,
        children: { none: {} },
      },
      select: {
        id: true, name: true, status: true, actualEndDate: true, plotId: true,
        plot: { select: { plotNumber: true, name: true } },
        assignedTo: { select: { name: true } },
        contractors: {
          select: { contactId: true, contact: { select: { name: true, company: true } } },
          orderBy: { createdAt: "asc" as const },
          take: 1,
        },
      },
      orderBy: { actualEndDate: "asc" },
      take: 20,
    }),
  ]);

  const incompleteSnagsList = incompleteSnags.map((s) => {
    const missing: string[] = [];
    if (!s.assignedToId) missing.push("No assignee");
    if (!s.contactId) missing.push("No contractor");
    if (!s.jobId) missing.push("No job linked");
    if (!s.location) missing.push("No location");
    if (s._count.photos === 0) missing.push("No photos");
    return {
      id: s.id,
      description: s.description,
      plotId: s.plotId,
      plot: s.plot,
      missing,
    };
  });

  // Build unified needsAttention list
  const needsAttention: Array<{
    id: string;
    type: "snag" | "job" | "order";
    title: string;
    subtitle: string;
    missing: string[];
  }> = [];

  // Incomplete snags
  for (const s of incompleteSnagsList) {
    needsAttention.push({
      id: s.id,
      type: "snag",
      title: s.description,
      subtitle: s.plot.plotNumber ? `Plot ${s.plot.plotNumber}` : s.plot.name,
      missing: s.missing,
    });
  }

  // Jobs with no contractor
  for (const j of unassignedJobs) {
    needsAttention.push({
      id: j.id,
      type: "job",
      title: j.name,
      subtitle: j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name,
      missing: ["No contractor"],
    });
  }

  // Jobs with no internal assignee (merge with above if same job)
  for (const j of unassignedInternalJobs) {
    const existing = needsAttention.find((n) => n.id === j.id && n.type === "job");
    if (existing) {
      existing.missing.push("No assignee");
    } else {
      needsAttention.push({
        id: j.id,
        type: "job",
        title: j.name,
        subtitle: j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name,
        missing: ["No assignee"],
      });
    }
  }

  // Completed jobs without sign-off documentation — but ONLY those already signed off
  // (jobs awaiting sign-off have their own section; listing them here too is duplicate noise)
  const awaitingSignOffIds = new Set(awaitingSignOff.map((j) => j.id));
  for (const j of unsignedCompletions) {
    if (awaitingSignOffIds.has(j.id)) continue;
    const m: string[] = [];
    if (!j.signOffNotes) m.push("No sign-off notes");
    if (j._count.photos === 0) m.push("No completion photos");
    if (m.length > 0) {
      needsAttention.push({
        id: j.id,
        type: "job",
        title: j.name,
        subtitle: j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name,
        missing: m,
      });
    }
  }

  // Overdue deliveries
  for (const d of overdueDeliveries) {
    needsAttention.push({
      id: d.id,
      type: "order",
      title: d.itemsDescription ?? "Unnamed order",
      subtitle: d.job?.plot?.plotNumber
        ? `Plot ${d.job.plot.plotNumber} — ${d.supplier?.name ?? "Unknown supplier"}`
        : d.supplier?.name ?? "Unknown supplier",
      missing: ["Overdue delivery"],
    });
  }

  // Batch 4
  const [recentEvents, totalPlots, allJobs, pendingSignOffsRaw, awaitingRestartRaw] = await Promise.all([
    prisma.eventLog.findMany({
      where: { siteId: id, createdAt: { gte: subDays(dayStart, 1), lte: dayEnd } },
      select: {
        id: true, type: true, description: true, createdAt: true,
        user: { select: { name: true } },
      },
      // (May 2026 audit #78) id tiebreaker for stable order in the
      // daily brief — events from a single cascade tx tie on createdAt.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    }),
    prisma.plot.count({ where: { siteId: id } }),
    // Only count leaf jobs — parent stages are derived roll-ups, counting them would double-count progress
    prisma.job.count({ where: { plot: { siteId: id }, children: { none: {} } } }),
    // IN_PROGRESS jobs where a later job on the same plot has already been started
    prisma.job.findMany({
      where: { plot: { siteId: id }, status: "IN_PROGRESS" },
      select: {
        id: true,
        name: true,
        plotId: true,
        sortOrder: true,
        plot: {
          select: {
            plotNumber: true,
            name: true,
            jobs: {
              where: { status: { in: ["IN_PROGRESS", "COMPLETED"] } },
              select: { sortOrder: true },
            },
          },
        },
      },
      // (#168) Chronological — keeps the brief in start-date order.
      orderBy: [{ startDate: "asc" }, { sortOrder: "asc" }],
    }),
    // Inactive plots: plots with NO in-progress jobs (need attention)
    prisma.plot.findMany({
      where: {
        siteId: id,
        jobs: { none: { status: "IN_PROGRESS" } },
        // Exclude fully completed plots
        NOT: { jobs: { every: { status: "COMPLETED" } } },
      },
      select: {
        id: true,
        plotNumber: true,
        name: true,
        houseType: true,
        awaitingRestart: true,
        awaitingContractorConfirmation: true,
        jobs: {
          // (#15) Use leaf jobs (children: none) instead of the
          // parentStage-not-null filter. The old filter missed plots
          // built with flat (no parent) templates and missed orphaned
          // children whose parent was deleted (parentStage cleared).
          where: { status: { not: "COMPLETED" }, children: { none: {} } },
          orderBy: { startDate: "asc" },
          take: 1,
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            endDate: true,
            parentStage: true,
            contractors: {
              select: { contact: { select: { name: true, company: true, phone: true, email: true } } },
              orderBy: { createdAt: "asc" },
              take: 1,
            },
            assignedTo: { select: { name: true } },
            orders: {
              where: { status: { notIn: ["DELIVERED", "CANCELLED"] } },
              select: { id: true, status: true },
            },
          },
        },
        _count: { select: { jobs: { where: { status: "COMPLETED" } } } },
      },
    }),
  ]);

  const inactivePlots = awaitingRestartRaw.map((p) => {
    const nextJob = p.jobs[0] ?? null;
    const contractor = nextJob?.contractors?.[0]?.contact ?? null;
    const hasUndeliveredOrders = (nextJob?.orders ?? []).length > 0;
    const hasAnyCompleted = p._count.jobs > 0;

    // Determine inactivity type
    let inactivityType: "not_started" | "awaiting_next" | "awaiting_materials" | "deferred" | "awaiting_contractor" = "not_started";
    if ((p as { awaitingContractorConfirmation?: boolean }).awaitingContractorConfirmation) {
      inactivityType = "awaiting_contractor";
    } else if (p.awaitingRestart) {
      inactivityType = "deferred";
    } else if (hasUndeliveredOrders && hasAnyCompleted) {
      inactivityType = "awaiting_materials";
    } else if (hasAnyCompleted) {
      inactivityType = "awaiting_next";
    }

    const label = inactivityType === "not_started" ? "Not started"
      : inactivityType === "awaiting_contractor" ? `Awaiting contractor for ${nextJob?.name || "next job"}`
      : inactivityType === "deferred" ? "Deferred"
      : inactivityType === "awaiting_materials" ? `Awaiting materials for ${nextJob?.name || "next job"}`
      : `Next: ${nextJob?.name || "unknown"}`;

    const orders = nextJob?.orders ?? [];
    const pendingOrders = orders.filter((o) => o.status === "PENDING").length;
    const orderedOrders = orders.filter((o) => o.status === "ORDERED").length;

    return {
      id: p.id,
      plotNumber: p.plotNumber,
      name: p.name,
      houseType: p.houseType,
      inactivityType,
      label,
      nextJob: nextJob
        ? {
            id: nextJob.id,
            name: nextJob.name,
            startDate: nextJob.startDate?.toISOString() ?? null,
            endDate: nextJob.endDate?.toISOString() ?? null,
            contractorName: contractor ? contractor.company || contractor.name : null,
            contractorPhone: (contractor as { phone?: string })?.phone ?? null,
            contractorEmail: (contractor as { email?: string })?.email ?? null,
            assignedToName: nextJob.assignedTo?.name ?? null,
          }
        : null,
      hasContractor: !!contractor,
      ordersPending: pendingOrders,
      ordersOrdered: orderedOrders,
      ordersTotal: orders.length,
    };
  });

  // Jobs that are IN_PROGRESS but a subsequent job on the same plot is already running/done
  const pendingSignOffs = pendingSignOffsRaw
    .filter((j) => j.plot.jobs.some((other) => other.sortOrder > j.sortOrder))
    .map((j) => ({
      id: j.id,
      name: j.name,
      plotId: j.plotId,
      plot: { plotNumber: j.plot.plotNumber, name: j.plot.name },
    }));

  const [completedJobs, weatherForecast] = await Promise.all([
    prisma.job.count({
      where: { plot: { siteId: id }, status: "COMPLETED", children: { none: {} } },
    }),
    weatherPromise,
  ]);

  // Build weather response: today + next 3 days
  let weather = null;
  if (weatherForecast && weatherForecast.length > 0) {
    weather = {
      today: weatherForecast[0],
      forecast: weatherForecast.slice(1, 4),
    };
  }

  return NextResponse.json({
    site,
    date: dayStart.toISOString(),
    isRainedOff: !!rainedOff,
    rainedOffNote: rainedOff?.note ?? null,
    summary: {
      totalPlots,
      totalJobs: allJobs,
      completedJobs,
      progressPercent: allJobs > 0 ? Math.round((completedJobs / allJobs) * 100) : 0,
      activeJobCount: activeJobs.length,
      overdueJobCount: overdueJobs.length,
      lateStartCount: genuineLateStartJobs.length,
      blockedCount: blockedJobs.length,
      openSnagCount: openSnags,
      needsAttentionCount: needsAttention.length,
      inactivePlotCount: inactivePlots.length,
      pendingSignOffCount: pendingSignOffs.length,
      upcomingDeliveryCount: upcomingDeliveries.length,
      awaitingSignOffCount: awaitingSignOff.length,
    },
    jobsStartingToday: jobsStartingToday.map((j) => {
      const orders = j.orders ?? [];
      const pendingOrders = orders.filter((o) => o.status === "PENDING").length;
      const orderedOrders = orders.filter((o) => o.status === "ORDERED").length;
      const deliveredOrders = orders.filter((o) => o.status === "DELIVERED").length;
      const hasContractor = j.contractors.length > 0;
      const hasAssignee = !!j.assignedTo;
      // Check predecessor: is there an incomplete job on same plot with lower sortOrder?
      const hasPredecessorIssue = lateStartJobs.some(
        (ls) => ls.plotId === j.plotId && ls.sortOrder < j.sortOrder
      );
      return {
        ...j,
        orders: undefined,
        readiness: {
          hasContractor,
          hasAssignee,
          predecessorComplete: !hasPredecessorIssue,
          ordersPending: pendingOrders,
          ordersOrdered: orderedOrders,
          ordersDelivered: deliveredOrders,
          ordersTotal: orders.length,
          pendingOrdersList: orders
            .filter((o) => o.status === "PENDING")
            .map((o) => ({ id: o.id, description: o.itemsDescription, supplierName: (o.supplier as { name: string })?.name, supplierEmail: (o.supplier as { contactEmail: string | null })?.contactEmail })),
        },
      };
    }),
    lateStartJobs: genuineLateStartJobs.map((j) => ({
      ...j,
      startDate: j.startDate?.toISOString() ?? null,
      endDate: j.endDate?.toISOString() ?? null,
    })),
    blockedJobs: blockedJobs.map((j) => ({
      ...j,
      startDate: j.startDate?.toISOString() ?? null,
      endDate: j.endDate?.toISOString() ?? null,
    })),
    delayedJobs: delayedJobs.map((j) => ({
      ...j,
      startDate: j.startDate?.toISOString() ?? null,
      endDate: j.endDate?.toISOString() ?? null,
      originalStartDate: j.originalStartDate?.toISOString() ?? null,
    })),
    jobsStartingTomorrow,
    jobsDueToday,
    overdueJobs: overdueJobs.map((j) => ({
      ...j,
      endDate: j.endDate?.toISOString() ?? null,
    })),
    activeJobs: activeJobs.map((j) => ({
      ...j,
      endDate: j.endDate?.toISOString() ?? null,
    })),
    deliveriesToday,
    overdueDeliveries: overdueDeliveries.map((d) => ({
      ...d,
      expectedDeliveryDate: d.expectedDeliveryDate?.toISOString() ?? null,
    })),
    openSnagsList,
    openSnagsTruncated: openSnags > openSnagsList.length,
    needsAttention,
    pendingSignOffs,
    inactivePlots,
    ordersToPlace: outstandingOrders.map((o) => ({
      ...o,
      dateOfOrder: o.dateOfOrder.toISOString(),
      expectedDeliveryDate: o.expectedDeliveryDate?.toISOString() ?? null,
    })),
    upcomingOrders: upcomingOrders.map((o) => ({
      ...o,
      dateOfOrder: o.dateOfOrder.toISOString(),
      expectedDeliveryDate: o.expectedDeliveryDate?.toISOString() ?? null,
    })),
    upcomingDeliveries: upcomingDeliveries.map((d) => ({
      ...d,
      dateOfOrder: d.dateOfOrder.toISOString(),
      expectedDeliveryDate: d.expectedDeliveryDate?.toISOString() ?? null,
    })),
    awaitingSignOff: awaitingSignOff.map((j) => ({
      ...j,
      actualEndDate: j.actualEndDate?.toISOString() ?? null,
    })),
    recentEvents: recentEvents.map((e) => ({
      ...e,
      createdAt: e.createdAt.toISOString(),
    })),
    weather,
  });
}
