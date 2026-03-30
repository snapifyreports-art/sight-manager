import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/programme — full programme data for a site
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findUnique({
    where: { id },
    include: {
      plots: {
        orderBy: [{ plotNumber: "asc" }, { createdAt: "asc" }],
        include: {
          jobs: {
            orderBy: { sortOrder: "asc" },
            // Only fetch what the grid needs — panel fetches full data on demand
            include: {
              orders: {
                select: {
                  id: true,
                  dateOfOrder: true,
                  expectedDeliveryDate: true,
                  leadTimeDays: true,
                  status: true,
                  itemsDescription: true,
                  supplier: { select: { name: true } },
                },
              },
              _count: {
                select: {
                  photos: true,
                  actions: { where: { action: "note" } },
                },
              },
            },
          },
        },
      },
      rainedOffDays: {
        select: { date: true, type: true, note: true },
        orderBy: { date: "asc" },
      },
    },
  });

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Sort plots numerically by plotNumber (Prisma sorts strings alphabetically)
  site.plots.sort((a, b) => {
    const numA = parseInt(a.plotNumber ?? "", 10);
    const numB = parseInt(b.plotNumber ?? "", 10);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return (a.plotNumber ?? "").localeCompare(b.plotNumber ?? "");
  });

  const response = NextResponse.json(JSON.parse(JSON.stringify(site)));
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}
