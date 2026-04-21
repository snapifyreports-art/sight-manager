import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Generate a signed upload URL for a template document.
 *
 * Why this exists: Vercel serverless functions cap request body at 4.5MB
 * across all plans. Construction drawings routinely exceed that (10–30MB
 * PDFs). Sending bytes through the function → 413 Payload Too Large.
 *
 * This endpoint generates a short-lived Supabase signed URL that the
 * client PUTs the file to directly, bypassing Vercel entirely. The
 * browser → Supabase CDN handshake has no such limit (50MB default,
 * configurable up to 5GB per file on paid plans).
 *
 * Flow:
 *   1. POST /sign with file metadata → { signedUrl, token, storagePath }
 *   2. Client uploads bytes directly to signedUrl
 *   3. POST /register with storagePath → DB row created, doc visible
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { fileName, fileSize, mimeType } = body as {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  };

  if (!fileName || typeof fileSize !== "number" || fileSize <= 0) {
    return NextResponse.json(
      { error: "fileName and fileSize are required" },
      { status: 400 }
    );
  }

  // 50MB cap (matches the advertised limit in the UI). Supabase's default
  // bucket file-size limit is 50MB too, so larger would reject at storage
  // level anyway.
  const MAX_BYTES = 50 * 1024 * 1024;
  if (fileSize > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${Math.round(fileSize / (1024 * 1024))}MB) — max 50MB` },
      { status: 413 }
    );
  }

  // Unique path so re-uploading same filename doesn't collide.
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  const storagePath = `template-docs/${templateId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(PHOTOS_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    console.error("createSignedUploadUrl failed:", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to generate upload URL" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    storagePath,
    mimeType: mimeType ?? null,
  });
}
