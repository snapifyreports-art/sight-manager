import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/sites/[id]/snags — all snags across all plots for a site
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const snags = await prisma.snag.findMany({
    where: {
      plot: { siteId: id },
      ...(status && { status: status as "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED" }),
    },
    include: {
      plot: { select: { id: true, plotNumber: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, company: true } },
      raisedBy: { select: { id: true, name: true } },
      job: { select: { id: true, name: true, parentStage: true, parent: { select: { name: true } } } },
      _count: { select: { photos: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(snags);
}
