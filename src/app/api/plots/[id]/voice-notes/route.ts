import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";

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
  // POST stays site-access-only (recording a voice note is day-to-day
  // site work) — but DELETE passes "DELETE_ITEMS" so a destructive
  // verb matches the rest of the codebase's delete gating.
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
  const rows = await prisma.voiceNote.findMany({
    where: { plotId: id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(rows);
}

/**
 * POST — register a voice note. The audio file should have already
 * been uploaded to Supabase via the existing upload flow; this just
 * records the metadata row. Body: { url, durationSec?, caption?,
 * jobId?, snagId? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authoriseByPlot(id);
  if ("error" in a) return a.error;
  const body = await req.json();
  if (!body?.url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  try {
    const row = await prisma.voiceNote.create({
      data: {
        plotId: id,
        jobId: body.jobId || null,
        snagId: body.snagId || null,
        url: body.url,
        durationSec: typeof body.durationSec === "number" ? body.durationSec : null,
        caption: body.caption || null,
        createdById: a.session.user.id,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to save voice note");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authoriseByPlot(id, "DELETE_ITEMS");
  if ("error" in a) return a.error;
  const url = new URL(req.url);
  const noteId = url.searchParams.get("noteId");
  if (!noteId) {
    return NextResponse.json({ error: "noteId required" }, { status: 400 });
  }
  try {
    // (Jun 2026 Wave-4 B15) Fetch first so we can (a) 404 on a bad noteId and
    // (b) remove the underlying audio object from storage — pre-fix the row
    // was deleted but the audio file (and its live public URL) was orphaned
    // in the bucket forever. Mirrors the document DELETE storage cleanup.
    const note = await prisma.voiceNote.findFirst({
      where: { id: noteId, plotId: id },
      select: { id: true, url: true },
    });
    if (!note) {
      return NextResponse.json({ error: "Voice note not found" }, { status: 404 });
    }
    const urlParts = note.url.split(`${PHOTOS_BUCKET}/`);
    if (urlParts.length > 1) {
      await getSupabase()
        .storage.from(PHOTOS_BUCKET)
        .remove([urlParts[1]])
        .catch((err) =>
          console.warn("[voice-note delete] storage cleanup failed:", err),
        );
    }
    await prisma.voiceNote.delete({ where: { id: note.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete voice note");
  }
}
