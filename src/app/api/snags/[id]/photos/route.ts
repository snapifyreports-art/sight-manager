import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { logEvent } from "@/lib/event-log";

export const dynamic = "force-dynamic";

// GET /api/snags/[id]/photos — list all photos for a snag
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const snagForCheck = await prisma.snag.findUnique({
    where: { id },
    select: { plot: { select: { siteId: true } } },
  });
  if (!snagForCheck) return NextResponse.json({ error: "Snag not found" }, { status: 404 });
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, snagForCheck.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const photos = await prisma.snagPhoto.findMany({
    where: { snagId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(photos);
}

// POST /api/snags/[id]/photos — upload photos for a snag
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const snag = await prisma.snag.findUnique({
    where: { id },
    include: { plot: { select: { siteId: true, plotNumber: true, name: true } } },
  });
  if (!snag) {
    return NextResponse.json({ error: "Snag not found" }, { status: 404 });
  }

  // Site-access check
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, snag.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") || "";

  // JSON body: copy an existing photo by URL (e.g. from a job photo)
  if (contentType.includes("application/json")) {
    const body = await req.json();
    const { copyFromUrl, fileName: srcName, tag } = body;

    if (!copyFromUrl) {
      return NextResponse.json({ error: "copyFromUrl is required" }, { status: 400 });
    }

    // (May 2026 audit #6) Restrict copyFromUrl to our own Supabase
    // storage. Pre-fix this accepted any URL — a malicious caller could
    // make the server fetch internal-only addresses (cloud metadata,
    // localhost services) and re-host the response as a "snag photo"
    // they could read. Classic SSRF. Lock to the project's Supabase
    // public-bucket origin only.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      return NextResponse.json(
        { error: "Server misconfigured: NEXT_PUBLIC_SUPABASE_URL unset" },
        { status: 500 },
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(copyFromUrl);
    } catch {
      return NextResponse.json({ error: "Invalid copyFromUrl" }, { status: 400 });
    }
    const supabaseOrigin = new URL(supabaseUrl).origin;
    if (parsed.origin !== supabaseOrigin) {
      return NextResponse.json(
        { error: "copyFromUrl must point to the project's storage" },
        { status: 400 },
      );
    }

    // Fetch the image from the public URL
    const imgRes = await fetch(copyFromUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: "Failed to fetch source image" }, { status: 400 });
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    const ext = (srcName || "photo.jpg").split(".").pop() || "jpg";
    const storagePath = `snags/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error: uploadError } = await getSupabase()
      .storage.from(PHOTOS_BUCKET)
      .upload(storagePath, arrayBuffer, {
        contentType: imgRes.headers.get("content-type") || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("Copy upload error:", uploadError);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = getSupabase().storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath);

    try {
      const photo = await prisma.snagPhoto.create({
        data: {
          snagId: id,
          url: publicUrl,
          fileName: srcName || "photo.jpg",
          tag: tag || null,
        },
      });

      // Also add photo to the linked job
      if (snag.jobId) {
        await prisma.jobPhoto.create({
          data: {
            jobId: snag.jobId,
            url: publicUrl,
            fileName: srcName || "photo.jpg",
            caption: `Snag photo (${tag || "untagged"})`,
            tag: tag || null,
            uploadedById: session.user.id,
          },
        });
      }

      return NextResponse.json([photo], { status: 201 });
    } catch (err) {
      return apiError(err, "Failed to upload photo");
    }
  }

  // FormData body: direct file upload
  const formData = await req.formData();
  const files = formData.getAll("photos") as File[];
  const tag = formData.get("tag") as string | null; // "before" | "after" | null

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const createdPhotos = [];

  try {
    for (const file of files) {
      const ext = file.name.split(".").pop() || "jpg";
      const fileName = `snags/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      const { error: uploadError } = await getSupabase()
        .storage.from(PHOTOS_BUCKET)
        .upload(fileName, arrayBuffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }

      const {
        data: { publicUrl },
      } = getSupabase().storage.from(PHOTOS_BUCKET).getPublicUrl(fileName);

      const photo = await prisma.snagPhoto.create({
        data: {
          snagId: id,
          url: publicUrl,
          fileName: file.name,
          tag: tag || null,
        },
      });

      // Also add photo to the linked job so it shows in the job panel
      if (snag.jobId) {
        await prisma.jobPhoto.create({
          data: {
            jobId: snag.jobId,
            url: publicUrl,
            fileName: file.name,
            caption: `Snag photo (${tag || "untagged"})`,
            tag: tag || null,
            uploadedById: session.user.id,
          },
        });
      }

      createdPhotos.push(photo);
    }

    // Log event for snag photo uploads
    if (createdPhotos.length > 0 && snag.plot) {
      const plotLabel = snag.plot.plotNumber ? `Plot ${snag.plot.plotNumber}` : snag.plot.name;
      await logEvent(prisma, {
        type: "PHOTO_UPLOADED",
        description: `${createdPhotos.length} snag photo${createdPhotos.length !== 1 ? "s" : ""} uploaded — ${plotLabel}: "${snag.description?.substring(0, 60) || "Snag"}"`,
        siteId: snag.plot.siteId,
        plotId: snag.plotId,
        jobId: snag.jobId,
        userId: session.user.id,
        detail: {
          snagId: snag.id,
          count: createdPhotos.length,
          tag: tag || null,
        },
      });
    }

    return NextResponse.json(createdPhotos, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to upload photo");
  }
}
