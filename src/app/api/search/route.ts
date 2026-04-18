import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// GET /api/search?q=searchterm — search across multiple entity types
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json(
      { error: "Search query must be at least 2 characters" },
      { status: 400 }
    );
  }

  const search = q.trim();
  const contains = { contains: search, mode: "insensitive" as const };

  // Scope search results to sites the user can access.
  // For admins (CEO/DIRECTOR) accessibleSiteIds is null → no filter.
  const accessibleSiteIds = await getUserSiteIds(session.user.id, (session.user as { role: string }).role);
  const siteFilter = accessibleSiteIds === null ? {} : { id: { in: accessibleSiteIds } };
  const viaSiteFilter = accessibleSiteIds === null ? {} : { siteId: { in: accessibleSiteIds } };
  const viaPlotSiteFilter = accessibleSiteIds === null ? {} : { plot: { siteId: { in: accessibleSiteIds } } };
  const viaJobPlotSiteFilter = accessibleSiteIds === null ? {} : { job: { plot: { siteId: { in: accessibleSiteIds } } } };

  const [sites, plots, jobs, contacts, orders, snags] = await Promise.all([
    // Sites — search by name, location, address
    prisma.site.findMany({
      where: {
        ...siteFilter,
        OR: [
          { name: contains },
          { location: contains },
          { address: contains },
        ],
      },
      select: { id: true, name: true, address: true },
      take: 5,
    }),

    // Plots — search by plotNumber, name, houseType
    prisma.plot.findMany({
      where: {
        ...viaSiteFilter,
        OR: [
          { plotNumber: contains },
          { name: contains },
          { houseType: contains },
        ],
      },
      select: {
        id: true,
        plotNumber: true,
        name: true,
        siteId: true,
        site: { select: { name: true } },
      },
      take: 5,
    }),

    // Jobs — search by name, description (leaf jobs + scoped to accessible sites)
    prisma.job.findMany({
      where: {
        ...viaPlotSiteFilter,
        children: { none: {} },
        OR: [{ name: contains }, { description: contains }],
      },
      select: {
        id: true,
        name: true,
        plotId: true,
        plot: {
          select: {
            plotNumber: true,
            name: true,
            siteId: true,
          },
        },
      },
      take: 5,
    }),

    // Contacts — search by name, company, email
    prisma.contact.findMany({
      where: {
        OR: [
          { name: contains },
          { company: contains },
          { email: contains },
        ],
      },
      select: { id: true, name: true, company: true, type: true },
      take: 5,
    }),

    // Material Orders — search by itemsDescription (scoped to accessible sites)
    prisma.materialOrder.findMany({
      where: { ...viaJobPlotSiteFilter, itemsDescription: contains },
      select: {
        id: true,
        itemsDescription: true,
        supplier: { select: { name: true } },
        job: {
          select: {
            name: true,
            plot: { select: { plotNumber: true } },
          },
        },
      },
      take: 5,
    }),

    // Snags — search by description, location (scoped to accessible sites)
    prisma.snag.findMany({
      where: {
        ...viaPlotSiteFilter,
        OR: [{ description: contains }, { location: contains }],
      },
      select: {
        id: true,
        description: true,
        plotId: true,
        plot: {
          select: {
            plotNumber: true,
            name: true,
            siteId: true,
          },
        },
      },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    sites: sites.map((s) => ({
      id: s.id,
      name: s.name,
      address: s.address,
    })),
    plots: plots.map((p) => ({
      id: p.id,
      plotNumber: p.plotNumber,
      name: p.name,
      siteId: p.siteId,
      siteName: p.site.name,
    })),
    jobs: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      plotNumber: j.plot.plotNumber,
      siteId: j.plot.siteId,
      plotId: j.plotId,
    })),
    contacts: contacts.map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      type: c.type,
    })),
    orders: orders.map((o) => ({
      id: o.id,
      description: o.itemsDescription,
      supplierName: o.supplier.name,
      jobName: o.job?.name ?? "One-off order",
    })),
    snags: snags.map((s) => ({
      id: s.id,
      description: s.description,
      plotNumber: s.plot.plotNumber,
      siteId: s.plot.siteId,
      plotId: s.plotId,
    })),
  });
}
