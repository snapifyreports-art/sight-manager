import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (Jun 2026) Materials waste / burn-down aggregation.
 *
 * Aggregates PlotMaterial rows across every accessible plot. delivered /
 * consumed are maintained MANUALLY per plot (see PlotMaterial model doc) —
 * there's no auto-depletion, so this report only reflects what managers
 * have keyed in. Returns:
 *   - totals { expected, delivered, consumed }
 *   - overallConsumedPctOfDelivered (null when nothing delivered)
 *   - topOverSupplied (top 10 by surplus = delivered − consumed, grouped by name)
 *   - byCategory (per-category expected/delivered/consumed; null → "Uncategorised")
 *
 * PlotMaterial is plot-scoped (no direct siteId), so site access is
 * enforced via the plot.siteId relation path.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "VIEW_ANALYTICS",
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);

  const materials = await prisma.plotMaterial.findMany({
    // siteIds === null means admin/all sites — no filter. Otherwise scope
    // through the plot relation since PlotMaterial has no siteId column.
    where: siteIds !== null ? { plot: { siteId: { in: siteIds } } } : {},
    select: {
      name: true,
      category: true,
      unit: true,
      quantity: true,
      delivered: true,
      consumed: true,
    },
  });

  // Portfolio totals.
  let expected = 0;
  let delivered = 0;
  let consumed = 0;
  for (const m of materials) {
    expected += m.quantity;
    delivered += m.delivered;
    consumed += m.consumed;
  }
  const overallConsumedPctOfDelivered =
    delivered > 0 ? Math.round((consumed / delivered) * 100) : null;

  // Group by material name to find what's been over-supplied (delivered far
  // exceeds consumed). Unit is captured from the first row of each name —
  // mixed units under one name is a data-entry issue, not handled here.
  const byName = new Map<
    string,
    { name: string; unit: string; delivered: number; consumed: number }
  >();
  for (const m of materials) {
    const cur = byName.get(m.name) ?? {
      name: m.name,
      unit: m.unit,
      delivered: 0,
      consumed: 0,
    };
    cur.delivered += m.delivered;
    cur.consumed += m.consumed;
    byName.set(m.name, cur);
  }
  const topOverSupplied = Array.from(byName.values())
    .map((m) => ({ ...m, surplus: m.delivered - m.consumed }))
    .filter((m) => m.surplus > 0)
    .sort((a, b) => b.surplus - a.surplus)
    .slice(0, 10);

  // Per-category roll-up. Null category folds into "Uncategorised".
  const catMap = new Map<
    string,
    { category: string; expected: number; delivered: number; consumed: number }
  >();
  for (const m of materials) {
    const key = m.category ?? "Uncategorised";
    const cur = catMap.get(key) ?? {
      category: key,
      expected: 0,
      delivered: 0,
      consumed: 0,
    };
    cur.expected += m.quantity;
    cur.delivered += m.delivered;
    cur.consumed += m.consumed;
    catMap.set(key, cur);
  }
  const byCategory = Array.from(catMap.values()).sort(
    (a, b) => b.delivered - a.delivered,
  );

  return NextResponse.json({
    totals: { expected, delivered, consumed },
    overallConsumedPctOfDelivered,
    topOverSupplied,
    byCategory,
  });
}
