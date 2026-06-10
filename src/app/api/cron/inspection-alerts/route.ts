import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToSiteAudience } from "@/lib/push";
import { logEvent } from "@/lib/event-log";
import { getServerCurrentDate, getServerStartOfDay } from "@/lib/dev-date";
import {
  whereInspectionOverdueCandidates,
  whereInspectionDayOf,
  whereInspectionWeekBefore,
  whereInspectionBookingDueCandidates,
  isBookingDueOn,
} from "@/lib/inspection-status";

export const dynamic = "force-dynamic";

const inspInclude = {
  plot: { select: { plotNumber: true, name: true } },
};

function listing(insps: Array<{ name: string; plot: { plotNumber: string | null; name: string } }>) {
  return insps.map((i) => `${i.name} (Plot ${i.plot.plotNumber ?? i.plot.name})`).join(", ");
}

// GET /api/cron/inspection-alerts — daily: flip OVERDUE + fire alerts.
export async function GET(req: NextRequest) {
  const { checkCronAuth } = await import("@/lib/cron-auth");
  const authCheck = checkCronAuth(req.headers.get("authorization"));
  if (!authCheck.ok) {
    return NextResponse.json({ error: "Unauthorized", reason: authCheck.reason }, { status: 401 });
  }

  const now = getServerCurrentDate(req);
  const dayStart = getServerStartOfDay(req);

  const sites = await prisma.site.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
  const summary = { sites: sites.length, flippedOverdue: 0, bookingDue: 0, weekBefore: 0, dayOf: 0, overdueAlerts: 0 };

  for (const site of sites) {
    const sw = { plot: { siteId: site.id } };

    // 1. Flip newly-overdue rows (idempotent — only SCHEDULED/BOOKED match).
    const toOverdue = await prisma.inspection.findMany({
      where: { ...sw, ...whereInspectionOverdueCandidates(dayStart) },
      include: inspInclude,
    });
    if (toOverdue.length > 0) {
      await prisma.inspection.updateMany({ where: { id: { in: toOverdue.map((i) => i.id) } }, data: { status: "OVERDUE" } });
      for (const i of toOverdue) {
        await logEvent(prisma, {
          type: "INSPECTION_OVERDUE",
          description: `Inspection "${i.name}" is overdue`,
          siteId: site.id, plotId: i.plotId, jobId: i.anchorJobId,
          detail: { inspectionId: i.id },
        }).catch(() => {});
      }
      summary.flippedOverdue += toOverdue.length;
    }

    // 2. Overdue alert — ESCALATE THEN STOP (Jun 2026 Q3). Forever-nagging
    // trains the manager to mute the type, so: push daily for the first 3
    // days an inspection is overdue, then drop to Mondays only. Stateless —
    // derived from how long the scheduled date has been past, no
    // sent-tracking table needed.
    // (Q1) Rows with a booking held are excluded — the visit is arranged;
    // they surface amber on the Brief instead of red pushes here.
    const overdueNow = await prisma.inspection.findMany({ where: { ...sw, status: "OVERDUE" }, include: inspInclude });
    const isMonday = dayStart.getDay() === 1;
    const overdueToNag = overdueNow.filter((i) => {
      if (i.bookedDate) return false;
      const daysOverdue = Math.floor((dayStart.getTime() - new Date(i.scheduledDate).getTime()) / 86_400_000);
      return daysOverdue <= 3 || isMonday;
    });
    if (overdueToNag.length > 0) {
      await sendPushToSiteAudience(site.id, "INSPECTION_OVERDUE", {
        title: `⚠️ ${overdueToNag.length} inspection${overdueToNag.length === 1 ? "" : "s"} overdue`,
        body: listing(overdueToNag),
        url: overdueToNag.length === 1 ? `/inspections?focus=${overdueToNag[0].id}` : "/inspections",
      });
      summary.overdueAlerts += overdueToNag.length;
    }

    // 3. Booking-due (book it now — N weeks ahead).
    const bookingCandidates = await prisma.inspection.findMany({ where: { ...sw, ...whereInspectionBookingDueCandidates(dayStart) }, include: inspInclude });
    const bookingDue = bookingCandidates.filter((i) => isBookingDueOn(i, dayStart));
    if (bookingDue.length > 0) {
      await sendPushToSiteAudience(site.id, "INSPECTION_BOOKING_DUE", {
        title: `📋 Book ${bookingDue.length} inspection${bookingDue.length === 1 ? "" : "s"} now`,
        body: listing(bookingDue),
        // (Jun 2026 S11) Single item → land on the exact row.
        url: bookingDue.length === 1 ? `/inspections?focus=${bookingDue[0].id}` : "/inspections",
      });
      summary.bookingDue += bookingDue.length;
    }

    // 4. One week before — final checks.
    const weekBefore = await prisma.inspection.findMany({ where: { ...sw, ...whereInspectionWeekBefore(dayStart) }, include: inspInclude });
    if (weekBefore.length > 0) {
      await sendPushToSiteAudience(site.id, "INSPECTION_WEEK_BEFORE", {
        title: `📅 Inspection${weekBefore.length === 1 ? "" : "s"} due next week`,
        body: `Final checks: ${listing(weekBefore)}`,
        url: weekBefore.length === 1 ? `/inspections?focus=${weekBefore[0].id}` : "/inspections",
      });
      summary.weekBefore += weekBefore.length;
    }

    // 5. Day-of.
    const dayOf = await prisma.inspection.findMany({ where: { ...sw, ...whereInspectionDayOf(dayStart) }, include: inspInclude });
    if (dayOf.length > 0) {
      await sendPushToSiteAudience(site.id, "INSPECTION_DAY_OF", {
        title: `🔍 Inspection${dayOf.length === 1 ? "" : "s"} today`,
        body: listing(dayOf),
        url: dayOf.length === 1 ? `/inspections?focus=${dayOf[0].id}` : "/inspections",
      });
      summary.dayOf += dayOf.length;
    }
  }

  return NextResponse.json({ ok: true, ranAt: now.toISOString(), ...summary });
}
