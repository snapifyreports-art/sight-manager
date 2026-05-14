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
      assignedTo: {
        select: { id: true, name: true },
      },
      plots: {
        orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
        include: {
          // Only LEAF jobs — parent-stage jobs are derived rollups that would
          // double-count in jobStatusSummary and total counts
          jobs: {
            where: { children: { none: {} } },
            orderBy: { createdAt: "asc" },
            include: {
              assignedTo: {
                select: { id: true, name: true },
              },
              // (May 2026 Keith request) Per-plot order summary for the
              // plot cards — "next order to send" + "deliveries awaited".
              orders: {
                select: {
                  id: true,
                  status: true,
                  dateOfOrder: true,
                  deliveredDate: true,
                },
              },
            },
          },
          _count: {
            select: {
              jobs: { where: { children: { none: {} } } },
              // (May 2026 Keith request) Open-snag count for the plot cards.
              snags: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } } },
            },
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
    assignedTo: site.assignedTo ?? null,
    _count: site._count,
    plots: site.plots.sort((a, b) => {
      const numA = parseInt(a.plotNumber ?? "", 10);
      const numB = parseInt(b.plotNumber ?? "", 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return (a.plotNumber ?? "").localeCompare(b.plotNumber ?? "");
    }).map((plot) => {
      const leafJobs = plot.jobs;
      const orders = leafJobs.flatMap((j) => j.orders);

      // (May 2026 Keith request) "More info from face value" on the plot
      // cards. Aggregated server-side so the client gets clean values
      // and doesn't need every job/order shipped to the browser. The
      // dev-date-relative bits ("ends in 3d") are computed client-side
      // where getCurrentDate() is available.

      // Current stage = the in-progress leaf job (earliest-started if
      // several). "Stage end" = the latest end across jobs sharing its
      // parentStage, so a multi-job stage reads as one block.
      const inProgress = leafJobs
        .filter((j) => j.status === "IN_PROGRESS")
        .sort(
          (a, b) =>
            (a.startDate?.getTime() ?? 0) - (b.startDate?.getTime() ?? 0),
        );
      let currentStage: { label: string; endDate: string | null } | null = null;
      if (inProgress.length > 0) {
        const cur = inProgress[0];
        const stageJobs = cur.parentStage
          ? leafJobs.filter((j) => j.parentStage === cur.parentStage)
          : [cur];
        const ends = stageJobs
          .map((j) => j.endDate)
          .filter((d): d is Date => !!d);
        const stageEnd = ends.length
          ? new Date(Math.max(...ends.map((d) => d.getTime())))
          : null;
        currentStage = {
          label: cur.parentStage || cur.name,
          endDate: stageEnd?.toISOString() ?? null,
        };
      }

      // Next stage = earliest-starting NOT_STARTED job (only surfaced
      // when nothing's in progress — "what's coming up on this plot").
      let nextStage: { label: string; startDate: string | null } | null = null;
      if (!currentStage) {
        const notStarted = leafJobs
          .filter((j) => j.status === "NOT_STARTED" && j.startDate)
          .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime());
        if (notStarted.length > 0) {
          const nx = notStarted[0];
          nextStage = {
            label: nx.parentStage || nx.name,
            startDate: nx.startDate!.toISOString(),
          };
        }
      }

      const allComplete =
        leafJobs.length > 0 && leafJobs.every((j) => j.status === "COMPLETED");

      // Orders: next one still to send + how many are out awaiting delivery.
      const pendingOrders = orders.filter((o) => o.status === "PENDING");
      const pendingDates = pendingOrders
        .map((o) => o.dateOfOrder)
        .filter((d): d is Date => !!d);
      const nextOrderDate = pendingDates.length
        ? new Date(
            Math.min(...pendingDates.map((d) => d.getTime())),
          ).toISOString()
        : null;
      const awaitingDeliveryCount = orders.filter(
        (o) => o.status === "ORDERED" && !o.deliveredDate,
      ).length;

      return {
        id: plot.id,
        name: plot.name,
        description: plot.description,
        plotNumber: plot.plotNumber,
        houseType: plot.houseType,
        createdAt: plot.createdAt.toISOString(),
        _count: { jobs: plot._count.jobs },
        jobStatusSummary: {
          NOT_STARTED: leafJobs.filter((j) => j.status === "NOT_STARTED").length,
          IN_PROGRESS: leafJobs.filter((j) => j.status === "IN_PROGRESS").length,
          ON_HOLD: leafJobs.filter((j) => j.status === "ON_HOLD").length,
          COMPLETED: leafJobs.filter((j) => j.status === "COMPLETED").length,
        },
        // (May 2026 Keith request) At-a-glance plot-card extras.
        currentStage,
        nextStage,
        allComplete,
        pendingOrderCount: pendingOrders.length,
        nextOrderDate,
        awaitingDeliveryCount,
        openSnagCount: plot._count.snags,
      };
    }),
  };

  return <SiteDetailClient site={serialized} initialTab={initialTab} initialSnagId={initialSnagId} />;
}
