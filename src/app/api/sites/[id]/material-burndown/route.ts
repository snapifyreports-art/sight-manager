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

  const rows = await prisma.plotMaterial.findMany({
    where: { plot: { siteId: id } },
    select: {
      name: true,
      unit: true,
      quantity: true,
      delivered: true,
      consumed: true,
      unitCost: true,
    },
  });

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
  for (const r of rows) {
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
