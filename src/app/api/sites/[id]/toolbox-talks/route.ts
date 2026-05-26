import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";
import { sessionHasPermission } from "@/lib/permissions";
import { logEvent } from "@/lib/event-log";
import { sendEmail, toolboxTalkRequestedEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #176) Toolbox talk CRUD for a site.
 *
 * GET — list newest-first, with attachments + linked contractors.
 *
 * POST — create. Accepts either JSON or multipart/form-data.
 *   - mode: "log"     → already-delivered (default for legacy callers).
 *                       status: COMPLETED, deliveredAt set.
 *   - mode: "request" → not yet delivered. status: REQUESTED,
 *                       deliveredAt null. Optionally emails linked
 *                       contractors (sendEmail flag, default true).
 *
 * FormData supports multiple files via `document` (repeated field).
 * Files become ToolboxTalkAttachment rows; the legacy single-doc
 * columns on ToolboxTalk are also populated with the first file so
 * old readers stay correct.
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

  // (May 2026 Keith request) Sort by requestedAt desc rather than
  // deliveredAt — REQUESTED talks have null deliveredAt and would
  // otherwise sink to the bottom of the list. Within the same
  // timestamp, id desc keeps the order stable across reloads.
  const talks = await prisma.toolboxTalk.findMany({
    where: { siteId: id },
    orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
    take: 200,
    include: {
      attachments: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          url: true,
          fileName: true,
          size: true,
          mimeType: true,
        },
      },
    },
  });
  return NextResponse.json(talks);
}

interface UploadedFile {
  url: string;
  fileName: string;
  size: number;
  mimeType: string | null;
}

async function uploadOneFile(
  siteId: string,
  file: File,
): Promise<UploadedFile> {
  const ext = file.name.split(".").pop() || "bin";
  const storagePath = `toolbox/${siteId}/${Date.now()}-${Math.random()
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
    throw new Error(`Upload failed: ${uploadError.message}`);
  }
  const {
    data: { publicUrl },
  } = getSupabase().storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath);
  return {
    url: publicUrl,
    fileName: file.name || "document",
    size: file.size,
    mimeType: file.type || null,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const a = await authorise(id, "EDIT_PROGRAMME");
  if ("error" in a) return a.error;

  // Accept JSON for the simple log-with-no-attachments path; FormData
  // for the path with attachments (one or many). Branch on content-type.
  const contentType = req.headers.get("content-type") || "";
  let topic = "";
  let notes: string | null = null;
  let attendees: string | null = null;
  let contractorIds: string[] = [];
  // (May 2026 Keith request) mode controls the lifecycle. Defaults to
  // "log" so any legacy client that doesn't send it keeps the old
  // already-delivered semantics.
  let mode: "log" | "request" = "log";
  let deliveredAt: Date | null = null;
  let dueBy: Date | null = null;
  let sendEmailFlag = true;
  const uploads: UploadedFile[] = [];

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
    const modeRaw = formData.get("mode");
    if (modeRaw === "request") mode = "request";
    const deliveredAtStr = formData.get("deliveredAt");
    if (typeof deliveredAtStr === "string" && deliveredAtStr) {
      deliveredAt = new Date(deliveredAtStr);
    }
    const dueByStr = formData.get("dueBy");
    if (typeof dueByStr === "string" && dueByStr) {
      dueBy = new Date(dueByStr);
    }
    const sendEmailRaw = formData.get("sendEmail");
    if (sendEmailRaw != null) sendEmailFlag = sendEmailRaw !== "false";

    // (May 2026 Keith request) Multi-file upload — getAll("document")
    // returns every field with that name so the existing single-file
    // input wiring is forward-compatible. Files upload sequentially;
    // any failure aborts the whole create (no partial-state talk).
    const files = formData.getAll("document");
    for (const f of files) {
      if (f instanceof File && f.size > 0) {
        try {
          uploads.push(await uploadOneFile(id, f));
        } catch (err) {
          console.error("Toolbox doc upload error:", err);
          return NextResponse.json({ error: "Upload failed" }, { status: 500 });
        }
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
    if (body?.mode === "request") mode = "request";
    if (body?.deliveredAt) deliveredAt = new Date(body.deliveredAt);
    if (body?.dueBy) dueBy = new Date(body.dueBy);
    if (body?.sendEmail === false) sendEmailFlag = false;
  }

  if (!topic) {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  // Pick the legacy single-document fields off the first attachment so
  // existing readers that haven't migrated to attachments[] still show
  // something useful.
  const legacyDoc = uploads[0] ?? null;

  try {
    const isRequest = mode === "request";
    const talk = await prisma.toolboxTalk.create({
      data: {
        siteId: id,
        topic,
        notes,
        attendees,
        contractorIds,
        status: isRequest ? "REQUESTED" : "COMPLETED",
        requestedById: a.session.user.id,
        dueBy,
        // log mode: stamp delivery. request mode: leave null until
        // someone marks complete via PATCH.
        deliveredAt: isRequest ? null : (deliveredAt ?? new Date()),
        deliveredBy: isRequest ? null : a.session.user.id,
        documentUrl: legacyDoc?.url ?? null,
        documentFileName: legacyDoc?.fileName ?? null,
        documentSize: legacyDoc?.size ?? null,
        documentMimeType: legacyDoc?.mimeType ?? null,
        attachments: {
          create: uploads.map((u) => ({
            url: u.url,
            fileName: u.fileName,
            size: u.size,
            mimeType: u.mimeType,
          })),
        },
      },
      include: {
        attachments: {
          select: {
            id: true,
            url: true,
            fileName: true,
            size: true,
            mimeType: true,
          },
        },
      },
    });

    // (May 2026 Keith request) Email the linked contractors when the
    // talk is REQUESTED. Failures shouldn't kill the request — log and
    // move on, mirror of the snag-raised email behaviour.
    let emailSentCount = 0;
    if (isRequest && sendEmailFlag && contractorIds.length > 0) {
      try {
        const contractors = await prisma.contact.findMany({
          where: {
            id: { in: contractorIds },
            email: { not: null },
          },
          select: { id: true, name: true, email: true },
        });
        const site = await prisma.site.findUnique({
          where: { id },
          select: { name: true },
        });
        const requesterName = a.session.user.name ?? "Site manager";
        const dueByLabel = dueBy ? dueBy.toLocaleDateString("en-GB") : null;
        const emailAttachments = uploads.map((u) => ({
          url: u.url,
          fileName: u.fileName,
        }));
        for (const c of contractors) {
          if (!c.email) continue;
          try {
            const { subject, html } = toolboxTalkRequestedEmail({
              contractorName: c.name,
              topic,
              reason: notes,
              requesterName,
              siteName: site?.name ?? "the site",
              dueBy: dueByLabel,
              attachments: emailAttachments,
            });
            await sendEmail({ to: c.email, subject, html });
            emailSentCount++;
          } catch (sendErr) {
            console.error(`Toolbox email to ${c.id} failed:`, sendErr);
          }
        }
        if (emailSentCount > 0) {
          await prisma.toolboxTalk.update({
            where: { id: talk.id },
            data: { emailSentAt: new Date(), emailSentToCount: emailSentCount },
          });
        }
      } catch (emailErr) {
        // Don't fail the whole request if the email side falls over —
        // the talk is created either way and can be re-sent later.
        console.error("Toolbox request email batch failed:", emailErr);
      }
    }

    await logEvent(prisma, {
      type: "USER_ACTION",
      siteId: id,
      userId: a.session.user.id,
      description: isRequest
        ? `Toolbox talk requested: "${talk.topic}" (${contractorIds.length} contractor${contractorIds.length !== 1 ? "s" : ""}${emailSentCount > 0 ? `, ${emailSentCount} emailed` : ""})`
        : `Toolbox talk logged: "${talk.topic}"${uploads.length > 0 ? ` (with ${uploads.length} attachment${uploads.length !== 1 ? "s" : ""})` : ""}`,
    });
    return NextResponse.json(talk, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to log toolbox talk");
  }
}
