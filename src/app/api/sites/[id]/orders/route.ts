import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/orders — all material orders for a site
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, id))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const site = await prisma.site.findUnique({
    where: { id },
    select: { name: true, address: true, postcode: true },
  });

  const orders = await prisma.materialOrder.findMany({
    where: {
      job: {
        plot: {
          siteId: id,
        },
      },
    },
    include: {
      supplier: { select: { id: true, name: true, contactEmail: true, contactName: true, accountNumber: true } },
      job: {
        select: {
          id: true,
          name: true,
          plot: {
            select: {
              id: true,
              name: true,
              plotNumber: true,
            },
          },
        },
      },
      orderItems: {
        select: {
          id: true,
          name: true,
          quantity: true,
          unit: true,
          unitCost: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ orders, site });
}
