import { prisma } from "@/lib/prisma";
import { SitesClient } from "@/components/sites/SitesClient";

export const metadata = {
  title: "Sites | Sight Manager",
};

export default async function SitesPage() {
  const sites = await prisma.site.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      plots: {
        include: {
          jobs: true,
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
