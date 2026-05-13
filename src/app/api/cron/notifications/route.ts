import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToAll, sendPushToSiteAudience } from "@/lib/push";
import { addDays } from "date-fns";
import { getServerCurrentDate, getServerStartOfDay } from "@/lib/dev-date";
import { checkCronAuth } from "@/lib/cron-auth";
import { whereJobEndOverdue, whereJobStartOverdue } from "@/lib/lateness";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // (May 2026 audit #4) Single source for cron auth — hard-fails if
  // CRON_SECRET is missing in production, uses constant-time compare.
  const authCheck = checkCronAuth(req.headers.get("authorization"));
  if (!authCheck.ok) {
    return NextResponse.json(
      { error: "Unauthorized", reason: authCheck.reason },
      { status: 401 },
    );
  }

  // (#41) Route through getServerCurrentDate so Dev Mode tests can
  // simulate cron firings on a non-real date. Vercel cron sends no
  // dev-date cookie so production behaviour is identical to before.
  // (#87) UTC start-of-day so the boundary matches how Prisma stores
  // timestamps — see getServerStartOfDay() doc.
  const now = getServerCurrentDate(req);
  const todayStart = getServerStartOfDay(req);
  const todayEnd = new Date(todayStart.getTime() + 86_400_000);
  const in3Days = addDays(now, 3);

  // Count items for each notification category (same logic as /api/tasks)
  const [
    overdueJobsCount,
    overdueOrdersCount,
    jobsStartingTodayCount,
    deliveriesTodayCount,
    signOffCount,
    pendingOrdersCount,
    lateStartCount,
  ] = await Promise.all([
    // (May 2026 audit D-P1-4) Use the Lateness SSOT so the overdue
    // definition matches every other surface. Pre-fix this counted
    // only IN_PROGRESS jobs as overdue — but NOT_STARTED + ON_HOLD
    // jobs past their endDate are also overdue in every other view
    // (Daily Brief, Delay Report, lateness cron). The push count
    // diverged from what the user saw in-app. All job counts filter
    // to LEAF jobs only since parents are derived rollups.
    prisma.job.count({
      where: { ...whereJobEndOverdue(now), children: { none: {} } },
    }),
    prisma.materialOrder.count({
      where: {
        status: "ORDERED",
        expectedDeliveryDate: { lt: now },
      },
    }),
    prisma.job.count({
      where: {
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        startDate: { gte: todayStart, lt: todayEnd },
        children: { none: {} },
      },
    }),
    prisma.materialOrder.count({
      where: {
        status: "ORDERED",
        expectedDeliveryDate: { gte: todayStart, lt: todayEnd },
      },
    }),
    prisma.job.count({
      where: {
        status: "IN_PROGRESS",
        endDate: { gte: now, lte: in3Days },
        children: { none: {} },
      },
    }),
    prisma.materialOrder.count({
      where: { status: "PENDING", dateOfOrder: { lte: todayEnd } },
    }),
    // Late starts: NOT_STARTED leaf jobs whose start date has already
    // passed. Use the Lateness SSOT helper.
    prisma.job.count({
      where: { ...whereJobStartOverdue(todayStart), children: { none: {} } },
    }),
  ]);

  // Send grouped notifications for each category that has items
  const notifications: Promise<unknown>[] = [];

  if (overdueJobsCount > 0) {
    notifications.push(
      sendPushToAll("JOBS_OVERDUE", {
        title: "Overdue Jobs",
        body: `${overdueJobsCount} overdue job${overdueJobsCount !== 1 ? "s" : ""} need${overdueJobsCount === 1 ? "s" : ""} attention`,
        url: "/tasks?tab=jobs",
        tag: "jobs-overdue",
      })
    );
  }

  if (overdueOrdersCount > 0) {
    notifications.push(
      sendPushToAll("MATERIALS_OVERDUE", {
        title: "Overdue Materials",
        body: `${overdueOrdersCount} order${overdueOrdersCount !== 1 ? "s" : ""} past expected delivery date`,
        url: "/orders",
        tag: "materials-overdue",
      })
    );
  }

  if (jobsStartingTodayCount > 0) {
    notifications.push(
      sendPushToAll("JOBS_STARTING_TODAY", {
        title: "Jobs Starting Today",
        body: `${jobsStartingTodayCount} job${jobsStartingTodayCount !== 1 ? "s" : ""} starting today`,
        url: "/tasks?tab=jobs",
        tag: "jobs-starting",
      })
    );
  }

  if (deliveriesTodayCount > 0) {
    notifications.push(
      sendPushToAll("DELIVERIES_DUE_TODAY", {
        title: "Deliveries Due Today",
        body: `${deliveriesTodayCount} deliver${deliveriesTodayCount !== 1 ? "ies" : "y"} expected today`,
        url: "/orders",
        tag: "deliveries-today",
      })
    );
  }

  if (signOffCount > 0) {
    notifications.push(
      sendPushToAll("JOBS_READY_FOR_SIGNOFF", {
        title: "Jobs Ready for Sign Off",
        body: `${signOffCount} job${signOffCount !== 1 ? "s" : ""} approaching end date — ready to sign off`,
        url: "/tasks?tab=jobs",
        tag: "signoff-needed",
      })
    );
  }

  if (pendingOrdersCount > 0) {
    notifications.push(
      sendPushToAll("ORDERS_TO_SEND", {
        title: "Orders to Send",
        body: `${pendingOrdersCount} order${pendingOrdersCount !== 1 ? "s" : ""} still pending — ready to place`,
        url: "/orders",
        tag: "orders-pending",
      })
    );
  }

  if (lateStartCount > 0) {
    notifications.push(
      sendPushToAll("LATE_STARTS", {
        title: "Late Start Jobs",
        body: `${lateStartCount} job${lateStartCount !== 1 ? "s have" : " has"} not started — start date passed`,
        url: "/tasks?tab=jobs",
        tag: "late-starts",
      })
    );
  }

  // (#183) Daily Brief — one push per active site, scoped to the
  // site's audience (assignee + accessible users minus mutes). Was
  // sendPushToAll which spammed every tenant user with every site's
  // brief regardless of relevance.
  const activeSites = await prisma.site.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
  });
  for (const site of activeSites) {
    notifications.push(
      sendPushToSiteAudience(site.id, "JOBS_STARTING_TODAY", {
        title: `Daily Brief — ${site.name}`,
        body: `Your daily brief for ${site.name} is ready`,
        url: `/daily-brief?site=${site.id}`,
        tag: `daily-brief-${site.id}`,
      })
    );
  }

  // Snag re-inspection reminders — snags resolved 7+ days ago that aren't CLOSED
  const sevenDaysAgo = addDays(now, -7);
  const reinspectionSnags = await prisma.snag.count({
    where: {
      status: "RESOLVED",
      resolvedAt: { lte: sevenDaysAgo },
    },
  });
  if (reinspectionSnags > 0) {
    notifications.push(
      sendPushToAll("JOBS_READY_FOR_SIGNOFF", {
        title: "Snag Re-Inspections Due",
        body: `${reinspectionSnags} resolved snag${reinspectionSnags !== 1 ? "s" : ""} need re-inspection (7+ days since resolution)`,
        url: "/tasks",
        tag: "snag-reinspection",
      })
    );
  }

  await Promise.allSettled(notifications);

  // Log the notification event
  await prisma.eventLog.create({
    data: {
      type: "NOTIFICATION",
      description: `Daily notification cron: ${notifications.length} notification type${notifications.length !== 1 ? "s" : ""} sent`,
    },
  });

  return NextResponse.json({
    sent: notifications.length,
    counts: {
      overdueJobs: overdueJobsCount,
      overdueOrders: overdueOrdersCount,
      jobsStartingToday: jobsStartingTodayCount,
      deliveriesToday: deliveriesTodayCount,
      signOff: signOffCount,
      pendingOrders: pendingOrdersCount,
      lateStarts: lateStartCount,
    },
  });
}
