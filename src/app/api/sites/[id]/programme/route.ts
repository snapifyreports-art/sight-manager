import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
            include: {
              orders: {
                include: { supplier: true },
              },
              assignedTo: { select: { id: true, name: true } },
              contractors: {
                include: {
                  contact: { select: { id: true, name: true } },
                },
              },
              _count: {
                select: { photos: true, actions: true },
              },
            },
          },
        },
      },
    },
  });

  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  return NextResponse.json(JSON.parse(JSON.stringify(site)));
}
