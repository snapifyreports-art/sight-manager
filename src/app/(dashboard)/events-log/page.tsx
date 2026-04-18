import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserSiteIds } from "@/lib/site-access";
import { redirect } from "next/navigation";
import { EventsClient } from "@/components/events/EventsClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Events Log | Sight Manager",
};

export default async function EventsLogPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Scope event log + site filter dropdown to sites the user can access
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  const eventWhere = siteIds !== null ? { siteId: { in: siteIds } } : {};
  const siteWhere = siteIds !== null ? { id: { in: siteIds } } : {};

  const [events, total, sites] = await Promise.all([
    prisma.eventLog.findMany({
      where: eventWhere,
      include: {
        user: { select: { id: true, name: true, email: true } },
        site: { select: { id: true, name: true } },
        plot: { select: { id: true, name: true, siteId: true } },
        job: { select: { id: true, name: true, plotId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.eventLog.count({ where: eventWhere }),
    prisma.site.findMany({
      where: siteWhere,
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / 50);

  // Serialize dates for client component
  const serializedEvents = events.map((event) => ({
    ...event,
    createdAt: event.createdAt.toISOString(),
  }));

  return (
    <EventsClient
      initialEvents={serializedEvents}
      initialPagination={{
        total,
        page: 1,
        totalPages,
      }}
      sites={sites}
    />
  );
}
