import { prisma } from "@/lib/prisma";
import { OrdersClient } from "@/components/orders/OrdersClient";

export const metadata = {
  title: "Orders | Sight Manager",
};

export default async function OrdersPage() {
  const [orders, suppliers, jobs] = await Promise.all([
    prisma.materialOrder.findMany({
      include: {
        supplier: true,
        job: {
          include: {
            workflow: true,
          },
        },
      },
      orderBy: { dateOfOrder: "desc" },
    }),
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.job.findMany({
      include: {
        workflow: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Serialize dates for client component
  const serializedOrders = orders.map((order) => ({
    ...order,
    dateOfOrder: order.dateOfOrder.toISOString(),
    expectedDeliveryDate: order.expectedDeliveryDate?.toISOString() ?? null,
    deliveredDate: order.deliveredDate?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    supplier: {
      ...order.supplier,
      createdAt: order.supplier.createdAt.toISOString(),
      updatedAt: order.supplier.updatedAt.toISOString(),
    },
    job: {
      ...order.job,
      startDate: order.job.startDate?.toISOString() ?? null,
      endDate: order.job.endDate?.toISOString() ?? null,
      createdAt: order.job.createdAt.toISOString(),
      updatedAt: order.job.updatedAt.toISOString(),
      workflow: {
        ...order.job.workflow,
        createdAt: order.job.workflow.createdAt.toISOString(),
        updatedAt: order.job.workflow.updatedAt.toISOString(),
      },
    },
  }));

  const serializedSuppliers = suppliers.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  const serializedJobs = jobs.map((j) => ({
    ...j,
    startDate: j.startDate?.toISOString() ?? null,
    endDate: j.endDate?.toISOString() ?? null,
    createdAt: j.createdAt.toISOString(),
    updatedAt: j.updatedAt.toISOString(),
    workflow: {
      ...j.workflow,
      createdAt: j.workflow.createdAt.toISOString(),
      updatedAt: j.workflow.updatedAt.toISOString(),
    },
  }));

  return (
    <OrdersClient
      initialOrders={serializedOrders}
      suppliers={serializedSuppliers}
      jobs={serializedJobs}
    />
  );
}
