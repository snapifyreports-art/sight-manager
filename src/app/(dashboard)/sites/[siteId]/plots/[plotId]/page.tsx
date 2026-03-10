import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PlotDetailClient } from "@/components/plots/PlotDetailClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteId: string; plotId: string }>;
}) {
  const { plotId } = await params;
  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { name: true },
  });
  return {
    title: plot ? `${plot.name} | Sight Manager` : "Plot Not Found",
  };
}

export default async function PlotDetailPage({
  params,
}: {
  params: Promise<{ siteId: string; plotId: string }>;
}) {
  const { siteId, plotId } = await params;

  const plot = await prisma.plot.findUnique({
    where: { id: plotId, siteId },
    include: {
      site: {
        select: { id: true, name: true },
      },
      jobs: {
        include: {
          assignedTo: {
            select: { id: true, name: true },
          },
          orders: {
            include: {
              supplier: { select: { id: true, name: true } },
              orderItems: {
                select: {
                  id: true,
                  name: true,
                  quantity: true,
                  unit: true,
                  unitCost: true,
                  totalCost: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!plot) {
    notFound();
  }

  // Serialize all dates to ISO strings for the client component
  const serializedPlot = {
    id: plot.id,
    name: plot.name,
    description: plot.description,
    site: plot.site,
    jobs: plot.jobs.map((job) => ({
      id: job.id,
      name: job.name,
      description: job.description,
      startDate: job.startDate?.toISOString() ?? null,
      endDate: job.endDate?.toISOString() ?? null,
      status: job.status,
      assignedTo: job.assignedTo
        ? { id: job.assignedTo.id, name: job.assignedTo.name }
        : null,
      orders: job.orders.map((order) => ({
        id: order.id,
        orderDetails: order.orderDetails,
        dateOfOrder: order.dateOfOrder.toISOString(),
        expectedDeliveryDate:
          order.expectedDeliveryDate?.toISOString() ?? null,
        deliveredDate: order.deliveredDate?.toISOString() ?? null,
        status: order.status,
        leadTimeDays: order.leadTimeDays,
        supplier: order.supplier,
        orderItems: order.orderItems.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unitCost: item.unitCost,
          totalCost: item.totalCost,
        })),
      })),
    })),
  };

  return <PlotDetailClient plot={serializedPlot} />;
}
