import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCascade } from "@/lib/cascade";
import { getTodayWeatherSummary } from "@/lib/weather";
import { addWorkingDays } from "@/lib/working-days";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type DelayReasonType = "WEATHER_RAIN" | "WEATHER_TEMPERATURE" | "OTHER";

// GET /api/jobs/[id]/delay — return weather impact suggestion for this job
// (counts rained-off days overlapping the job's scheduled period)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      id: true,
      startDate: true,
      endDate: true,
      weatherAffected: true,
      plot: { select: { siteId: true } },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Site-access check (GET path)
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const weatherDays = job.startDate && job.endDate
    ? await prisma.rainedOffDay.findMany({
        where: {
          siteId: job.plot.siteId,
          date: { gte: job.startDate, lte: new Date() },
        },
        select: { date: true, type: true, note: true },
        orderBy: { date: "asc" },
      })
    : [];

  const rainDays = weatherDays.filter((d) => d.type === "RAIN");
  const temperatureDays = weatherDays.filter((d) => d.type === "TEMPERATURE");

  // Suggest the most impactful weather reason
  let suggestedReason: DelayReasonType | null = null;
  if (rainDays.length > 0) suggestedReason = "WEATHER_RAIN";
  else if (temperatureDays.length > 0) suggestedReason = "WEATHER_TEMPERATURE";

  return NextResponse.json({
    rainDays: rainDays.length,
    temperatureDays: temperatureDays.length,
    suggestedReason,
    weatherDays: weatherDays.map((d) => ({
      date: d.date.toISOString(),
      type: d.type,
      note: d.note,
    })),
  });
}

// POST /api/jobs/[id]/delay — delay a single job and cascade to subsequent jobs
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "EDIT_PROGRAMME",
    )
  ) {
    return NextResponse.json(
      { error: "You do not have permission to delay jobs" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const body = await req.json();
  const { days, delayReasonType = "OTHER", reason } = body as {
    days: number;
    delayReasonType?: DelayReasonType;
    reason?: string;
  };

  if (!days || days < 1) {
    return NextResponse.json(
      { error: "days (>= 1) is required" },
      { status: 400 }
    );
  }

  const job = await prisma.job.findUnique({
    where: { id },
    include: { plot: { select: { siteId: true, site: { select: { postcode: true } } } } },
  });

  if (!job || !job.endDate) {
    return NextResponse.json({ error: "Job not found or has no end date" }, { status: 404 });
  }

  // Site-access check (POST path)
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  // Fetch today's weather to stamp on the delay note (fire-and-forget, never blocks)
  const sitePostcode = job.plot.site?.postcode ?? null;
  const weatherSummary = sitePostcode ? await getTodayWeatherSummary(sitePostcode).catch(() => null) : null;

  const newEndDate = addWorkingDays(job.endDate, days);

  const allPlotJobs = await prisma.job.findMany({
    where: { plotId: job.plotId, status: { not: "ON_HOLD" } },
    orderBy: { sortOrder: "asc" },
  });

  const allOrders = await prisma.materialOrder.findMany({
    where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
  });

  const cascade = calculateCascade(
    job.id,
    newEndDate,
    allPlotJobs.map((j) => ({
      id: j.id,
      name: j.name,
      startDate: j.startDate,
      endDate: j.endDate,
      sortOrder: j.sortOrder,
      status: j.status,
    })),
    allOrders.map((o) => ({
      id: o.id,
      jobId: o.jobId,
      dateOfOrder: o.dateOfOrder,
      expectedDeliveryDate: o.expectedDeliveryDate,
      status: o.status,
    }))
  );

  const reasonLabel =
    delayReasonType === "WEATHER_RAIN"
      ? "Weather – Rain"
      : delayReasonType === "WEATHER_TEMPERATURE"
        ? "Weather – Temperature"
        : reason || "No reason given";

  // Upsert+bump the DelayReason chip-list so commonly-used reasons
  // (system-seeded or user-typed) float to the top of the picker over
  // time. Only persist labels that look like real reasons — skip the
  // "No reason given" fallback so we don't pollute the chip grid.
  if (reason && reason.trim() && reason.trim().toLowerCase() !== "no reason given") {
    const trimmed = reason.trim().slice(0, 60);
    const labelTitled = trimmed[0].toUpperCase() + trimmed.slice(1);
    await prisma.delayReason
      .upsert({
        where: { label: labelTitled },
        update: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
        create: {
          label: labelTitled,
          category: delayReasonType,
          usageCount: 1,
          lastUsedAt: new Date(),
          isSystem: false,
        },
      })
      .catch(() => {
        /* non-critical — don't fail the delay if the chip-tracking write hiccups */
      });
  } else if (delayReasonType === "WEATHER_RAIN" || delayReasonType === "WEATHER_TEMPERATURE") {
    // Bump the seeded weather reason so its usage rank reflects reality
    const weatherLabel = delayReasonType === "WEATHER_RAIN" ? "Rain" : "Temperature";
    await prisma.delayReason
      .upsert({
        where: { label: weatherLabel },
        update: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
        create: {
          label: weatherLabel,
          category: delayReasonType,
          usageCount: 1,
          lastUsedAt: new Date(),
          isSystem: true,
        },
      })
      .catch(() => {});
  }

  const noteEmoji =
    delayReasonType === "WEATHER_RAIN"
      ? "☔"
      : delayReasonType === "WEATHER_TEMPERATURE"
        ? "🌡️"
        : "⏳";

  // Build a map of current job dates for preserving originals
  const jobMap = new Map(allPlotJobs.map((j) => [j.id, j]));

  try {
  await prisma.$transaction(
    async (tx) => {
    // The cascade library returns the trigger job in jobUpdates along with
    // downstream jobs — apply them uniformly. No separate trigger handling.
    for (const update of cascade.jobUpdates) {
      const currentJob = jobMap.get(update.jobId);
      await tx.job.update({
        where: { id: update.jobId },
        data: {
          startDate: update.newStart,
          endDate: update.newEnd,
          ...(!currentJob?.originalStartDate && currentJob?.startDate ? { originalStartDate: currentJob.startDate } : {}),
          ...(!currentJob?.originalEndDate && currentJob?.endDate ? { originalEndDate: currentJob.endDate } : {}),
        },
      });
    }

    for (const update of cascade.orderUpdates) {
      await tx.materialOrder.update({
        where: { id: update.orderId },
        data: {
          dateOfOrder: update.newOrderDate,
          expectedDeliveryDate: update.newDeliveryDate,
        },
      });
    }

    const weatherStamp = weatherSummary ? ` · ${weatherSummary}` : "";
    await tx.jobAction.create({
      data: {
        jobId: id,
        action: "note",
        notes: `${noteEmoji} Delayed ${days} day${days > 1 ? "s" : ""} — ${reasonLabel}${weatherStamp}`,
        userId: session.user.id,
      },
    });

    await tx.eventLog.create({
      data: {
        type: "SCHEDULE_CASCADED",
        description: `"${job.name}" delayed ${days} day(s) — ${reasonLabel}${weatherSummary ? ` · ${weatherSummary}` : ""}`,
        siteId: job.plot.siteId,
        plotId: job.plotId,
        jobId: id,
        userId: session.user.id,
        delayReasonType,
      },
    });
  },
    // Default 5s tx timeout was tripping on big delays (50 days
    // shifting dozens of jobs + orders on a multi-plot site). Bump
    // to 30s — same envelope as recalculate-stages.
    { timeout: 30_000, maxWait: 10_000 },
  );

  // Recompute every affected parent job's dates/status from its shifted children.
  // jobMap already has parentId for every job on this plot — no extra queries.
  {
    const { recomputeParentFromChildren } = await import("@/lib/parent-job");
    const parentIds = new Set<string>();
    for (const update of cascade.jobUpdates) {
      const j = jobMap.get(update.jobId);
      if (j?.parentId) parentIds.add(j.parentId);
    }
    await Promise.all(
      Array.from(parentIds).map((pid) => recomputeParentFromChildren(prisma, pid))
    );
  }

  // (#1/#2) Plot percent — delay doesn't change status but recompute
  // defensively in case the cascade triggered on/past today and a
  // follow-up changes affect counts.
  {
    const { recomputePlotPercent } = await import("@/lib/plot-percent");
    await recomputePlotPercent(prisma, job.plotId);
  }

  // Notify assigned user about the delay
  if (job.assignedToId) {
    const { sendPushToUser } = await import("@/lib/push");
    sendPushToUser(job.assignedToId, "JOBS_OVERDUE", {
      title: "Job Delayed",
      body: `"${job.name}" delayed ${days} day(s) — ${cascade.jobUpdates.length} downstream job(s) shifted`,
      url: `/jobs/${id}`,
      tag: `job-delayed-${id}`,
    }).catch(() => {});
  }

  return NextResponse.json({
    jobId: id,
    days,
    delayReasonType,
    jobsShifted: cascade.jobUpdates.length,
    ordersShifted: cascade.orderUpdates.length,
  });
  } catch (err) {
    return apiError(err, "Failed to delay job");
  }
}
