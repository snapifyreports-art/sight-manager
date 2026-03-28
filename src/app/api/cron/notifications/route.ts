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
  ] = await Promise.all([
    prisma.job.count({
      where: { status: "IN_PROGRESS", endDate: { lt: now } },
    }),
    prisma.materialOrder.count({
      where: {
        status: { in: ["ORDERED", "CONFIRMED"] },
        expectedDeliveryDate: { lt: now },
      },
    }),
    prisma.job.count({
      where: {
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        startDate: { gte: todayStart, lt: todayEnd },
      },
    }),
    prisma.materialOrder.count({
      where: {
        status: { in: ["ORDERED", "CONFIRMED"] },
        expectedDeliveryDate: { gte: todayStart, lt: todayEnd },
      },
    }),
    prisma.job.count({
      where: {
        status: "IN_PROGRESS",
        endDate: { gte: now, lte: in3Days },
      },
    }),
    prisma.materialOrder.count({ where: { status: "PENDING" } }),
  ]);

  // Send grouped notifications for each category that has items
  const notifications: Promise<unknown>[] = [];

  if (overdueJobsCount > 0) {
    notifications.push(
      sendPushToAll("JOBS_OVERDUE", {
        title: "Overdue Jobs",
        body: `You have ${overdueJobsCount} overdue job${overdueJobsCount !== 1 ? "s" : ""} that need attention`,
        url: "/tasks",
        tag: "jobs-overdue",
      })
    );
  }

  if (overdueOrdersCount > 0) {
    notifications.push(
      sendPushToAll("MATERIALS_OVERDUE", {
        title: "Overdue Materials",
        body: `You have ${overdueOrdersCount} order${overdueOrdersCount !== 1 ? "s" : ""} past expected delivery date`,
        url: "/tasks",
        tag: "materials-overdue",
      })
    );
  }

  if (jobsStartingTodayCount > 0) {
    notifications.push(
      sendPushToAll("JOBS_STARTING_TODAY", {
        title: "Jobs Starting Today",
        body: `You have ${jobsStartingTodayCount} job${jobsStartingTodayCount !== 1 ? "s" : ""} starting today`,
        url: "/tasks",
        tag: "jobs-starting",
      })
    );
  }

  if (deliveriesTodayCount > 0) {
    notifications.push(
      sendPushToAll("DELIVERIES_DUE_TODAY", {
        title: "Deliveries Due Today",
        body: `You have ${deliveriesTodayCount} deliver${deliveriesTodayCount !== 1 ? "ies" : "y"} expected today`,
        url: "/tasks",
        tag: "deliveries-today",
      })
    );
  }

  if (signOffCount > 0) {
    notifications.push(
      sendPushToAll("JOBS_READY_FOR_SIGNOFF", {
        title: "Jobs Ready for Sign Off",
        body: `You have ${signOffCount} job${signOffCount !== 1 ? "s" : ""} approaching their end date`,
        url: "/tasks",
        tag: "signoff-needed",
      })
    );
  }

  if (pendingOrdersCount > 0) {
    notifications.push(
      sendPushToAll("ORDERS_TO_SEND", {
        title: "Orders to Send",
        body: `You have ${pendingOrdersCount} order${pendingOrdersCount !== 1 ? "s" : ""} still pending`,
        url: "/tasks",
        tag: "orders-pending",
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
    },
  });
}
