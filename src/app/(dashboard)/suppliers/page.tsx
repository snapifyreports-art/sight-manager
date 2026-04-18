import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserSiteIds } from "@/lib/site-access";
import { redirect } from "next/navigation";
import { SuppliersAndContractorsPage } from "@/components/suppliers/SuppliersAndContractorsPage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Suppliers & Contractors | Sight Manager",
};

export default async function SuppliersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Scope linked sites to caller's accessible sites
  const accessibleSiteIds = await getUserSiteIds(session.user.id, session.user.role);
  const orderWhere = accessibleSiteIds === null
    ? {}
    : { job: { plot: { siteId: { in: accessibleSiteIds } } } };
  const jobContractorWhere = accessibleSiteIds === null
    ? {}
    : { job: { plot: { siteId: { in: accessibleSiteIds } } } };

  const [suppliers, contractors] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { orders: true, materials: true } },
        orders: {
          where: { ...orderWhere, status: { not: "CANCELLED" } },
          select: {
            status: true,
            job: { select: { plot: { select: { site: { select: { id: true, name: true, status: true } } } } } },
          },
        },
      },
    }),
    prisma.contact.findMany({
      where: { type: "CONTRACTOR" },
      orderBy: { name: "asc" },
      include: {
        jobContractors: {
          where: jobContractorWhere,
          select: {
            job: {
              select: {
                status: true,
                plot: { select: { site: { select: { id: true, name: true, status: true } } } },
              },
            },
          },
        },
        orders: {
          where: { ...orderWhere, status: { not: "CANCELLED" } },
          select: {
            status: true,
            job: { select: { plot: { select: { site: { select: { id: true, name: true, status: true } } } } } },
          },
        },
      },
    }),
  ]);

  const serializedSuppliers = suppliers.map((s) => {
    const siteMap = new Map<string, { id: string; name: string; status: string; openOrders: number; totalOrders: number }>();
    for (const o of s.orders) {
      const site = o.job.plot.site;
      const e = siteMap.get(site.id) ?? { id: site.id, name: site.name, status: site.status, openOrders: 0, totalOrders: 0 };
      e.totalOrders++;
      if (o.status !== "DELIVERED") e.openOrders++;
      siteMap.set(site.id, e);
    }
    return {
      id: s.id,
      name: s.name,
      contactName: s.contactName,
      contactEmail: s.contactEmail,
      contactNumber: s.contactNumber,
      type: s.type,
      accountNumber: s.accountNumber,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      _count: s._count,
      linkedSites: Array.from(siteMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

  const serializedContractors = contractors.map((c) => {
    const siteMap = new Map<string, { id: string; name: string; status: string; activeJobs: number; totalJobs: number; openOrders: number }>();
    for (const jc of c.jobContractors) {
      const site = jc.job.plot.site;
      const e = siteMap.get(site.id) ?? { id: site.id, name: site.name, status: site.status, activeJobs: 0, totalJobs: 0, openOrders: 0 };
      e.totalJobs++;
      if (jc.job.status === "IN_PROGRESS" || jc.job.status === "NOT_STARTED") e.activeJobs++;
      siteMap.set(site.id, e);
    }
    for (const o of c.orders) {
      const site = o.job.plot.site;
      const e = siteMap.get(site.id) ?? { id: site.id, name: site.name, status: site.status, activeJobs: 0, totalJobs: 0, openOrders: 0 };
      if (o.status !== "DELIVERED") e.openOrders++;
      siteMap.set(site.id, e);
    }
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      type: c.type as "SUPPLIER" | "CONTRACTOR",
      company: c.company,
      notes: c.notes,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      linkedSites: Array.from(siteMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    };
  });

  return (
    <Suspense>
      <SuppliersAndContractorsPage
        suppliers={serializedSuppliers}
        contractors={serializedContractors}
      />
    </Suspense>
  );
}
