import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/contractor-comms
// Returns per-contractor summary: live jobs, next jobs, active plots, open snags
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: siteId } = await params;

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { id: true, name: true },
  });
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Get all job-contractor links for LEAF jobs on this site (parents are rollups).
  // A contractor attached to a parent stage should be re-attached at the child level.
  const jobContractors = await prisma.jobContractor.findMany({
    where: { job: { plot: { siteId }, children: { none: {} } } },
    select: {
      contactId: true,
      contact: {
        select: { id: true, name: true, company: true, email: true, phone: true },
      },
      job: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          sortOrder: true,
          plot: { select: { id: true, plotNumber: true, name: true } },
        },
      },
    },
  });

  // Get open snags for this site that have a contact assigned
  const snags = await prisma.snag.findMany({
    where: {
      plot: { siteId },
      status: { in: ["OPEN", "IN_PROGRESS"] },
      contactId: { not: null },
    },
    select: {
      id: true,
      description: true,
      status: true,
      priority: true,
      location: true,
      contactId: true,
      plot: { select: { id: true, plotNumber: true, name: true } },
    },
  });

  // Group everything by contactId
  const contactMap = new Map<string, {
    id: string;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    liveJobs: typeof jobContractors[number]["job"][];
    nextJobs: typeof jobContractors[number]["job"][];
    allJobs: typeof jobContractors[number]["job"][];
    openSnags: typeof snags;
    plotIds: Set<string>;
  }>();

  for (const jc of jobContractors) {
    const c = jc.contact;
    if (!contactMap.has(c.id)) {
      contactMap.set(c.id, {
        id: c.id,
        name: c.name,
        company: c.company,
        email: c.email,
        phone: c.phone,
        liveJobs: [],
        nextJobs: [],
        allJobs: [],
        openSnags: [],
        plotIds: new Set(),
      });
    }
    const entry = contactMap.get(c.id)!;
    entry.allJobs.push(jc.job);
    entry.plotIds.add(jc.job.plot.id);
  }

  // Assign snags to contacts
  for (const snag of snags) {
    if (snag.contactId && contactMap.has(snag.contactId)) {
      contactMap.get(snag.contactId)!.openSnags.push(snag);
    }
  }

  // Split jobs into live vs next
  for (const entry of contactMap.values()) {
    entry.liveJobs = entry.allJobs.filter((j) => j.status === "IN_PROGRESS");
    // Next: NOT_STARTED, ordered by startDate, take first 3
    entry.nextJobs = entry.allJobs
      .filter((j) => j.status === "NOT_STARTED")
      .sort((a, b) => {
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      })
      .slice(0, 3);
  }

  // Fetch material orders for all jobs linked to contractors on this site
  const allJobIds = Array.from(contactMap.values()).flatMap((c) => c.allJobs.map((j) => j.id));
  const materialOrders = allJobIds.length > 0
    ? await prisma.materialOrder.findMany({
        where: { jobId: { in: allJobIds } },
        select: {
          id: true,
          status: true,
          itemsDescription: true,
          dateOfOrder: true,
          expectedDeliveryDate: true,
          deliveredDate: true,
          jobId: true,
          supplier: { select: { id: true, name: true } },
          orderItems: { select: { name: true, quantity: true, unit: true } },
        },
        orderBy: { dateOfOrder: "asc" },
      })
    : [];

  // Group orders by jobId for quick lookup. Contractor comms only shows job-based
  // orders (one-off orders aren't tied to a contractor's work).
  const ordersByJob = new Map<string, typeof materialOrders>();
  for (const o of materialOrders) {
    if (!o.jobId) continue;
    const existing = ordersByJob.get(o.jobId) ?? [];
    existing.push(o);
    ordersByJob.set(o.jobId, existing);
  }

  // Check sign-off requests for live jobs
  const signOffRequests = allJobIds.length > 0
    ? await prisma.jobAction.findMany({
        where: { jobId: { in: allJobIds }, action: "request_signoff" },
        select: { jobId: true },
        distinct: ["jobId"],
      })
    : [];
  const requestedJobIds = new Set(signOffRequests.map((r) => r.jobId));

  // Drawings visible to each contractor: site-wide documents + drawings on plots they work on
  const allPlotIds = Array.from(new Set(
    Array.from(contactMap.values()).flatMap((c) => c.allJobs.map((j) => j.plot.id))
  ));
  const siteWideDrawings = await prisma.siteDocument.findMany({
    where: { siteId, plotId: null, category: "DRAWING" },
    select: { id: true, name: true, url: true, fileName: true, mimeType: true, fileSize: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const plotDrawings = allPlotIds.length > 0
    ? await prisma.siteDocument.findMany({
        where: { siteId, plotId: { in: allPlotIds }, category: "DRAWING" },
        select: { id: true, name: true, url: true, fileName: true, mimeType: true, fileSize: true, createdAt: true, plotId: true },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const drawingsByPlot = new Map<string, typeof plotDrawings>();
  for (const d of plotDrawings) {
    const existing = drawingsByPlot.get(d.plotId!) ?? [];
    existing.push(d);
    drawingsByPlot.set(d.plotId!, existing);
  }

  // Attach orders to each contractor entry
  for (const entry of contactMap.values()) {
    (entry as Record<string, unknown>).orders = entry.allJobs.flatMap((j) => ordersByJob.get(j.id) ?? []);
  }

  // Sort contractors: those with live jobs first, then by name
  const contractors = Array.from(contactMap.values())
    .sort((a, b) => {
      if (a.liveJobs.length > 0 && b.liveJobs.length === 0) return -1;
      if (a.liveJobs.length === 0 && b.liveJobs.length > 0) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((c) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      email: c.email,
      phone: c.phone,
      activePlotCount: c.plotIds.size,
      liveJobs: c.liveJobs.map((j) => ({
        id: j.id,
        name: j.name,
        status: j.status,
        startDate: j.startDate?.toISOString() ?? null,
        endDate: j.endDate?.toISOString() ?? null,
        plot: j.plot,
        signOffRequested: requestedJobIds.has(j.id),
      })),
      nextJobs: c.nextJobs.map((j) => ({
        id: j.id,
        name: j.name,
        status: j.status,
        startDate: j.startDate?.toISOString() ?? null,
        endDate: j.endDate?.toISOString() ?? null,
        plot: j.plot,
      })),
      // (May 2026 Keith bug report) Full job list — the Mini Programme
      // shows EVERY plot the contractor is on, not just live + next-3.
      // `nextJobs` stays capped at 3 for the "Coming up" list; the Mini
      // Programme reads `allJobs` instead.
      allJobs: c.allJobs.map((j) => ({
        id: j.id,
        name: j.name,
        status: j.status,
        startDate: j.startDate?.toISOString() ?? null,
        endDate: j.endDate?.toISOString() ?? null,
        plot: j.plot,
      })),
      openSnags: c.openSnags.map((s) => ({
        id: s.id,
        description: s.description,
        status: s.status,
        priority: s.priority,
        location: s.location,
        plot: s.plot,
      })),
      orders: ((c as Record<string, unknown>).orders as typeof materialOrders || []).map((o) => ({
        id: o.id,
        status: o.status,
        itemsDescription: o.itemsDescription,
        dateOfOrder: o.dateOfOrder.toISOString(),
        expectedDeliveryDate: o.expectedDeliveryDate?.toISOString() ?? null,
        deliveredDate: o.deliveredDate?.toISOString() ?? null,
        supplier: o.supplier,
        items: o.orderItems,
      })),
      // Drawings this contractor can see: site-wide + drawings on plots they have jobs on
      drawings: [
        ...siteWideDrawings.map((d) => ({
          id: d.id, name: d.name, url: d.url, fileName: d.fileName, mimeType: d.mimeType,
          fileSize: d.fileSize, createdAt: d.createdAt.toISOString(), plot: null,
        })),
        ...Array.from(c.plotIds).flatMap((pid) =>
          (drawingsByPlot.get(pid) ?? []).map((d) => ({
            id: d.id, name: d.name, url: d.url, fileName: d.fileName, mimeType: d.mimeType,
            fileSize: d.fileSize, createdAt: d.createdAt.toISOString(),
            plot: c.allJobs.find((j) => j.plot.id === pid)?.plot ?? null,
          }))
        ),
      ],
    }));

  return NextResponse.json({ site, contractors });
}
