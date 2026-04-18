import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

type WeatherImpactType = "RAIN" | "TEMPERATURE";

// GET /api/sites/[id]/rained-off — list all weather impact dates for a site
export async function GET(
  _req: NextRequest,
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

  const days = await prisma.rainedOffDay.findMany({
    where: { siteId: id },
    orderBy: { date: "asc" },
    select: { id: true, date: true, type: true, note: true },
  });

  return NextResponse.json(days);
}

// POST /api/sites/[id]/rained-off — log a weather impact day + note affected jobs (no auto-delay)
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
  const body = await req.json();
  const { date, note, type = "RAIN" } = body as {
    date: string;
    note?: string | null;
    type?: WeatherImpactType;
  };

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const dateObj = new Date(date);
  dateObj.setUTCHours(0, 0, 0, 0);

  const impactIcon = type === "TEMPERATURE" ? "🌡️" : "☔";
  const impactLabel = type === "TEMPERATURE" ? "Temperature impact" : "Rain day";

  // Upsert the weather impact day record (unique by siteId + date + type)
  const day = await prisma.rainedOffDay.upsert({
    where: {
      siteId_date_type: { siteId, date: dateObj, type },
    },
    update: { note: note || null },
    create: {
      siteId,
      date: dateObj,
      type,
      note: note || null,
    },
  });

  // Find all weather-affected jobs overlapping this date and log a note — no cascade
  const plots = await prisma.plot.findMany({
    where: { siteId },
    select: { id: true },
  });

  const affectedJobs: Array<{ id: string }> = [];

  for (const plot of plots) {
    const jobs = await prisma.job.findMany({
      where: {
        plotId: plot.id,
        weatherAffected: true,
        // Only log notes on jobs whose weatherAffectedType matches (or is BOTH, or null/unset = legacy)
        OR: [
          { weatherAffectedType: null },
          { weatherAffectedType: type },
          { weatherAffectedType: "BOTH" },
        ],
        startDate: { lte: dateObj },
        endDate: { gte: dateObj },
      },
      select: { id: true },
    });
    affectedJobs.push(...jobs);
  }

  const noteText = `${impactIcon} ${note || impactLabel} — ${format(dateObj, "dd MMM yyyy")}`;

  for (const job of affectedJobs) {
    await prisma.jobAction.create({
      data: {
        jobId: job.id,
        userId: session.user.id,
        action: "note",
        notes: noteText,
      },
    });
  }

  await prisma.eventLog.create({
    data: {
      type: "SYSTEM",
      description: `${impactIcon} Weather impact logged: ${impactLabel} on ${format(dateObj, "dd MMM yyyy")}${note ? ` — ${note}` : ""} (${affectedJobs.length} job${affectedJobs.length !== 1 ? "s" : ""} affected)`,
      siteId: siteId,
      userId: session.user.id,
    },
  });

  return NextResponse.json(
    { day, affectedJobs: affectedJobs.length },
    { status: 201 }
  );
}

// DELETE /api/sites/[id]/rained-off — remove a weather impact day entry
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { date, type } = await req.json();

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const dateObj = new Date(date);
  dateObj.setUTCHours(0, 0, 0, 0);

  // If type provided, delete specific entry; otherwise delete all entries for that date
  if (type) {
    await prisma.rainedOffDay.deleteMany({
      where: { siteId: id, date: dateObj, type },
    });
  } else {
    await prisma.rainedOffDay.deleteMany({
      where: { siteId: id, date: dateObj },
    });
  }

  await prisma.eventLog.create({
    data: {
      type: "SYSTEM",
      description: `Weather impact removed for ${format(dateObj, "dd MMM yyyy")}${type ? ` (${type})` : ""}`,
      siteId: id,
      userId: session.user.id,
    },
  });

  return NextResponse.json({ success: true });
}
