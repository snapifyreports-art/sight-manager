import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

async function authoriseByPlot(plotId: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { siteId: true },
  });
  if (!plot) return { error: NextResponse.json({ error: "Plot not found" }, { status: 404 }) };
  if (
    !(await canAccessSite(session.user.id, (session.user as { role: string }).role, plot.siteId))
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, siteId: plot.siteId };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authoriseByPlot(id);
  if ("error" in a) return a.error;

  const checks = await prisma.preStartCheck.findMany({
    where: { plotId: id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(checks);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authoriseByPlot(id);
  if ("error" in a) return a.error;

  const body = await req.json();
  if (!body?.label?.trim()) {
    return NextResponse.json({ error: "label is required" }, { status: 400 });
  }
  const maxSort = await prisma.preStartCheck.aggregate({
    where: { plotId: id },
    _max: { sortOrder: true },
  });

  try {
    const check = await prisma.preStartCheck.create({
      data: {
        plotId: id,
        label: body.label.trim(),
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        notes: body.notes || null,
      },
    });
    return NextResponse.json(check, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create pre-start check");
  }
}
