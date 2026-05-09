import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * Admin-only journal CRUD for a plot. Journal entries are short
 * customer-facing story updates surfaced on /progress/[token]. Plain
 * text only. The customer never sees a date — entries surface as a
 * sequence ordered by createdAt, but we display "1 week ago" / similar
 * relative descriptors only.
 */

async function authoriseAdmin(plotId: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { id: true, siteId: true },
  });
  if (!plot) return { error: NextResponse.json({ error: "Plot not found" }, { status: 404 }) };

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, plot.siteId))) {
    return { error: NextResponse.json({ error: "You do not have access to this site" }, { status: 403 }) };
  }
  return { plot, userId: session.user.id };
}

// GET — list entries (newest first)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await authoriseAdmin(id);
  if ("error" in result) return result.error;

  const entries = await prisma.plotJournalEntry.findMany({
    where: { plotId: id },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  return NextResponse.json(entries);
}

// POST — create entry. body: { body: string }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await authoriseAdmin(id);
  if ("error" in result) return result.error;

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Entry body is required" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "Entry too long (max 4000 chars)" }, { status: 400 });
  }

  try {
    const entry = await prisma.plotJournalEntry.create({
      data: {
        plotId: id,
        body: text,
        createdById: result.userId,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create journal entry");
  }
}
