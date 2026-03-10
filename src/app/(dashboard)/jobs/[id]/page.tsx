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
      plot: { include: { site: true } },
      assignedTo: {
        select: { id: true, name: true, email: true, role: true },
      },
      contractors: {
        include: {
          contact: {
            select: { id: true, name: true, company: true, phone: true, email: true },
          },
        },
        orderBy: { createdAt: "asc" as const },
      },
      orders: {
        include: {
          supplier: { select: { id: true, name: true } },
          orderItems: true,
        },
        orderBy: { createdAt: "desc" },
      },
      actions: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      photos: {
        include: {
          uploadedBy: { select: { id: true, name: true } },
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
    plot: {
      ...job.plot,
      createdAt: job.plot.createdAt.toISOString(),
      updatedAt: job.plot.updatedAt.toISOString(),
      site: {
        ...job.plot.site,
        createdAt: job.plot.site.createdAt.toISOString(),
        updatedAt: job.plot.site.updatedAt.toISOString(),
      },
    },
    contractors: job.contractors.map((c) => ({
      id: c.id,
      contactId: c.contactId,
      contact: c.contact,
    })),
    orders: job.orders.map((order) => ({
      ...order,
      dateOfOrder: order.dateOfOrder.toISOString(),
      expectedDeliveryDate: order.expectedDeliveryDate?.toISOString() ?? null,
      deliveredDate: order.deliveredDate?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      orderItems: order.orderItems.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
    })),
    actions: job.actions.map((action) => ({
      ...action,
      createdAt: action.createdAt.toISOString(),
    })),
    photos: job.photos.map((photo) => ({
      ...photo,
      createdAt: photo.createdAt.toISOString(),
    })),
  };

  return <JobDetailClient job={serializedJob} />;
}
