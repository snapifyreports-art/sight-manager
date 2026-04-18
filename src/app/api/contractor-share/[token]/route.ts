import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyContractorToken } from "@/lib/share-token";

export const dynamic = "force-dynamic";

// GET /api/contractor-share/[token] — public, no auth required
// Returns a contractor's jobs and snags for the shared site
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const payload = verifyContractorToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
  }

  const { contactId, siteId } = payload;

  const [contact, site] = await Promise.all([
    prisma.contact.findUnique({
      where: { id: contactId },
      select: { id: true, name: true, company: true, email: true, phone: true },
    }),
    prisma.site.findUnique({
      where: { id: siteId },
      select: { id: true, name: true, location: true },
    }),
  ]);

  if (!contact || !site) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Jobs this contractor is assigned to on this site — LEAF jobs only
  // (parents are derived rollups; contractor does the actual sub-tasks)
  const jobContractors = await prisma.jobContractor.findMany({
    where: { contactId, job: { plot: { siteId }, children: { none: {} } } },
    select: {
      job: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          stageCode: true,
          signOffNotes: true,
          plot: { select: { id: true, plotNumber: true, name: true } },
          assignedTo: { select: { name: true } },
        },
      },
    },
  });

  const jobs = jobContractors.map((jc) => ({
    ...jc.job,
    startDate: jc.job.startDate?.toISOString() ?? null,
    endDate: jc.job.endDate?.toISOString() ?? null,
  }));

  // Open snags assigned to this contractor on this site
  const snags = await prisma.snag.findMany({
    where: {
      contactId,
      plot: { siteId },
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
    select: {
      id: true,
      description: true,
      status: true,
      priority: true,
      location: true,
      plot: { select: { id: true, plotNumber: true, name: true } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  const liveJobs = jobs.filter((j) => j.status === "IN_PROGRESS");
  const nextJobs = jobs
    .filter((j) => j.status === "NOT_STARTED")
    .sort((a, b) => {
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    });
  const completedJobs = jobs.filter((j) => j.status === "COMPLETED");

  // Material orders for this contractor's jobs
  const jobIds = jobs.map((j) => j.id);
  const materialOrders = jobIds.length > 0
    ? await prisma.materialOrder.findMany({
        where: { jobId: { in: jobIds } },
        select: {
          id: true,
          status: true,
          itemsDescription: true,
          dateOfOrder: true,
          expectedDeliveryDate: true,
          deliveredDate: true,
          supplier: { select: { name: true } },
          job: { select: { name: true, plot: { select: { plotNumber: true, name: true } } } },
          orderItems: { select: { name: true, quantity: true, unit: true } },
        },
        orderBy: { dateOfOrder: "asc" },
      })
    : [];

  return NextResponse.json({
    contractor: contact,
    site,
    expiresAt: new Date(payload.exp).toISOString(),
    liveJobs,
    nextJobs,
    completedJobs,
    openSnags: snags,
    orders: materialOrders.map((o) => ({
      id: o.id,
      status: o.status,
      itemsDescription: o.itemsDescription,
      dateOfOrder: o.dateOfOrder.toISOString(),
      expectedDeliveryDate: o.expectedDeliveryDate?.toISOString() ?? null,
      deliveredDate: o.deliveredDate?.toISOString() ?? null,
      supplier: o.supplier,
      job: o.job,
      items: o.orderItems,
    })),
  });
}
