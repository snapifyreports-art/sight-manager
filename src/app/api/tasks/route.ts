import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Site-access filter — non-admins only see tasks on sites they've been granted access to
  const accessibleSiteIds = await getUserSiteIds(session.user.id, (session.user as { role: string }).role);
  const siteAccess = accessibleSiteIds === null ? {} : { plot: { siteId: { in: accessibleSiteIds } } };
  const siteAccessForOrder = accessibleSiteIds === null ? {} : { job: { plot: { siteId: { in: accessibleSiteIds } } } };
  const leafOnly = { children: { none: {} } };

  const now = getServerCurrentDate(req);
  const in7Days = addDays(now, 7);
  const in3Days = addDays(now, 3);

  // 1. Confirm Delivery — orders ORDERED with delivery within 7 days (not overdue)
  const confirmDelivery = await prisma.materialOrder.findMany({
    where: {
      ...siteAccessForOrder,
      status: "ORDERED",
      expectedDeliveryDate: { gte: now, lte: in7Days },
    },
    include: {
      supplier: { select: { id: true, name: true, contactEmail: true, contactName: true } },
      job: {
        include: {
          plot: {
            include: {
              site: { select: { id: true, name: true } },
            },
          },
        },
      },
      orderItems: true,
    },
    orderBy: { expectedDeliveryDate: "asc" },
  });

  // 2. Send Order — orders still PENDING whose dateOfOrder is within 14 days
  const sendOrderCutoff = addDays(now, 14);
  const sendOrder = await prisma.materialOrder.findMany({
    where: {
      ...siteAccessForOrder,
      status: "PENDING",
      dateOfOrder: { lte: sendOrderCutoff },
    },
    include: {
      supplier: { select: { id: true, name: true, contactEmail: true, contactName: true } },
      job: {
        include: {
          plot: {
            include: {
              site: { select: { id: true, name: true } },
            },
          },
        },
      },
      orderItems: true,
    },
    orderBy: { dateOfOrder: "asc" },
  });

  // 3. Sign Off Jobs — IN_PROGRESS leaf jobs with endDate within 3 days (not overdue)
  const signOffJobs = await prisma.job.findMany({
    where: {
      ...siteAccess,
      ...leafOnly,
      status: "IN_PROGRESS",
      endDate: { gte: now, lte: in3Days },
    },
    include: {
      plot: {
        include: {
          site: { select: { id: true, name: true } },
        },
      },
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: { endDate: "asc" },
  });

  // 4. Overdue Jobs — IN_PROGRESS leaf jobs past their end date
  const overdueJobs = await prisma.job.findMany({
    where: {
      ...siteAccess,
      ...leafOnly,
      status: "IN_PROGRESS",
      endDate: { lt: now },
    },
    include: {
      plot: {
        include: {
          site: { select: { id: true, name: true } },
        },
      },
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: { endDate: "asc" },
  });

  // 4b. Late Start — NOT_STARTED leaf jobs whose start date has passed
  const lateStartJobs = await prisma.job.findMany({
    where: {
      ...siteAccess,
      ...leafOnly,
      status: "NOT_STARTED",
      startDate: { lt: now },
    },
    include: {
      plot: {
        include: {
          site: { select: { id: true, name: true } },
        },
      },
      assignedTo: { select: { id: true, name: true } },
    },
    orderBy: { startDate: "asc" },
  });

  // 5. Overdue Materials — ORDERED orders past expected delivery date
  const overdueOrders = await prisma.materialOrder.findMany({
    where: {
      ...siteAccessForOrder,
      status: "ORDERED",
      expectedDeliveryDate: { lt: now },
    },
    include: {
      supplier: { select: { id: true, name: true, contactEmail: true, contactName: true } },
      job: {
        include: {
          plot: {
            include: {
              site: { select: { id: true, name: true } },
            },
          },
        },
      },
      orderItems: true,
    },
    orderBy: { expectedDeliveryDate: "asc" },
  });

  // 5b. Waiting on Delivery — ORDERED orders with delivery date in the future (beyond 7-day confirm window)
  const awaitingDelivery = await prisma.materialOrder.findMany({
    where: {
      ...siteAccessForOrder,
      status: "ORDERED",
      expectedDeliveryDate: { gt: in7Days },
    },
    include: {
      supplier: { select: { id: true, name: true, contactEmail: true, contactName: true } },
      job: {
        include: {
          plot: {
            include: {
              site: { select: { id: true, name: true } },
            },
          },
        },
      },
      orderItems: true,
    },
    orderBy: { expectedDeliveryDate: "asc" },
  });

  // 6. Upcoming — next 7 days of leaf job starts + deliveries
  const upcomingJobs = await prisma.job.findMany({
    where: {
      ...siteAccess,
      ...leafOnly,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
      startDate: { gte: now, lte: in7Days },
    },
    include: {
      plot: {
        include: {
          site: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { startDate: "asc" },
    take: 20,
  });

  const upcomingDeliveries = await prisma.materialOrder.findMany({
    where: {
      ...siteAccessForOrder,
      status: "ORDERED",
      expectedDeliveryDate: { gte: now, lte: in7Days },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      job: {
        include: {
          plot: {
            include: {
              site: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
    orderBy: { expectedDeliveryDate: "asc" },
    take: 20,
  });

  return NextResponse.json({
    confirmDelivery: JSON.parse(JSON.stringify(confirmDelivery)),
    sendOrder: JSON.parse(JSON.stringify(sendOrder)),
    signOffJobs: JSON.parse(JSON.stringify(signOffJobs)),
    overdueJobs: JSON.parse(JSON.stringify(overdueJobs)),
    lateStartJobs: JSON.parse(JSON.stringify(lateStartJobs)),
    overdueOrders: JSON.parse(JSON.stringify(overdueOrders)),
    awaitingDelivery: JSON.parse(JSON.stringify(awaitingDelivery)),
    upcomingJobs: JSON.parse(JSON.stringify(upcomingJobs)),
    upcomingDeliveries: JSON.parse(JSON.stringify(upcomingDeliveries)),
    counts: {
      confirmDelivery: confirmDelivery.length,
      sendOrder: sendOrder.length,
      signOffJobs: signOffJobs.length,
      overdueJobs: overdueJobs.length,
      lateStartJobs: lateStartJobs.length,
      overdueOrders: overdueOrders.length,
      awaitingDelivery: awaitingDelivery.length,
      upcoming: upcomingJobs.length + upcomingDeliveries.length,
    },
  });
}
