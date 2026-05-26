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

  // (May 2026 Surfacing audit) Surface "Approved by [Name] on [Date]"
  // next to the status badge. Variation has approvedById as an FK
  // but no Prisma relation defined in the schema, so resolve names
  // via a follow-up findMany rather than an include.
  const vars_ = await prisma.variation.findMany({
    where: { plotId: id },
    orderBy: [{ createdAt: "desc" }],
  });
  const approverIds = Array.from(
    new Set(vars_.map((v) => v.approvedById).filter((x): x is string => !!x)),
  );
  const approvers =
    approverIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: approverIds } },
          select: { id: true, name: true },
        })
      : [];
  const approverMap = new Map(approvers.map((u) => [u.id, u.name]));
  const enriched = vars_.map((v) => ({
    ...v,
    approvedByName: v.approvedById ? approverMap.get(v.approvedById) ?? null : null,
  }));
  return NextResponse.json(enriched);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authoriseByPlot(id, "EDIT_PROGRAMME");
  if ("error" in a) return a.error;

  const body = await req.json();
  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const count = await prisma.variation.count({ where: { plotId: id } });
  const ref = `VAR-${String(count + 1).padStart(3, "0")}`;

  try {
    const v = await prisma.variation.create({
      data: {
        plotId: id,
        ref,
        title: body.title.trim(),
        description: body.description || null,
        requestedBy: body.requestedBy || null,
        costDelta: typeof body.costDelta === "number" ? body.costDelta : null,
        daysDelta: typeof body.daysDelta === "number" ? body.daysDelta : null,
      },
    });
    return NextResponse.json(v, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create variation");
  }
}
