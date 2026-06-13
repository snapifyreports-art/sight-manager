import { prisma } from "@/lib/prisma";
import { verifyLiveToken } from "@/lib/share-token";
import { addDays } from "date-fns";
import { whereJobEndOverdue, whereJobStartOverdue } from "@/lib/lateness";
import { whereOrdersForSite } from "@/lib/order-scope";
import { LiveCabinScreen } from "./LiveCabinScreen";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * /live/[token] — read-only wall-mounted TV mode.
 *
 * (May 2026 Keith strategic) Designed to live on the portacabin TV.
 * No auth, no chrome, huge type, auto-rotates between today's jobs /
 * deliveries / open snags / safety. Access is token-bound: the site
 * manager generates a long-lived link on the Site Detail page and
 * pins it as the cabin's homepage.
 *
 * Data is rendered server-side on each request; the client component
 * auto-refreshes the page on a long interval so the cabin TV stays
 * current without needing an interactive viewer.
 */
export default async function LiveCabinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payload = verifyLiveToken(token);
  if (!payload) {
    return <ExpiredCard />;
  }

  const site = await prisma.site.findUnique({
    where: { id: payload.siteId },
    select: { id: true, name: true, location: true, status: true },
  });
  if (!site || site.status === "COMPLETED") {
    return <ExpiredCard />;
  }

  const now = new Date();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  const tomorrow = addDays(dayStart, 1);
  const tomorrowEnd = addDays(dayStart, 2);

  const [
    jobsStartingToday,
    jobsInProgress,
    jobsStartingTomorrow,
    overdueCount,
    openSnags,
    deliveriesToday,
    overdueDeliveriesCount,
    inspectionsDueWeek,
    inspectionsOverdue,
  ] = await Promise.all([
    prisma.job.findMany({
      where: {
        plot: { siteId: site.id },
        startDate: { gte: dayStart, lt: dayEnd },
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        children: { none: {} },
      },
      select: {
        id: true,
        name: true,
        plot: { select: { plotNumber: true, name: true } },
        contractors: {
          select: { contact: { select: { name: true, company: true } } },
          take: 1,
        },
      },
      orderBy: { sortOrder: "asc" },
      take: 12,
    }),
    prisma.job.count({
      where: {
        plot: { siteId: site.id },
        status: "IN_PROGRESS",
        children: { none: {} },
      },
    }),
    prisma.job.findMany({
      where: {
        plot: { siteId: site.id },
        startDate: { gte: tomorrow, lt: tomorrowEnd },
        status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
        children: { none: {} },
      },
      select: {
        id: true,
        name: true,
        plot: { select: { plotNumber: true, name: true } },
      },
      orderBy: { sortOrder: "asc" },
      take: 12,
    }),
    prisma.job.count({
      where: {
        plot: { siteId: site.id },
        ...whereJobEndOverdue(dayStart),
        children: { none: {} },
      },
    }),
    prisma.snag.count({
      where: {
        plot: { siteId: site.id },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
    prisma.materialOrder.findMany({
      // (Jun 2026 Wave-4 B14) Use the canonical order-scope helper — the
      // inline OR was missing the direct-plot branch, so plot-level one-off
      // orders were dropped from the cabin's delivery tiles.
      where: {
        ...whereOrdersForSite(site.id),
        status: "ORDERED",
        expectedDeliveryDate: { gte: dayStart, lt: dayEnd },
      },
      select: {
        id: true,
        itemsDescription: true,
        supplier: { select: { name: true } },
      },
      take: 8,
    }),
    prisma.materialOrder.count({
      where: {
        ...whereOrdersForSite(site.id),
        status: "ORDERED",
        expectedDeliveryDate: { lt: dayStart },
      },
    }),
    // (Jun 2026 S2) Inspections tile — due in the next 7 days + truly
    // overdue (date passed, nothing booked).
    prisma.inspection.count({
      where: {
        plot: { siteId: site.id },
        status: { in: ["SCHEDULED", "BOOKED"] },
        scheduledDate: { gte: dayStart, lt: addDays(dayStart, 7) },
      },
    }),
    prisma.inspection.count({
      where: { plot: { siteId: site.id }, status: "OVERDUE", bookedDate: null },
    }),
  ]);

  void whereJobStartOverdue; // imported for potential future use

  return (
    <LiveCabinScreen
      site={site}
      jobsStartingToday={jobsStartingToday.map((j) => ({
        id: j.id,
        name: j.name,
        plotLabel: j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name,
        contractor:
          j.contractors[0]?.contact?.company ??
          j.contractors[0]?.contact?.name ??
          null,
      }))}
      jobsInProgress={jobsInProgress}
      jobsStartingTomorrow={jobsStartingTomorrow.map((j) => ({
        id: j.id,
        name: j.name,
        plotLabel: j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name,
      }))}
      overdueCount={overdueCount}
      openSnags={openSnags}
      deliveriesToday={deliveriesToday.map((d) => ({
        id: d.id,
        items: d.itemsDescription ?? "(unspecified)",
        supplier: d.supplier.name,
      }))}
      overdueDeliveriesCount={overdueDeliveriesCount}
      inspectionsDueWeek={inspectionsDueWeek}
      inspectionsOverdue={inspectionsOverdue}
    />
  );
}

function ExpiredCard() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-black text-white">
      <div className="rounded-2xl border border-white/20 bg-white/5 p-12 text-center">
        <h1 className="text-3xl font-bold">Live screen link not active</h1>
        <p className="mt-3 text-base text-white/70">
          The token has expired or the site is no longer active. Ask an admin
          for a fresh link.
        </p>
      </div>
    </main>
  );
}
