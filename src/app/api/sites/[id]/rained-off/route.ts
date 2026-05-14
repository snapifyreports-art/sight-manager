import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { addWorkingDays, snapToWorkingDay } from "@/lib/working-days";
import { getServerCurrentDate } from "@/lib/dev-date";

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
  const { date, note, type = "RAIN", delayJobs = false } = body as {
    date: string;
    note?: string | null;
    type?: WeatherImpactType;
    /** (May 2026 critical bug) Pre-fix the client sent this flag but
     *  the server dropped it on the floor — the "Delay jobs by 1 day"
     *  checkbox on the Mark Rained Off dialog did nothing. Now honoured:
     *  every weather-affected job overlapping the day gets its endDate
     *  (and downstream chain) pushed by 1 working day. */
    delayJobs?: boolean;
  };

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const dateObj = new Date(date);
  dateObj.setUTCHours(0, 0, 0, 0);

  const impactIcon = type === "TEMPERATURE" ? "🌡️" : "☔";
  const impactLabel = type === "TEMPERATURE" ? "Temperature impact" : "Rain day";

  try {
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

    // (May 2026 critical bug) Honour the `delayJobs` flag. Pre-fix
    // the client sent it but the server ignored it. For each weather-
    // affected job overlapping the day: push endDate (+ subsequent
    // jobs in the same plot) by 1 working day. We use working-day
    // arithmetic since construction crews don't work weekends — same
    // semantics as every other delay path.
    let totalShifted = 0;
    if (delayJobs && affectedJobs.length > 0) {
      const now = getServerCurrentDate(req);
      const delayReasonType =
        type === "TEMPERATURE" ? "WEATHER_TEMPERATURE" : "WEATHER_RAIN";

      // Group affected jobs by plot so we can extend each plot's
      // downstream chain by 1 working day. We re-fetch the full job
      // list per plot because plots typically share weather (a rain
      // day delays the entire plot's active stage's downstream).
      const affectedPlotIds = Array.from(
        new Set(
          await Promise.all(
            affectedJobs.map((j) =>
              prisma.job
                .findUnique({ where: { id: j.id }, select: { plotId: true } })
                .then((row) => row?.plotId ?? null),
            ),
          ).then((ids) => ids.filter((id): id is string => id !== null)),
        ),
      );

      for (const plotId of affectedPlotIds) {
        const plotJobs = await prisma.job.findMany({
          where: { plotId, children: { none: {} } },
          orderBy: { sortOrder: "asc" },
        });
        // Find the earliest weather-affected job in this plot. Its
        // endDate and every subsequent job's start/end shift by 1WD.
        const firstAffected = plotJobs.find(
          (j) =>
            j.weatherAffected &&
            j.startDate &&
            j.endDate &&
            j.startDate <= dateObj &&
            j.endDate >= dateObj,
        );
        if (!firstAffected) continue;
        const shiftFrom = firstAffected.sortOrder;
        for (const j of plotJobs) {
          if (j.sortOrder < shiftFrom) continue;
          if (!j.startDate || !j.endDate) continue;
          const newStart =
            j.sortOrder === shiftFrom
              ? j.startDate // first affected: keep start, extend end only
              : snapToWorkingDay(addWorkingDays(j.startDate, 1), "forward");
          const newEnd = snapToWorkingDay(
            addWorkingDays(j.endDate, 1),
            "forward",
          );
          await prisma.job.update({
            where: { id: j.id },
            data: { startDate: newStart, endDate: newEnd },
          });
          totalShifted++;
        }
        // Recompute any parent rollups whose children just shifted.
        const parentIds = new Set<string>();
        for (const j of plotJobs) {
          if (j.sortOrder >= shiftFrom && j.parentId) parentIds.add(j.parentId);
        }
        const { recomputeParentFromChildren } = await import("@/lib/parent-job");
        await Promise.all(
          Array.from(parentIds).map((pid) =>
            recomputeParentFromChildren(prisma, pid),
          ),
        );
      }

      await prisma.eventLog.create({
        data: {
          type: "SCHEDULE_CASCADED",
          description: `${impactIcon} ${impactLabel} on ${format(dateObj, "dd MMM yyyy")} delayed ${totalShifted} job${totalShifted !== 1 ? "s" : ""} by 1 working day`,
          siteId,
          userId: session.user.id,
          delayReasonType,
        },
      });
      void now;
    }

    await prisma.eventLog.create({
      data: {
        type: "SYSTEM",
        description: `${impactIcon} Weather impact logged: ${impactLabel} on ${format(dateObj, "dd MMM yyyy")}${note ? ` — ${note}` : ""} (${affectedJobs.length} job${affectedJobs.length !== 1 ? "s" : ""} affected${delayJobs ? `, ${totalShifted} shifted by 1 WD` : ""})`,
        siteId: siteId,
        userId: session.user.id,
      },
    });

    return NextResponse.json(
      { day, affectedJobs: affectedJobs.length, shifted: totalShifted },
      { status: 201 }
    );
  } catch (err) {
    return apiError(err, "Failed to mark rained off");
  }
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

  // (May 2026 pattern sweep) Pre-fix DELETE skipped canAccessSite even
  // though POST had it. Any authenticated user could erase weather
  // records for a site they don't belong to.
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const { date, type } = await req.json();

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const dateObj = new Date(date);
  dateObj.setUTCHours(0, 0, 0, 0);

  try {
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
  } catch (err) {
    return apiError(err, "Failed to clear rained off");
  }
}
