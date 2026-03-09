import { prisma } from "@/lib/prisma";
import { WorkflowsClient } from "@/components/workflows/WorkflowsClient";

export const metadata = {
  title: "Workflows | Sight Manager",
};

export default async function WorkflowsPage() {
  const workflows = await prisma.workflow.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      jobs: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { jobs: true },
      },
    },
  });

  // Serialize dates for client component
  const serialized = workflows.map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
    status: w.status,
    createdAt: w.createdAt.toISOString(),
    updatedAt: w.updatedAt.toISOString(),
    createdBy: w.createdBy,
    _count: w._count,
    jobStatusSummary: {
      NOT_STARTED: w.jobs.filter((j) => j.status === "NOT_STARTED").length,
      IN_PROGRESS: w.jobs.filter((j) => j.status === "IN_PROGRESS").length,
      ON_HOLD: w.jobs.filter((j) => j.status === "ON_HOLD").length,
      COMPLETED: w.jobs.filter((j) => j.status === "COMPLETED").length,
    },
  }));

  return <WorkflowsClient workflows={serialized} />;
}
