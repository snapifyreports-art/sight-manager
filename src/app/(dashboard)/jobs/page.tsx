import { prisma } from "@/lib/prisma";
import { JobsClient } from "@/components/jobs/JobsClient";

export const metadata = {
  title: "Jobs | Sight Manager",
};

export default async function JobsPage() {
  const [jobs, workflows, users] = await Promise.all([
    prisma.job.findMany({
      include: {
        workflow: true,
        assignedTo: true,
        _count: { select: { orders: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.workflow.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Serialize dates for client component
  const serializedJobs = jobs.map((job) => ({
    ...job,
    startDate: job.startDate?.toISOString() ?? null,
    endDate: job.endDate?.toISOString() ?? null,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    workflow: {
      ...job.workflow,
      createdAt: job.workflow.createdAt.toISOString(),
      updatedAt: job.workflow.updatedAt.toISOString(),
    },
    assignedTo: job.assignedTo
      ? {
          ...job.assignedTo,
          createdAt: job.assignedTo.createdAt.toISOString(),
          updatedAt: job.assignedTo.updatedAt.toISOString(),
        }
      : null,
  }));

  return (
    <JobsClient
      initialJobs={serializedJobs}
      workflows={workflows}
      users={users}
    />
  );
}
