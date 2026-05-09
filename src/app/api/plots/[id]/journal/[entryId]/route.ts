import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// DELETE /api/plots/[id]/journal/[entryId] — admin removes a journal
// entry. Anyone with site-access can delete to keep this lightweight;
// audit log captures who pruned what.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id, entryId } = await params;

  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entry = await prisma.plotJournalEntry.findUnique({
    where: { id: entryId },
    select: { id: true, plotId: true, plot: { select: { siteId: true } } },
  });
  if (!entry || entry.plotId !== id) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, entry.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  try {
    await prisma.plotJournalEntry.delete({ where: { id: entryId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete journal entry");
  }
}

// PATCH /api/plots/[id]/journal/[entryId] — edit body
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; entryId: string }> }
) {
  const { id, entryId } = await params;

  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const entry = await prisma.plotJournalEntry.findUnique({
    where: { id: entryId },
    select: { id: true, plotId: true, plot: { select: { siteId: true } } },
  });
  if (!entry || entry.plotId !== id) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, entry.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Entry body is required" }, { status: 400 });
  }
  if (text.length > 4000) {
    return NextResponse.json({ error: "Entry too long (max 4000 chars)" }, { status: 400 });
  }

  try {
    const updated = await prisma.plotJournalEntry.update({
      where: { id: entryId },
      data: { body: text },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update journal entry");
  }
}
