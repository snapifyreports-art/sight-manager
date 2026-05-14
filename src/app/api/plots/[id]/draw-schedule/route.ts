import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

async function authoriseByPlot(plotId: string, requiredPermission?: string) {
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
  if (
    requiredPermission &&
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      requiredPermission,
    )
  ) {
    return {
      error: NextResponse.json(
        { error: `You do not have permission (${requiredPermission})` },
        { status: 403 },
      ),
    };
  }
  return { session };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authoriseByPlot(id);
  if ("error" in a) return a.error;
  const rows = await prisma.plotDrawSchedule.findMany({
    where: { plotId: id },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json(rows);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authoriseByPlot(id, "MANAGE_ORDERS");
  if ("error" in a) return a.error;
  const body = await req.json();
  if (!body?.name?.trim() || typeof body?.amount !== "number") {
    return NextResponse.json({ error: "name and amount required" }, { status: 400 });
  }
  const maxSort = await prisma.plotDrawSchedule.aggregate({
    where: { plotId: id },
    _max: { sortOrder: true },
  });
  try {
    const row = await prisma.plotDrawSchedule.create({
      data: {
        plotId: id,
        name: body.name.trim(),
        amount: body.amount,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
        triggerJobId: body.triggerJobId || null,
        dueAt: body.dueAt ? new Date(body.dueAt) : null,
        notes: body.notes || null,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to add milestone");
  }
}
