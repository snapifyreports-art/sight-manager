import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { WorkflowDetailClient } from "@/components/workflows/WorkflowDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const workflow = await prisma.workflow.findUnique({
    where: { id },
    select: { name: true },
  });

  return {
    title: workflow
      ? `${workflow.name} | Sight Manager`
      : "Workflow | Sight Manager",
  };
}

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      jobs: {
        orderBy: { createdAt: "asc" },
        include: {
          assignedTo: {
            select: { id: true, name: true },
          },
        },
      },
      _count: {
        select: { jobs: true },
      },
    },
  });

  if (!workflow) {
    notFound();
  }

  // Serialize dates for client component
  const serialized = {
    id: workflow.id,
    name: workflow.name,
    description: workflow.description,
    status: workflow.status,
    createdAt: workflow.createdAt.toISOString(),
    updatedAt: workflow.updatedAt.toISOString(),
    createdBy: workflow.createdBy,
    _count: workflow._count,
    jobs: workflow.jobs.map((job) => ({
      id: job.id,
      name: job.name,
      description: job.description,
      status: job.status,
      siteName: job.siteName,
      plot: job.plot,
      startDate: job.startDate?.toISOString() ?? null,
      endDate: job.endDate?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      assignedTo: job.assignedTo,
    })),
  };

  return <WorkflowDetailClient workflow={serialized} />;
}
