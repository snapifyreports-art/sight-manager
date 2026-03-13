import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";

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

  const snag = await prisma.snag.findUnique({ where: { id } });
  if (!snag) {
    return NextResponse.json({ error: "Snag not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const files = formData.getAll("photos") as File[];
  const tag = formData.get("tag") as string | null; // "before" | "after" | null

  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided" }, { status: 400 });
  }

  const createdPhotos = [];

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

    createdPhotos.push(photo);
  }

  return NextResponse.json(createdPhotos, { status: 201 });
}
