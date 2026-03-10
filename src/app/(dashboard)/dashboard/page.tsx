import { prisma } from "@/lib/prisma";
import { DashboardClient, type DashboardData } from "@/components/dashboard/DashboardClient";

export const metadata = {
  title: "Dashboard | Sight Manager",
};

export default async function DashboardPage() {
  // Run all queries in parallel for performance
  const [
    totalSites,
    totalContacts,
    pendingOrders,
    jobStatusCounts,
    recentEvents,
    trafficLightJobs,
  ] = await Promise.all([
    // Total sites
    prisma.site.count(),

    // Total contacts
    prisma.contact.count(),

    // Pending orders
    prisma.materialOrder.count({
      where: { status: "PENDING" },
    }),

    // Jobs grouped by status
    prisma.job.groupBy({
      by: ["status"],
      _count: { status: true },
    }),

    // Recent 10 events with relations
    prisma.eventLog.findMany({
      take: 10,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true } },
        site: { select: { name: true } },
        job: { select: { name: true } },
      },
    }),

    // Jobs for traffic light display (exclude completed, limit for display)
    prisma.job.findMany({
      take: 12,
      orderBy: { updatedAt: "desc" },
      where: {
        status: { in: ["IN_PROGRESS", "ON_HOLD", "NOT_STARTED"] },
      },
      select: {
        id: true,
        name: true,
        status: true,
        plot: {
          select: {
            name: true,
            site: { select: { name: true } },
          },
        },
        assignedTo: { select: { name: true } },
      },
    }),
  ]);

  // Build the job status map with defaults
  const jobsByStatus = {
    NOT_STARTED: 0,
    IN_PROGRESS: 0,
    ON_HOLD: 0,
    COMPLETED: 0,
  };

  for (const row of jobStatusCounts) {
    jobsByStatus[row.status] = row._count.status;
  }

  const activeJobs = jobsByStatus.IN_PROGRESS + jobsByStatus.NOT_STARTED;

  // Serialize dates for client component
  const data: DashboardData = {
    stats: {
      totalSites,
      activeJobs,
      pendingOrders,
      totalContacts,
    },
    jobsByStatus,
    recentEvents: recentEvents.map((event) => ({
      id: event.id,
      type: event.type,
      description: event.description,
      createdAt: event.createdAt.toISOString(),
      user: event.user,
      site: event.site,
      job: event.job,
    })),
    trafficLightJobs,
  };

  return <DashboardClient data={data} />;
}
