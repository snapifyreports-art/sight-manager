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
  return { session };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; checkId: string }> },
) {
  const { id, checkId } = await params;
  const a = await authoriseByPlot(id);
  if ("error" in a) return a.error;

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("label" in body) data.label = body.label;
  if ("notes" in body) data.notes = body.notes || null;
  if ("checked" in body) {
    data.checked = body.checked;
    data.checkedAt = body.checked ? new Date() : null;
    data.checkedById = body.checked ? a.session.user.id : null;
  }

  try {
    const check = await prisma.preStartCheck.update({
      where: { id: checkId },
      data,
    });
    return NextResponse.json(check);
  } catch (err) {
    return apiError(err, "Failed to update check");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; checkId: string }> },
) {
  const { id, checkId } = await params;
  const a = await authoriseByPlot(id);
  if ("error" in a) return a.error;
  try {
    await prisma.preStartCheck.delete({ where: { id: checkId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete check");
  }
}
