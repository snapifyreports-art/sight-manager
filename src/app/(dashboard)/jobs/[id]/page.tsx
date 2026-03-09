import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { JobDetailClient } from "@/components/jobs/JobDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await prisma.job.findUnique({
    where: { id },
    select: { name: true },
  });
  return {
    title: job ? `${job.name} | Sight Manager` : "Job Not Found",
  };
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const job = await prisma.job.findUnique({
    where: { id },
    include: {
      workflow: true,
      assignedTo: {
        select: { id: true, name: true, email: true, role: true },
      },
      orders: {
        include: {
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      actions: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!job) {
    notFound();
  }

  // Serialize dates for client component
  const serializedJob = {
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
    orders: job.orders.map((order) => ({
      ...order,
      dateOfOrder: order.dateOfOrder.toISOString(),
      expectedDeliveryDate: order.expectedDeliveryDate?.toISOString() ?? null,
      deliveredDate: order.deliveredDate?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    })),
    actions: job.actions.map((action) => ({
      ...action,
      createdAt: action.createdAt.toISOString(),
    })),
  };

  return <JobDetailClient job={serializedJob} />;
}
