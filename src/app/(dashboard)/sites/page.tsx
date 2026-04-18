import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserSiteIds } from "@/lib/site-access";
import { SitesClient } from "@/components/sites/SitesClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sites | Sight Manager",
};

export default async function SitesPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Scope to sites the user can access — CEOs/DIRECTORs see all, others filtered
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  const siteWhere = siteIds !== null ? { id: { in: siteIds } } : {};

  const sites = await prisma.site.findMany({
    where: siteWhere,
    orderBy: { createdAt: "desc" },
    include: {
      plots: {
        include: {
          // Leaf jobs only — parents are derived rollups
          jobs: {
            where: { children: { none: {} } },
          },
        },
      },
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { plots: true },
      },
    },
  });

  // Serialize dates for client component
  const serialized = sites.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    location: s.location,
    address: s.address,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    createdBy: s.createdBy,
    _count: s._count,
    jobStatusSummary: {
      NOT_STARTED: s.plots.flatMap((p) => p.jobs).filter((j) => j.status === "NOT_STARTED").length,
      IN_PROGRESS: s.plots.flatMap((p) => p.jobs).filter((j) => j.status === "IN_PROGRESS").length,
      ON_HOLD: s.plots.flatMap((p) => p.jobs).filter((j) => j.status === "ON_HOLD").length,
      COMPLETED: s.plots.flatMap((p) => p.jobs).filter((j) => j.status === "COMPLETED").length,
    },
  }));

  return <SitesClient sites={serialized} />;
}
