import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCascade } from "@/lib/cascade";
import { addDays, format } from "date-fns";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/rained-off — list all rained-off dates for a site
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const days = await prisma.rainedOffDay.findMany({
    where: { siteId: id },
    orderBy: { date: "asc" },
    select: { id: true, date: true, note: true },
  });

  return NextResponse.json(days);
}

// POST /api/sites/[id]/rained-off — mark a date as rained off + note/delay affected jobs
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: siteId } = await params;
  const body = await req.json();
  const { date, note, delayJobs } = body as {
    date: string;
    note?: string | null;
    delayJobs?: boolean;
  };

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const dateObj = new Date(date);
  dateObj.setUTCHours(0, 0, 0, 0);

  // Upsert the rained-off day record
  const day = await prisma.rainedOffDay.upsert({
    where: {
      siteId_date: { siteId, date: dateObj },
    },
    update: { note: note || null },
    create: {
      siteId,
      date: dateObj,
      note: note || null,
    },
  });

  // Find all weather-affected jobs overlapping this date
  const plots = await prisma.plot.findMany({
    where: { siteId },
    select: { id: true, plotNumber: true },
  });

  const affectedJobs: Array<{ id: string; plotId: string; name: string }> = [];

  for (const plot of plots) {
    const jobs = await prisma.job.findMany({
      where: {
        plotId: plot.id,
        weatherAffected: true,
        startDate: { lte: dateObj },
        endDate: { gte: dateObj },
      },
      select: { id: true, plotId: true, name: true },
    });
    affectedJobs.push(...jobs);
  }

  const noteText = `☔ ${note || "Rain day"} — ${format(dateObj, "dd MMM yyyy")}`;
  let delayedCount = 0;

  // Process affected jobs sequentially (Supabase pool limit)
  for (const job of affectedJobs) {
    // Always add a note
    await prisma.jobAction.create({
      data: {
        jobId: job.id,
        userId: session.user.id,
        action: "note",
        notes: noteText,
      },
    });

    // Optionally delay the job by 1 day
    if (delayJobs) {
      const fullJob = await prisma.job.findUnique({
        where: { id: job.id },
        select: { id: true, endDate: true, plotId: true, sortOrder: true },
      });

      if (fullJob?.endDate) {
        const newEndDate = addDays(fullJob.endDate, 1);

        const allPlotJobs = await prisma.job.findMany({
          where: { plotId: fullJob.plotId },
          orderBy: { sortOrder: "asc" },
        });

        const allOrders = await prisma.materialOrder.findMany({
          where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
        });

        const cascade = calculateCascade(
          fullJob.id,
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

        await prisma.$transaction(async (tx) => {
          await tx.job.update({
            where: { id: fullJob.id },
            data: { endDate: newEndDate },
          });

          for (const update of cascade.jobUpdates) {
            await tx.job.update({
              where: { id: update.jobId },
              data: { startDate: update.newStart, endDate: update.newEnd },
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

          await tx.eventLog.create({
            data: {
              type: "SCHEDULE_CASCADED",
              description: `Rain delay: "${job.name}" delayed 1 day — ${note || "Rain day"}`,
              siteId,
              plotId: job.plotId,
              jobId: job.id,
              userId: session.user.id,
            },
          });
        });

        delayedCount++;
      }
    }
  }

  return NextResponse.json({
    day,
    affectedJobs: affectedJobs.length,
    delayed: delayJobs ? delayedCount : 0,
  }, { status: 201 });
}

// DELETE /api/sites/[id]/rained-off — remove a rained-off date
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { date } = await req.json();

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const dateObj = new Date(date);
  dateObj.setUTCHours(0, 0, 0, 0);

  await prisma.rainedOffDay.deleteMany({
    where: { siteId: id, date: dateObj },
  });

  return NextResponse.json({ success: true });
}
