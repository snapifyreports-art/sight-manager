import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addDays } from "date-fns";
import { getServerCurrentDate } from "@/lib/dev-date";
import { getUserSiteIds } from "@/lib/site-access";
import {
  whereJobEndOverdue,
  whereJobStartOverdue,
  whereOrderOverdue,
} from "@/lib/lateness";

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
  const sendOrderCutoff = addDays(now, 14);

  // Shared include shape for "rich" order responses — supplier + site
  // address/postcode + plot number so the email template has everything
  // it needs without a second round-trip.
  const richOrderInclude = {
    supplier: { select: { id: true, name: true, contactEmail: true, contactName: true, accountNumber: true } },
    job: {
      include: {
        plot: {
          select: {
            id: true,
            name: true,
            plotNumber: true,
            site: { select: { id: true, name: true, address: true, postcode: true } },
          },
        },
      },
    },
    orderItems: true,
  } as const;

  const slimJobInclude = {
    plot: {
      include: {
        site: { select: { id: true, name: true } },
      },
    },
    assignedTo: { select: { id: true, name: true } },
  } as const;

  // Run all 9 queries in parallel — they're all independent reads.
  // Previously sequential (~5.7s HTTP time); parallel should drop to the
  // longest single query (~700ms) since Prisma's pool + Supabase pgbouncer
  // handle the concurrency fine for reads of this shape.
  const [
    confirmDelivery,
    sendOrder,
    signOffJobs,
    overdueJobs,
    lateStartJobs,
    overdueOrders,
    awaitingDelivery,
    upcomingJobs,
    upcomingDeliveries,
  ] = await Promise.all([
    // 1. Confirm Delivery — orders ORDERED with delivery within 7 days (not overdue)
    prisma.materialOrder.findMany({
      where: { ...siteAccessForOrder, status: "ORDERED", expectedDeliveryDate: { gte: now, lte: in7Days } },
      include: richOrderInclude,
      orderBy: { expectedDeliveryDate: "asc" },
    }),
    // 2. Send Order — orders still PENDING whose dateOfOrder is within 14 days
    prisma.materialOrder.findMany({
      where: { ...siteAccessForOrder, status: "PENDING", dateOfOrder: { lte: sendOrderCutoff } },
      include: richOrderInclude,
      orderBy: { dateOfOrder: "asc" },
    }),
    // 3. Sign Off Jobs — IN_PROGRESS leaf jobs with endDate within 3 days
    prisma.job.findMany({
      where: { ...siteAccess, ...leafOnly, status: "IN_PROGRESS", endDate: { gte: now, lte: in3Days } },
      include: slimJobInclude,
      orderBy: { endDate: "asc" },
    }),
    // 4. Overdue Jobs — leaf jobs past their end date (any non-COMPLETED).
    // (#177) Was narrower (`status: IN_PROGRESS`); broadened to match
    // Daily Brief's definition so a job appears as "overdue" in
    // exactly the same buckets across the app.
    prisma.job.findMany({
      where: { ...siteAccess, ...leafOnly, ...whereJobEndOverdue(now) },
      include: slimJobInclude,
      orderBy: { endDate: "asc" },
    }),
    // 4b. Late Start — NOT_STARTED leaf jobs whose start date has passed
    prisma.job.findMany({
      where: { ...siteAccess, ...leafOnly, ...whereJobStartOverdue(now) },
      include: slimJobInclude,
      orderBy: { startDate: "asc" },
    }),
    // 5. Overdue Materials — ORDERED orders past expected delivery date
    prisma.materialOrder.findMany({
      where: { ...siteAccessForOrder, ...whereOrderOverdue(now) },
      include: richOrderInclude,
      orderBy: { expectedDeliveryDate: "asc" },
    }),
    // 5b. Waiting on Delivery — ORDERED orders beyond 7-day confirm window
    prisma.materialOrder.findMany({
      where: { ...siteAccessForOrder, status: "ORDERED", expectedDeliveryDate: { gt: in7Days } },
      include: richOrderInclude,
      orderBy: { expectedDeliveryDate: "asc" },
    }),
    // 6. Upcoming — next 7 days of leaf job starts
    prisma.job.findMany({
      where: { ...siteAccess, ...leafOnly, status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, startDate: { gte: now, lte: in7Days } },
      include: { plot: { include: { site: { select: { id: true, name: true } } } } },
      orderBy: { startDate: "asc" },
      take: 20,
    }),
    // Upcoming deliveries — next 7 days
    prisma.materialOrder.findMany({
      where: { ...siteAccessForOrder, status: "ORDERED", expectedDeliveryDate: { gte: now, lte: in7Days } },
      include: {
        supplier: { select: { id: true, name: true } },
        job: { include: { plot: { include: { site: { select: { id: true, name: true } } } } } },
      },
      orderBy: { expectedDeliveryDate: "asc" },
      take: 20,
    }),
  ]);

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
