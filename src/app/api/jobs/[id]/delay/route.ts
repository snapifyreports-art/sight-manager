import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCascade } from "@/lib/cascade";
import { getTodayWeatherSummary } from "@/lib/weather";
import { addWorkingDays } from "@/lib/working-days";

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

  // Fetch today's weather to stamp on the delay note (fire-and-forget, never blocks)
  const sitePostcode = job.plot.site?.postcode ?? null;
  const weatherSummary = sitePostcode ? await getTodayWeatherSummary(sitePostcode).catch(() => null) : null;

  const newEndDate = addWorkingDays(job.endDate, days);

  const allPlotJobs = await prisma.job.findMany({
    where: { plotId: job.plotId },
    orderBy: { sortOrder: "asc" },
  });

  const allOrders = await prisma.materialOrder.findMany({
    where: { jobId: { in: allPlotJobs.map((j) => j.id) }, status: { not: "CANCELLED" } },
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
    })),
    allOrders.map((o) => ({
      id: o.id,
      jobId: o.jobId,
      dateOfOrder: o.dateOfOrder,
      expectedDeliveryDate: o.expectedDeliveryDate,
    }))
  );

  const reasonLabel =
    delayReasonType === "WEATHER_RAIN"
      ? "Weather – Rain"
      : delayReasonType === "WEATHER_TEMPERATURE"
        ? "Weather – Temperature"
        : reason || "No reason given";

  const noteEmoji =
    delayReasonType === "WEATHER_RAIN"
      ? "☔"
      : delayReasonType === "WEATHER_TEMPERATURE"
        ? "🌡️"
        : "⏳";

  // Build a map of current job dates for preserving originals
  const jobMap = new Map(allPlotJobs.map((j) => [j.id, j]));

  await prisma.$transaction(async (tx) => {
    // Update triggering job — preserve originals on first change
    const triggerData: Record<string, unknown> = { endDate: newEndDate };
    if (!job.originalEndDate && job.endDate) triggerData.originalEndDate = job.endDate;
    if (job.status === "NOT_STARTED" && job.startDate) {
      if (!job.originalStartDate) triggerData.originalStartDate = job.startDate;
      triggerData.startDate = addWorkingDays(job.startDate, days);
    }
    await tx.job.update({ where: { id }, data: triggerData });

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
  });

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
}
