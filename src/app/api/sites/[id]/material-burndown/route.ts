import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #207) Material burndown per site.
 *
 * Aggregates PlotMaterial rows across every plot, grouped by name +
 * unit. Returns:
 *   - expected (sum of quantity)
 *   - delivered (sum of delivered)
 *   - consumed (sum of consumed)
 *   - state flags: SHORT (consumed > delivered), STOCKPILE (delivered
 *     significantly > consumed), ON_TRACK
 *
 * Sorted by state severity: SHORT first, then STOCKPILE warnings, then
 * ON_TRACK. Drives the burndown widget on the Quants tab.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      id,
    ))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // (May 2026 audit D-P1-198) Aggregate from TWO sources keyed by
  // (name, unit):
  //   1. PlotMaterial — the "template intent" (expected/delivered/consumed
  //      per plot, set up when applying a template)
  //   2. MaterialOrder.orderItems on non-cancelled orders — the "modern
  //      ordering flow" where orderItems carry the real expected /
  //      delivered quantities for sites that don't pre-populate
  //      PlotMaterial rows
  // Sites that use only the modern flow pre-fix got an empty burndown.
  // Sites that use both get a UNION: PlotMaterial seeds the row, orderItems
  // contribute additional expected + delivered quantity. Manager has
  // visibility into both even if they double-counted on setup.
  const [plotMaterials, orderRows] = await Promise.all([
    prisma.plotMaterial.findMany({
      where: { plot: { siteId: id } },
      select: {
        name: true,
        unit: true,
        quantity: true,
        delivered: true,
        consumed: true,
        unitCost: true,
      },
    }),
    prisma.materialOrder.findMany({
      where: {
        job: { plot: { siteId: id } },
        status: { in: ["PENDING", "ORDERED", "DELIVERED"] },
      },
      select: {
        status: true,
        orderItems: {
          select: { name: true, unit: true, quantity: true, unitCost: true },
        },
      },
    }),
  ]);

  const map = new Map<
    string,
    {
      name: string;
      unit: string;
      expected: number;
      delivered: number;
      consumed: number;
      expectedValue: number;
    }
  >();
  for (const r of plotMaterials) {
    const k = `${r.name}__${r.unit}`;
    const cur = map.get(k) ?? {
      name: r.name,
      unit: r.unit,
      expected: 0,
      delivered: 0,
      consumed: 0,
      expectedValue: 0,
    };
    cur.expected += r.quantity ?? 0;
    cur.delivered += r.delivered ?? 0;
    cur.consumed += r.consumed ?? 0;
    cur.expectedValue += (r.quantity ?? 0) * (r.unitCost ?? 0);
    map.set(k, cur);
  }
  // Fold in orderItems — ORDERED + PENDING contribute to expected,
  // DELIVERED additionally counts toward delivered.
  for (const order of orderRows) {
    for (const item of order.orderItems) {
      const k = `${item.name}__${item.unit}`;
      const cur = map.get(k) ?? {
        name: item.name,
        unit: item.unit,
        expected: 0,
        delivered: 0,
        consumed: 0,
        expectedValue: 0,
      };
      // For sites using PlotMaterial as their canonical source, the
      // PlotMaterial row already accounts for expected. For sites
      // using ONLY orderItems, this loop is what populates expected
      // in the first place. We always add (even if PlotMaterial also
      // had a row) — managers can spot double-counting visually.
      cur.expected += item.quantity ?? 0;
      cur.expectedValue += (item.quantity ?? 0) * (item.unitCost ?? 0);
      if (order.status === "DELIVERED") {
        cur.delivered += item.quantity ?? 0;
      }
      map.set(k, cur);
    }
  }

  const items = Array.from(map.values()).map((m) => {
    const onHand = m.delivered - m.consumed;
    const remainingExpected = m.expected - m.consumed;
    let state: "SHORT" | "STOCKPILE" | "ON_TRACK" = "ON_TRACK";
    if (m.consumed > m.delivered) state = "SHORT";
    else if (
      m.delivered > 0 &&
      m.consumed === 0 &&
      m.delivered >= m.expected * 0.8
    ) {
      // Got near a full delivery before anyone's started using it.
      state = "STOCKPILE";
    }
    return { ...m, onHand, remainingExpected, state };
  });

  // Sort: SHORT first, then STOCKPILE, then ON_TRACK; within state alpha.
  const order: Record<string, number> = { SHORT: 0, STOCKPILE: 1, ON_TRACK: 2 };
  items.sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));

  return NextResponse.json({
    items,
    totals: {
      materialCount: items.length,
      shortCount: items.filter((i) => i.state === "SHORT").length,
      stockpileCount: items.filter((i) => i.state === "STOCKPILE").length,
    },
  });
}
