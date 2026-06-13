import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserSiteIds } from "@/lib/site-access";
import { whereOrderNotOrphaned } from "@/lib/order-invariants";
import { redirect } from "next/navigation";
import { OrdersClient } from "@/components/orders/OrdersClient";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Orders | Sight Manager",
};

export default async function OrdersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Scope orders + jobs to sites the user can access.
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  // (Jun 2026 R23) One-off orders (jobId=null) attach directly to a plot
  // or a site, so the job-only predicate hid them from this page entirely.
  // Match the GET /api/orders SSoT: job's plot, direct plot, OR direct
  // site — and for admins (siteIds=null), drop only the contextless
  // orphan orders. Either way one-off orders now surface here.
  const orderWhere: Prisma.MaterialOrderWhereInput =
    siteIds !== null
      ? {
          OR: [
            { job: { plot: { siteId: { in: siteIds } } } },
            { plot: { siteId: { in: siteIds } } },
            { siteId: { in: siteIds } },
          ],
        }
      : { OR: whereOrderNotOrphaned.OR };
  const jobWhere = siteIds !== null ? { plot: { siteId: { in: siteIds } } } : {};

  const [orders, suppliers, jobs] = await Promise.all([
    prisma.materialOrder.findMany({
      where: orderWhere,
      include: {
        supplier: true,
        contact: true,
        orderItems: true,
        job: {
          include: {
            plot: { include: { site: true } },
          },
        },
        // (Jun 2026 R23) Direct plot/site attachments for one-off orders.
        plot: { include: { site: true } },
        site: true,
      },
      orderBy: { dateOfOrder: "desc" },
    }),
    prisma.supplier.findMany({
      // (Jun 2026 audit) Archived suppliers must not be pickable for new
      // orders — the site wizard's GET /api/suppliers already excludes
      // them; this page's New Order dropdown didn't.
      where: { archivedAt: null },
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

  // (Jun 2026 R23) Serialize dates for the client component. `job` may be
  // null for one-off orders; the client falls back to the direct plot/site
  // attachment with a "One-off" badge.
  const serializedOrders = orders.map((order) => ({
    ...order,
    jobId: order.jobId,
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
    job: order.job
      ? {
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
        }
      : null,
    // One-off attachments — a plot (with its site) or the site directly.
    plot: order.plot
      ? {
          ...order.plot,
          createdAt: order.plot.createdAt.toISOString(),
          updatedAt: order.plot.updatedAt.toISOString(),
          site: {
            ...order.plot.site,
            createdAt: order.plot.site.createdAt.toISOString(),
            updatedAt: order.plot.site.updatedAt.toISOString(),
          },
        }
      : null,
    site: order.site
      ? {
          ...order.site,
          createdAt: order.site.createdAt.toISOString(),
          updatedAt: order.site.updatedAt.toISOString(),
        }
      : null,
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
