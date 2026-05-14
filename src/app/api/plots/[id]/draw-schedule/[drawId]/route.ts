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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; drawId: string }> },
) {
  const { id, drawId } = await params;
  const a = await authoriseByPlot(id, "MANAGE_ORDERS");
  if ("error" in a) return a.error;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = body.name;
  if ("amount" in body) data.amount = body.amount;
  if ("notes" in body) data.notes = body.notes || null;
  if ("triggerJobId" in body) data.triggerJobId = body.triggerJobId || null;
  if ("dueAt" in body) data.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  if ("status" in body) {
    data.status = body.status;
    if (body.status === "PAID") {
      data.paidAt = new Date();
      data.paidById = a.session.user.id;
    }
  }
  try {
    const row = await prisma.plotDrawSchedule.update({
      where: { id: drawId },
      data,
    });
    return NextResponse.json(row);
  } catch (err) {
    return apiError(err, "Failed to update milestone");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; drawId: string }> },
) {
  const { id, drawId } = await params;
  const a = await authoriseByPlot(id, "MANAGE_ORDERS");
  if ("error" in a) return a.error;
  try {
    await prisma.plotDrawSchedule.delete({ where: { id: drawId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete milestone");
  }
}
