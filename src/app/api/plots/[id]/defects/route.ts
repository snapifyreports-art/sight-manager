import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// (May 2026 pattern sweep) authoriseByPlot now optionally enforces a
// role permission on top of canAccessSite — every mutation in this
// route family is EDIT_PROGRAMME / DELETE_ITEMS gated.
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

  // (May 2026 Surfacing audit) Surface reporter / resolver / assigned-
  // contractor names. DefectReport has FK columns but no Prisma
  // relations in the schema, so resolve names via follow-up findMany.
  const defects = await prisma.defectReport.findMany({
    where: { plotId: id },
    orderBy: [{ reportedAt: "desc" }],
  });
  const userIds = Array.from(
    new Set(
      defects.flatMap((d) =>
        [d.reportedById, d.resolvedById].filter((x): x is string => !!x),
      ),
    ),
  );
  const contactIds = Array.from(
    new Set(defects.map((d) => d.contractorId).filter((x): x is string => !!x)),
  );
  const [users, contacts] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    contactIds.length
      ? prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, name: true, company: true },
        })
      : Promise.resolve([]),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const contactMap = new Map(
    contacts.map((c) => [c.id, c.company || c.name]),
  );
  const enriched = defects.map((d) => ({
    ...d,
    reportedByName: d.reportedById ? userMap.get(d.reportedById) ?? null : null,
    resolvedByName: d.resolvedById ? userMap.get(d.resolvedById) ?? null : null,
    contractorName: d.contractorId ? contactMap.get(d.contractorId) ?? null : null,
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
