import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";
import { sessionHasPermission } from "@/lib/permissions";
import { logEvent } from "@/lib/event-log";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #176) Toolbox talk CRUD for a site.
 * GET — list newest-first.
 * POST — create. Accepts either JSON or multipart/form-data:
 *   - JSON: { topic, notes?, attendees?, deliveredAt? }
 *   - FormData: same fields + optional `document` file (#175)
 */

async function authorise(siteId: string, requiredPermission?: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (
    !(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
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
  const a = await authorise(id);
  if ("error" in a) return a.error;

  const talks = await prisma.toolboxTalk.findMany({
    where: { siteId: id },
    orderBy: [{ deliveredAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return NextResponse.json(talks);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authorise(id, "EDIT_PROGRAMME");
  if ("error" in a) return a.error;

  // (#175) Accept JSON for the no-attachment path; FormData for the
  // doc-attached path. Branch on content-type.
  const contentType = req.headers.get("content-type") || "";
  let topic = "";
  let notes: string | null = null;
  let attendees: string | null = null;
  // (May 2026 Keith request) Contact ids of linked contractors. Sent
  // JSON-stringified in both the JSON and FormData paths so the parsing
  // is uniform.
  let contractorIds: string[] = [];
  let deliveredAt: Date = new Date();
  let documentUrl: string | null = null;
  let documentFileName: string | null = null;
  let documentSize: number | null = null;
  let documentMimeType: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    topic = String(formData.get("topic") || "").trim();
    notes = String(formData.get("notes") || "") || null;
    attendees = String(formData.get("attendees") || "") || null;
    const contractorIdsRaw = formData.get("contractorIds");
    if (typeof contractorIdsRaw === "string" && contractorIdsRaw) {
      try {
        const parsed = JSON.parse(contractorIdsRaw);
        if (Array.isArray(parsed)) {
          contractorIds = parsed.filter((x): x is string => typeof x === "string");
        }
      } catch {
        /* malformed — leave contractorIds empty */
      }
    }
    const deliveredAtStr = formData.get("deliveredAt");
    if (typeof deliveredAtStr === "string" && deliveredAtStr) {
      deliveredAt = new Date(deliveredAtStr);
    }

    const file = formData.get("document");
    if (file instanceof File && file.size > 0) {
      try {
        const ext = file.name.split(".").pop() || "bin";
        const storagePath = `toolbox/${id}/${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}.${ext}`;
        const arrayBuffer = await file.arrayBuffer();
        const { error: uploadError } = await getSupabase()
          .storage.from(PHOTOS_BUCKET)
          .upload(storagePath, arrayBuffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (uploadError) {
          console.error("Toolbox doc upload error:", uploadError);
          return NextResponse.json(
            { error: "Upload failed" },
            { status: 500 },
          );
        }
        const {
          data: { publicUrl },
        } = getSupabase().storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath);
        documentUrl = publicUrl;
        documentFileName = file.name || "document";
        documentSize = file.size;
        documentMimeType = file.type || null;
      } catch (err) {
        console.error("Toolbox doc handling error:", err);
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
      }
    }
  } else {
    const body = await req.json();
    topic = String(body?.topic || "").trim();
    notes = body?.notes || null;
    attendees = body?.attendees || null;
    if (Array.isArray(body?.contractorIds)) {
      contractorIds = body.contractorIds.filter(
        (x: unknown): x is string => typeof x === "string",
      );
    }
    if (body?.deliveredAt) deliveredAt = new Date(body.deliveredAt);
  }

  if (!topic) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  try {
    const talk = await prisma.toolboxTalk.create({
      data: {
        siteId: id,
        topic,
        notes,
        attendees,
        contractorIds,
        deliveredAt,
        deliveredBy: a.session.user.id,
        documentUrl,
        documentFileName,
        documentSize,
        documentMimeType,
      },
    });
    await logEvent(prisma, {
      type: "USER_ACTION",
      siteId: id,
      userId: a.session.user.id,
      description: `Toolbox talk logged: "${talk.topic}"${documentUrl ? ` (with attached doc)` : ""}`,
    });
    return NextResponse.json(talk, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to log toolbox talk");
  }
}
