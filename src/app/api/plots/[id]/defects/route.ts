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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authoriseByPlot(id);
  if ("error" in a) return a.error;

  const defects = await prisma.defectReport.findMany({
    where: { plotId: id },
    orderBy: [{ reportedAt: "desc" }],
  });
  return NextResponse.json(defects);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authoriseByPlot(id);
  if ("error" in a) return a.error;

  const body = await req.json();
  if (!body?.title?.trim() || !body?.description?.trim()) {
    return NextResponse.json(
      { error: "title and description are required" },
      { status: 400 },
    );
  }
  const count = await prisma.defectReport.count({ where: { plotId: id } });
  const ref = `DEF-${String(count + 1).padStart(3, "0")}`;

  try {
    const d = await prisma.defectReport.create({
      data: {
        plotId: id,
        ref,
        title: body.title.trim(),
        description: body.description.trim(),
        reportedById: a.session.user.id,
        contractorId: body.contractorId || null,
      },
    });
    return NextResponse.json(d, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create defect");
  }
}
