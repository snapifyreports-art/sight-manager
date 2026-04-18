import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/plot-templates/[id]/documents
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const docs = await prisma.templateDocument.findMany({
    where: { templateId: id },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(docs);
}

// POST /api/plot-templates/[id]/documents — upload a file
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null)?.trim();
  const category = ((formData.get("category") as string | null) || "DRAWING").trim();

  if (!file || !name) {
    return NextResponse.json({ error: "file and name are required" }, { status: 400 });
  }

  const ext = file.name.split(".").pop() || "bin";
  const storagePath = `template-docs/${templateId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const arrayBuffer = await file.arrayBuffer();

  const { error: uploadError } = await getSupabase().storage.from(PHOTOS_BUCKET).upload(storagePath, arrayBuffer, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    console.error("Template doc upload error:", uploadError);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: { publicUrl } } = getSupabase().storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath);

  const doc = await prisma.templateDocument.create({
    data: {
      templateId,
      name,
      url: publicUrl,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      category,
    },
  });
  return NextResponse.json(doc, { status: 201 });
}
