import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// GET /api/suppliers — list all suppliers, with linked sites derived from orders
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Scope linked sites to what the caller can actually access — a contract manager
  // shouldn't see that a supplier is connected to a site they don't have rights to.
  const { getUserSiteIds } = await import("@/lib/site-access");
  const accessibleSiteIds = await getUserSiteIds(session.user.id, session.user.role);
  const orderWhere = accessibleSiteIds === null
    ? {}
    : { job: { plot: { siteId: { in: accessibleSiteIds } } } };

  // (May 2026 audit S-P0) Active suppliers only by default;
  // `?include=archived` for the admin restore flow.
  const includeArchived = new URL(req.url).searchParams.get("include") === "archived";

  const suppliers = await prisma.supplier.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { orders: true, materials: true } },
      orders: {
        where: { ...orderWhere, status: { not: "CANCELLED" } },
        select: {
          status: true,
          job: {
            select: {
              plot: {
                select: { site: { select: { id: true, name: true, status: true } } },
              },
            },
          },
        },
      },
    },
  });

  // Derive linked sites from order chain. Count live/total orders per site.
  const result = suppliers.map((sup) => {
    const siteMap = new Map<
      string,
      { id: string; name: string; status: string; openOrders: number; totalOrders: number }
    >();
    for (const o of sup.orders) {
      if (!o.job) continue; // one-off orders
      const s = o.job.plot.site;
      const existing = siteMap.get(s.id) ?? {
        id: s.id,
        name: s.name,
        status: s.status,
        openOrders: 0,
        totalOrders: 0,
      };
      existing.totalOrders++;
      if (o.status !== "DELIVERED") existing.openOrders++;
      siteMap.set(s.id, existing);
    }
    // Don't leak order-level detail back, just the summary + site list
    const { orders: _orders, ...rest } = sup;
    return { ...rest, linkedSites: Array.from(siteMap.values()).sort((a, b) => a.name.localeCompare(b.name)) };
  });

  return NextResponse.json(result);
}

// POST /api/suppliers — create a supplier
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const supplier = await prisma.supplier.create({
      data: {
        name: body.name.trim(),
        contactName: body.contactName || null,
        contactEmail: body.contactEmail || null,
        contactNumber: body.contactNumber || null,
        type: body.type || null,
        accountNumber: body.accountNumber || null,
      },
      include: {
        _count: { select: { orders: true, materials: true } },
      },
    });

    return NextResponse.json(supplier, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create supplier");
  }
}
