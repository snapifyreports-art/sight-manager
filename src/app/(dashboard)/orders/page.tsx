import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserSiteIds } from "@/lib/site-access";
import { redirect } from "next/navigation";
import { OrdersClient } from "@/components/orders/OrdersClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Orders | Sight Manager",
};

export default async function OrdersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Scope orders + jobs to sites the user can access
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  const orderWhere = siteIds !== null ? { job: { plot: { siteId: { in: siteIds } } } } : {};
  const jobWhere = siteIds !== null ? { plot: { siteId: { in: siteIds } } } : {};

  const [orders, suppliers, jobs] = await Promise.all([
    prisma.materialOrder.findMany({
      // Main Orders page shows job-based orders only. One-off orders (jobId=null)
      // live under the Quants tab at site admin level.
      where: { ...orderWhere, jobId: { not: null } },
      include: {
        supplier: true,
        contact: true,
        orderItems: true,
        job: {
          include: {
            plot: { include: { site: true } },
          },
        },
      },
      orderBy: { dateOfOrder: "desc" },
    }),
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
    }),
    prisma.job.findMany({
      where: { ...jobWhere, children: { none: {} } },
      include: {
        plot: { include: { site: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Serialize dates for client component. Query filters jobId: not null so job is guaranteed.
  const serializedOrders = orders
    .filter((o): o is typeof o & { jobId: string; job: NonNullable<typeof o.job> } => !!o.job)
    .map((order) => ({
      ...order,
      jobId: order.jobId as string,
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
      orderItems: order.orderItems.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
      job: {
        ...order.job,
        startDate: order.job.startDate?.toISOString() ?? null,
        endDate: order.job.endDate?.toISOString() ?? null,
        createdAt: order.job.createdAt.toISOString(),
        updatedAt: order.job.updatedAt.toISOString(),
        plot: {
          ...order.job.plot,
          createdAt: order.job.plot.createdAt.toISOString(),
          updatedAt: order.job.plot.updatedAt.toISOString(),
          site: {
            ...order.job.plot.site,
            createdAt: order.job.plot.site.createdAt.toISOString(),
            updatedAt: order.job.plot.site.updatedAt.toISOString(),
          },
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
    plot: {
      ...j.plot,
      createdAt: j.plot.createdAt.toISOString(),
      updatedAt: j.plot.updatedAt.toISOString(),
      site: {
        ...j.plot.site,
        createdAt: j.plot.site.createdAt.toISOString(),
        updatedAt: j.plot.site.updatedAt.toISOString(),
      },
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
