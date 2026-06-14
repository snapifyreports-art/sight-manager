import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { format } from "date-fns";
import { canAccessSite } from "@/lib/site-access";
import { sessionHasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-errors";
import { addWorkingDays } from "@/lib/working-days";
import { calculateCascade } from "@/lib/cascade";
import { logEvent } from "@/lib/event-log";

export const dynamic = "force-dynamic";
// (Jun 2026 504-class sweep) A "rained off" mark with delay-jobs enabled
// runs a per-plot cascade transaction for every weather-affected plot on
// the site. On a large site this can exceed the default function limit —
// raise to the safe 60s ceiling. (POST only; the GET/DELETE are light.)
export const maxDuration = 60;

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
     *  (and downstream chain) pushed by 1 working day. The trigger job
     *  keeps its startDate — a rain day EXTENDS the in-progress job,
     *  it doesn't slide it. */
    delayJobs?: boolean;
  };

  // (Jun 2026 SSoT/permissions audit) The delayJobs branch runs a
  // site-wide programme cascade that shifts job + material-order dates —
  // the same mutation /bulk-delay and /jobs/[id]/delay both gate on
  // EDIT_PROGRAMME. Logging the weather day itself stays open to anyone
  // with site access; only the date-shifting cascade requires the gate.
  if (
    delayJobs &&
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

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const dateObj = new Date(date);
  dateObj.setUTCHours(0, 0, 0, 0);

  const impactIcon = type === "TEMPERATURE" ? "🌡️" : "☔";
  const impactLabel = type === "TEMPERATURE" ? "Temperature impact" : "Rain day";

  try {
    // (Jun 2026 audit) Re-marking an already-recorded day must NOT
    // double-apply the 1-WD shift — check existence before the upsert
    // and only delay jobs when the row is genuinely new.
    const existingDay = await prisma.rainedOffDay.findUnique({
      where: {
        siteId_date_type: { siteId, date: dateObj, type },
      },
      select: { id: true },
    });
    const alreadyMarked = !!existingDay;

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

    const affectedJobs: Array<{ id: string; plotId: string }> = [];

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
        select: { id: true, plotId: true },
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
      // (May 2026 Story pass) Per-job WEATHER_IMPACT EventLog so the
      // plot timeline actually shows weather days — pre-fix only a
      // JobAction note was written, which the Site Story never reads.
      // logEvent backfills plotId/siteId from the job id.
      await logEvent(prisma, {
        type: "WEATHER_IMPACT",
        description: noteText,
        jobId: job.id,
        userId: session.user.id,
        delayReasonType:
          type === "TEMPERATURE" ? "WEATHER_TEMPERATURE" : "WEATHER_RAIN",
        detail: {
          weatherType: type,
          date: dateObj.toISOString(),
          delayed: !!delayJobs,
        },
      });
    }

    // (May 2026 critical bug) Honour the `delayJobs` flag. Pre-fix
    // the client sent it but the server ignored it.
    //
    // (Jun 2026 audit) The shift now routes through calculateCascade
    // instead of a bespoke loop. The old loop shifted COMPLETED /
    // ON_HOLD leaf jobs (I4 violation) and never moved PENDING orders
    // (I3 violation), so materials fell a day behind their jobs after
    // every rain delay. Trigger = first weather-affected active job in
    // the plot, newEnd = end + 1 WD — same apply contract as /delay,
    // EXCEPT the trigger keeps its startDate (a rain day extends the
    // in-progress job by 1 WD rather than sliding it; see the override
    // after calculateCascade below). The `alreadyMarked` guard stops a
    // re-marked day double-applying the 1-WD shift.
    let totalShifted = 0;
    if (delayJobs && !alreadyMarked && affectedJobs.length > 0) {
      const delayReasonType =
        type === "TEMPERATURE" ? "WEATHER_TEMPERATURE" : "WEATHER_RAIN";

      const { recomputeParentFromChildren } = await import("@/lib/parent-job");
      const { recomputePlotPercent } = await import("@/lib/plot-percent");
      const { recomputeInspectionDates } = await import("@/lib/inspection-dates");

      const affectedPlotIds = Array.from(
        new Set(affectedJobs.map((j) => j.plotId)),
      );

      for (const plotId of affectedPlotIds) {
        const allPlotJobs = await prisma.job.findMany({
          where: { plotId, status: { not: "ON_HOLD" } },
          orderBy: { sortOrder: "asc" },
        });

        // Trigger = earliest weather-affected job overlapping the day
        // that is still active (COMPLETED jobs are immovable per I4).
        const affectedIdsInPlot = new Set(
          affectedJobs.filter((j) => j.plotId === plotId).map((j) => j.id),
        );
        const trigger = allPlotJobs.find(
          (j) =>
            affectedIdsInPlot.has(j.id) &&
            j.status !== "COMPLETED" &&
            j.startDate &&
            j.endDate,
        );
        if (!trigger || !trigger.endDate) continue;

        const allOrders = await prisma.materialOrder.findMany({
          where: { jobId: { in: allPlotJobs.map((j) => j.id) } },
        });

        const cascade = calculateCascade(
          trigger.id,
          addWorkingDays(trigger.endDate, 1),
          allPlotJobs.map((j) => ({
            id: j.id,
            name: j.name,
            startDate: j.startDate,
            endDate: j.endDate,
            sortOrder: j.sortOrder,
            status: j.status,
            // parentId so parent stages re-derive from children and
            // their attached orders shift — same as /delay.
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
        if (cascade.jobUpdates.length === 0) continue;

        // (Jun 2026 review) Rain-day contract for the TRIGGER only:
        // calculateCascade slides BOTH edges, but the trigger is
        // mid-flight on the lost day — keep its startDate and let the
        // engine's newEnd grow its duration by the lost day. Downstream
        // jobs/orders keep the uniform +1 WD shift.
        const triggerUpdate = cascade.jobUpdates.find(
          (u) => u.jobId === trigger.id,
        );
        if (triggerUpdate && trigger.startDate) {
          triggerUpdate.newStart = trigger.startDate;
        }

        const jobMap = new Map(allPlotJobs.map((j) => [j.id, j]));

        await prisma.$transaction(
          async (tx) => {
            for (const update of cascade.jobUpdates) {
              const current = jobMap.get(update.jobId);
              await tx.job.update({
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

            // Recompute any parent rollups whose children just shifted.
            const parentIds = new Set<string>();
            for (const update of cascade.jobUpdates) {
              const j = jobMap.get(update.jobId);
              if (j?.parentId) parentIds.add(j.parentId);
            }
            await Promise.all(
              Array.from(parentIds).map((pid) =>
                recomputeParentFromChildren(tx, pid),
              ),
            );
          },
          // Same envelope as /delay and /bulk-delay.
          { timeout: 30_000, maxWait: 10_000 },
        );

        // (#1/#2) Defensive percent recompute, plus (Jun 2026 audit)
        // anchored inspection dates MUST follow their moved jobs —
        // every other date-mutation route already calls this.
        await recomputePlotPercent(prisma, plotId);
        await recomputeInspectionDates(prisma, plotId);

        totalShifted += cascade.jobUpdates.length;
      }

      await logEvent(prisma, {
        type: "SCHEDULE_CASCADED",
        description: `${impactIcon} ${impactLabel} on ${format(dateObj, "dd MMM yyyy")} delayed ${totalShifted} job${totalShifted !== 1 ? "s" : ""} by 1 working day`,
        siteId,
        userId: session.user.id,
        delayReasonType,
        detail: {
          weatherType: type,
          date: dateObj.toISOString(),
          jobsShifted: totalShifted,
        },
      });
    }

    await logEvent(prisma, {
      type: "WEATHER_IMPACT",
      description: `${impactIcon} Weather impact logged: ${impactLabel} on ${format(dateObj, "dd MMM yyyy")}${note ? ` — ${note}` : ""} (${affectedJobs.length} job${affectedJobs.length !== 1 ? "s" : ""} affected${delayJobs ? `, ${totalShifted} shifted by 1 WD` : ""})`,
      siteId: siteId,
      userId: session.user.id,
      detail: {
        weatherType: type,
        date: dateObj.toISOString(),
        jobsAffected: affectedJobs.length,
        jobsShifted: delayJobs ? totalShifted : 0,
      },
    });

    return NextResponse.json(
      {
        day,
        affectedJobs: affectedJobs.length,
        shifted: totalShifted,
        // (Jun 2026 review) Surface the re-mark no-op: the user asked
        // for a delay but the day was already recorded, so no shift
        // was applied. Client toasts this instead of silently closing.
        delaySkipped: delayJobs && alreadyMarked,
      },
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

  // (Jun 2026 daily-flow audit) The Daily Brief's "Undo rained off" sends
  // the date as a ?date= QUERY param with NO body; the Programme calendar
  // sends { date, type } in a JSON body. Accept either — and never let an
  // empty body crash the route. Pre-fix `await req.json()` on a body-less
  // DELETE threw SyntaxError (uncaught, outside the try), returning a 500,
  // so undo failed every single time from the Brief.
  const body = (await req.json().catch(() => ({}))) as {
    date?: string;
    type?: string;
  };
  const date = req.nextUrl.searchParams.get("date") ?? body.date;
  const type = (req.nextUrl.searchParams.get("type") ?? body.type ?? undefined) as
    | WeatherImpactType
    | undefined;

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

    await logEvent(prisma, {
      type: "SYSTEM",
      description: `Weather impact removed for ${format(dateObj, "dd MMM yyyy")}${type ? ` (${type})` : ""}`,
      siteId: id,
      userId: session.user.id,
      detail: {
        weatherImpactRemoved: true,
        date: dateObj.toISOString(),
        weatherType: type ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to clear rained off");
  }
}
