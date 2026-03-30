import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyShareToken } from "@/lib/share-token";

export const dynamic = "force-dynamic";

// GET /api/share/[token] — public endpoint, no auth required
// Returns read-only plot data for the given share token
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const payload = verifyShareToken(token);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
  }

  const plot = await prisma.plot.findUnique({
    where: { id: payload.plotId },
    select: {
      id: true,
      name: true,
      plotNumber: true,
      houseType: true,
      description: true,
      site: { select: { id: true, name: true, location: true } },
      jobs: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          actualStartDate: true,
          actualEndDate: true,
          stageCode: true,
          location: true,
          assignedTo: { select: { name: true } },
        },
      },
    },
  });

  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  return NextResponse.json({
    plot,
    expiresAt: new Date(payload.exp).toISOString(),
  });
}
