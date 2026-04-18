import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendPushToAll } from "@/lib/push";
import { addDays } from "date-fns";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Verify cron secret (Vercel sends this header automatically)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1
  );
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
    // All job counts filter to LEAF jobs only (parents are derived rollups)
    prisma.job.count({
      where: { status: "IN_PROGRESS", endDate: { lt: now }, children: { none: {} } },
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
    // Late starts: NOT_STARTED leaf jobs whose start date has already passed
    prisma.job.count({
      where: { status: "NOT_STARTED", startDate: { lt: todayStart }, children: { none: {} } },
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

  // Daily Brief notification — one per active site
  const activeSites = await prisma.site.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, name: true },
  });
  for (const site of activeSites) {
    notifications.push(
      sendPushToAll("JOBS_STARTING_TODAY", {
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
