import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SiteDetailClient } from "@/components/sites/SiteDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { name: true },
  });

  return {
    title: site
      ? `${site.name} | Sight Manager`
      : "Site | Sight Manager",
  };
}

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ tab?: string; snagId?: string }>;
}) {
  const { siteId } = await params;
  const { tab: initialTab, snagId: initialSnagId } = await searchParams;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      plots: {
        orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
        include: {
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
      },
      _count: {
        select: { plots: true },
      },
    },
  });

  if (!site) {
    notFound();
  }

  // Serialize dates for client component
  const serialized = {
    id: site.id,
    name: site.name,
    description: site.description,
    location: site.location,
    address: site.address,
    postcode: site.postcode,
    status: site.status,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString(),
    createdBy: site.createdBy,
    _count: site._count,
    plots: site.plots.sort((a, b) => {
      const numA = parseInt(a.plotNumber ?? "", 10);
      const numB = parseInt(b.plotNumber ?? "", 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return (a.plotNumber ?? "").localeCompare(b.plotNumber ?? "");
    }).map((plot) => ({
      id: plot.id,
      name: plot.name,
      description: plot.description,
      plotNumber: plot.plotNumber,
      houseType: plot.houseType,
      createdAt: plot.createdAt.toISOString(),
      _count: plot._count,
      jobStatusSummary: {
        NOT_STARTED: plot.jobs.filter((j) => j.status === "NOT_STARTED").length,
        IN_PROGRESS: plot.jobs.filter((j) => j.status === "IN_PROGRESS").length,
        ON_HOLD: plot.jobs.filter((j) => j.status === "ON_HOLD").length,
        COMPLETED: plot.jobs.filter((j) => j.status === "COMPLETED").length,
      },
    })),
  };

  return <SiteDetailClient site={serialized} initialTab={initialTab} initialSnagId={initialSnagId} />;
}
