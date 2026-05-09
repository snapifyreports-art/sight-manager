import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * Register a template document AFTER the client has uploaded the bytes
 * directly to Supabase via a signed URL (see ../sign/route.ts).
 *
 * Creates the DB record so the doc shows up in the template drawings list.
 * Verifies the file actually landed in storage before writing the row —
 * prevents orphan DB entries if the client aborted mid-upload.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const { searchParams } = new URL(req.url);
  const variantId = searchParams.get("variantId");
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { storagePath, name, fileName, fileSize, mimeType, category } = body as {
    storagePath?: string;
    name?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    category?: string;
  };

  if (!storagePath || !name || !fileName) {
    return NextResponse.json(
      { error: "storagePath, name, and fileName are required" },
      { status: 400 }
    );
  }

  // Guard against path spoofing — only accept paths in the template's scope.
  const expectedPrefix = `template-docs/${templateId}/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: "storagePath outside this template's scope" },
      { status: 400 }
    );
  }

  // Verify the file actually landed in storage. Supabase returns a 200 +
  // matching metadata for existing files.
  const supabase = getSupabase();
  // Prefer `list()` with an exact path match — `info()` isn't on all SDK
  // versions, and `download()` pulls bytes we don't need.
  const { data: listing, error: listErr } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .list(expectedPrefix, { search: storagePath.split("/").pop() });
  if (listErr) {
    console.error("Storage verify failed:", listErr);
    return NextResponse.json({ error: "Could not verify upload" }, { status: 500 });
  }
  const uploaded = listing?.find((f) => expectedPrefix + f.name === storagePath);
  if (!uploaded) {
    return NextResponse.json(
      { error: "Upload not found at storage path — retry the upload." },
      { status: 404 }
    );
  }

  const { data: { publicUrl } } = supabase.storage
    .from(PHOTOS_BUCKET)
    .getPublicUrl(storagePath);

  try {
    const doc = await prisma.templateDocument.create({
      data: {
        templateId,
        variantId,
        name: name.trim(),
        url: publicUrl,
        fileName,
        fileSize: typeof fileSize === "number" ? fileSize : uploaded.metadata?.size ?? 0,
        mimeType: mimeType ?? uploaded.metadata?.mimetype ?? "application/octet-stream",
        category: (category || "DRAWING").trim(),
      },
    });
    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to register template document");
  }
}
