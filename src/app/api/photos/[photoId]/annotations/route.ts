import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #50) Photo annotation CRUD.
 *
 * GET   /api/photos/[photoId]/annotations  → list
 * POST  /api/photos/[photoId]/annotations  → create
 *   body: { strokes (JSON string), caption? }
 *
 * Strokes are stored as opaque JSON — the canvas component
 * serialises whatever shape it wants. Backend just persists.
 */

async function authoriseByPhoto(photoId: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const photo = await prisma.jobPhoto.findUnique({
    where: { id: photoId },
    select: { job: { select: { plot: { select: { id: true, siteId: true } } } } },
  });
  if (!photo) return { error: NextResponse.json({ error: "Photo not found" }, { status: 404 }) };
  const { id: plotId, siteId } = photo.job.plot;
  if (
    !(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, plotId };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;
  const a = await authoriseByPhoto(photoId);
  if ("error" in a) return a.error;
  const items = await prisma.photoAnnotation.findMany({
    where: { jobPhotoId: photoId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(items);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;
  const a = await authoriseByPhoto(photoId);
  if ("error" in a) return a.error;
  const body = await req.json();
  if (typeof body?.strokes !== "string" || body.strokes.length === 0) {
    return NextResponse.json({ error: "strokes required" }, { status: 400 });
  }
  // 200KB ceiling — annotations should be tens of KB max. Anything
  // bigger is either pathological or someone uploading raw image data.
  if (body.strokes.length > 200_000) {
    return NextResponse.json({ error: "annotations too large" }, { status: 413 });
  }
  try {
    const row = await prisma.photoAnnotation.create({
      data: {
        jobPhotoId: photoId,
        plotId: a.plotId,
        strokes: body.strokes,
        caption: body.caption || null,
        createdById: a.session.user.id,
      },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to save annotation");
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ photoId: string }> },
) {
  const { photoId } = await params;
  const a = await authoriseByPhoto(photoId);
  if ("error" in a) return a.error;
  const url = new URL(req.url);
  const annotationId = url.searchParams.get("annotationId");
  if (!annotationId) {
    return NextResponse.json({ error: "annotationId required" }, { status: 400 });
  }
  try {
    await prisma.photoAnnotation.deleteMany({
      where: { id: annotationId, jobPhotoId: photoId },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete annotation");
  }
}
