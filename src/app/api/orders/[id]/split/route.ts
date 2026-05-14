import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * POST /api/orders/[id]/split
 *
 * (#169) Split this order out of its visual group so it can be re-dated
 * independently of its siblings. Sets `isSplit = true`; the UI grouping
 * logic then uses the order's id as the group key instead of bundling
 * with same-supplier-same-job orders. Idempotent — calling on an
 * already-split order is a no-op.
 *
 * Use case: the manager has 10 plots' worth of boundary-fence orders
 * bundled together. They pull P10 forward two weeks; P10's order date
 * should move with it. They click "Split out P10" and the order pops
 * onto its own row where they can re-date.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      !sessionHasPermission(
        session.user as { role?: string; permissions?: string[] },
        "MANAGE_ORDERS",
      )
    ) {
      return NextResponse.json(
        { error: "You do not have permission to manage orders" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const order = await prisma.materialOrder.findUnique({
      where: { id },
      select: {
        id: true,
        isSplit: true,
        plot: { select: { siteId: true } },
        site: { select: { id: true } },
        job: { select: { plot: { select: { siteId: true } } } },
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const siteId =
      order.plot?.siteId ?? order.site?.id ?? order.job?.plot?.siteId ?? null;
    if (!siteId) {
      return NextResponse.json(
        { error: "Order is not associated with a site" },
        { status: 400 },
      );
    }
    if (
      !(await canAccessSite(
        session.user.id,
        (session.user as { role: string }).role,
        siteId,
      ))
    ) {
      return NextResponse.json(
        { error: "You do not have access to this site" },
        { status: 403 },
      );
    }

    if (order.isSplit) {
      return NextResponse.json({ ok: true, idempotent: true });
    }

    await prisma.materialOrder.update({
      where: { id },
      data: { isSplit: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to split order");
  }
}
