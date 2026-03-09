import { prisma } from "@/lib/prisma";
import { EventsClient } from "@/components/events/EventsClient";

export const metadata = {
  title: "Events Log | Sight Manager",
};

export default async function EventsLogPage() {
  const [events, total, workflows] = await Promise.all([
    prisma.eventLog.findMany({
      include: {
        user: { select: { id: true, name: true, email: true } },
        workflow: { select: { id: true, name: true } },
        job: { select: { id: true, name: true, workflowId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.eventLog.count(),
    prisma.workflow.findMany({
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
      workflows={workflows}
    />
  );
}
