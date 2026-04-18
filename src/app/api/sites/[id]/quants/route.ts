import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/sites/[id]/quants
 *
 * Aggregate view for the Site Admin Quants tab:
 *   - Manual: site-rollup of all PlotMaterial across plots
 *   - Automated: rollup of OrderItems across all job-based MaterialOrders
 *   - OneOff: MaterialOrders where jobId is null (site- or plot-level one-offs)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const [plotMaterials, jobOrders, oneOffOrders] = await Promise.all([
    prisma.plotMaterial.findMany({
      where: { plot: { siteId: id } },
      include: { plot: { select: { id: true, plotNumber: true, name: true } } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    }),
    prisma.materialOrder.findMany({
      where: {
        jobId: { not: null },
        job: { plot: { siteId: id } },
        status: { not: "CANCELLED" },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        orderItems: true,
        job: {
          select: {
            id: true,
            name: true,
            plot: { select: { id: true, plotNumber: true, name: true } },
          },
        },
      },
      orderBy: { dateOfOrder: "asc" },
    }),
    prisma.materialOrder.findMany({
      where: {
        jobId: null,
        OR: [
          { siteId: id },
          { plot: { siteId: id } },
        ],
        status: { not: "CANCELLED" },
      },
      include: {
        supplier: { select: { id: true, name: true } },
        orderItems: true,
        plot: { select: { id: true, plotNumber: true, name: true } },
      },
      orderBy: { dateOfOrder: "asc" },
    }),
  ]);

  // Manual summary: roll up by material name
  const manualByName = new Map<
    string,
    { name: string; unit: string; category: string | null; expected: number; delivered: number; consumed: number; cost: number; plots: number }
  >();
  for (const m of plotMaterials) {
    const key = `${m.name}|${m.unit}`;
    const e = manualByName.get(key) ?? {
      name: m.name, unit: m.unit, category: m.category, expected: 0, delivered: 0, consumed: 0, cost: 0, plots: 0,
    };
    e.expected += m.quantity;
    e.delivered += m.delivered;
    e.consumed += m.consumed;
    e.cost += (m.unitCost ?? 0) * m.quantity;
    e.plots += 1;
    manualByName.set(key, e);
  }

  // Automated summary: orders grouped by supplier + item
  const automated = jobOrders.map((o) => ({
    id: o.id,
    supplier: o.supplier.name,
    status: o.status,
    itemsDescription: o.itemsDescription,
    dateOfOrder: o.dateOfOrder.toISOString(),
    expectedDeliveryDate: o.expectedDeliveryDate?.toISOString() ?? null,
    deliveredDate: o.deliveredDate?.toISOString() ?? null,
    jobName: o.job?.name ?? "",
    plot: o.job?.plot ?? null,
    items: o.orderItems.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost, totalCost: i.totalCost })),
    total: o.orderItems.reduce((s, i) => s + i.totalCost, 0),
  }));

  const oneOff = oneOffOrders.map((o) => ({
    id: o.id,
    supplier: o.supplier.name,
    status: o.status,
    itemsDescription: o.itemsDescription,
    dateOfOrder: o.dateOfOrder.toISOString(),
    expectedDeliveryDate: o.expectedDeliveryDate?.toISOString() ?? null,
    deliveredDate: o.deliveredDate?.toISOString() ?? null,
    plot: o.plot, // null if site-level
    items: o.orderItems.map((i) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitCost: i.unitCost, totalCost: i.totalCost })),
    total: o.orderItems.reduce((s, i) => s + i.totalCost, 0),
  }));

  return NextResponse.json({
    siteId: id,
    generatedAt: new Date().toISOString(),
    manual: {
      byMaterial: Array.from(manualByName.values()).sort((a, b) => a.name.localeCompare(b.name)),
      perPlot: plotMaterials.map((m) => ({
        id: m.id,
        plotId: m.plotId,
        plotNumber: m.plot.plotNumber,
        plotName: m.plot.name,
        sourceType: m.sourceType,
        name: m.name,
        quantity: m.quantity,
        unit: m.unit,
        unitCost: m.unitCost,
        category: m.category,
        notes: m.notes,
        delivered: m.delivered,
        consumed: m.consumed,
        remaining: m.delivered - m.consumed,
      })),
    },
    automated,
    oneOff,
    totals: {
      manualCostExpected: Array.from(manualByName.values()).reduce((s, e) => s + e.cost, 0),
      automatedValueAll: automated.reduce((s, o) => s + o.total, 0),
      oneOffValue: oneOff.reduce((s, o) => s + o.total, 0),
    },
  });
}
