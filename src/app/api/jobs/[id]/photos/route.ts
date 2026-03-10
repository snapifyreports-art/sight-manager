import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";

// GET /api/jobs/[id]/photos — list photos for a job
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const photos = await prisma.jobPhoto.findMany({
    where: { jobId: id },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(photos);
}

// POST /api/jobs/[id]/photos — upload photos
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Verify job exists
  const job = await prisma.job.findUnique({
    where: { id },
    include: { plot: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const files = formData.getAll("photos") as File[];
  const caption = formData.get("caption") as string | null;

  if (files.length === 0) {
    return NextResponse.json(
      { error: "No files provided" },
      { status: 400 }
    );
  }

  const createdPhotos = [];

  for (const file of files) {
    const ext = file.name.split(".").pop() || "jpg";
    const fileName = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // Upload to Supabase Storage
    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await getSupabase().storage
      .from(PHOTOS_BUCKET)
      .upload(fileName, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      continue; // Skip failed uploads
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = getSupabase().storage.from(PHOTOS_BUCKET).getPublicUrl(fileName);

    // Create DB record
    const photo = await prisma.jobPhoto.create({
      data: {
        jobId: id,
        url: publicUrl,
        fileName: file.name,
        caption: caption || null,
        uploadedById: session.user.id,
      },
    });

    createdPhotos.push(photo);
  }

  // Log event
  if (createdPhotos.length > 0) {
    await prisma.eventLog.create({
      data: {
        type: "PHOTO_UPLOADED",
        description: `${createdPhotos.length} photo(s) uploaded for "${job.name}"`,
        siteId: job.plot.siteId,
        plotId: job.plotId,
        jobId: id,
        userId: session.user.id,
      },
    });
  }

  return NextResponse.json(createdPhotos, { status: 201 });
}

// DELETE /api/jobs/[id]/photos?photoId=xxx — delete a photo
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const photoId = searchParams.get("photoId");

  if (!photoId) {
    return NextResponse.json(
      { error: "photoId is required" },
      { status: 400 }
    );
  }

  const photo = await prisma.jobPhoto.findUnique({
    where: { id: photoId },
  });

  if (!photo || photo.jobId !== id) {
    return NextResponse.json(
      { error: "Photo not found" },
      { status: 404 }
    );
  }

  // Extract storage path from URL
  const urlParts = photo.url.split(`${PHOTOS_BUCKET}/`);
  if (urlParts.length > 1) {
    await getSupabase().storage.from(PHOTOS_BUCKET).remove([urlParts[1]]);
  }

  await prisma.jobPhoto.delete({ where: { id: photoId } });

  return NextResponse.json({ success: true });
}
