import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyContractorToken } from "@/lib/share-token";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";
import { sendPushToAll } from "@/lib/push";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/contractor-share/[token]/snag-action
 *
 * Contractor self-service snag sign-off — replaces the two admin-auth
 * calls (/api/snags/[id]/photos + /api/snags/[id]/request-signoff) that
 * SnagSignOffCard used to make. Those required `auth()`, which the
 * public contractor portal doesn't have.
 *
 * Accepts FormData with:
 *   - snagId        (string, required)
 *   - photos[]      (Files, optional — uploaded with tag="after")
 *   - notes         (string, optional)
 *
 * Verifies the snag belongs to a job assigned to this contractor on
 * this site, uploads photos to Supabase storage, flips snag.status to
 * IN_PROGRESS, logs an EventLog, and fires a push to admins.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const payload = verifyContractorToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired share link" },
        { status: 401 },
      );
    }

    const formData = await req.formData();
    const snagId = formData.get("snagId");
    if (typeof snagId !== "string" || !snagId) {
      return NextResponse.json({ error: "snagId required" }, { status: 400 });
    }
    const notes = formData.get("notes");
    // (May 2026 audit B-14) Sanitise contractor-submitted notes before
    // appending to snag.notes. Strip HTML tags + control chars to close
    // an XSS path: notes get rendered admin-side and any future
    // `dangerouslySetInnerHTML` consumer would inject. Cap length at
    // 2000 chars so a single submission can't bloat the column.
    const rawNotes = typeof notes === "string" ? notes : "";
    const notesStr = rawNotes
      .replace(/<[^>]*>/g, "") // strip any HTML-tag-looking thing
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars except \n \r \t
      .trim()
      .slice(0, 2000);
    // Cap photos at 12 per submission to stop a runaway upload loop.
    const photos = formData
      .getAll("photos")
      .filter((p): p is File => p instanceof File)
      .slice(0, 12);

    const snag = await prisma.snag.findUnique({
      where: { id: snagId },
      include: {
        plot: {
          select: {
            plotNumber: true,
            name: true,
            siteId: true,
            site: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!snag) {
      return NextResponse.json({ error: "Snag not found" }, { status: 404 });
    }
    if (snag.plot.siteId !== payload.siteId) {
      return NextResponse.json(
        { error: "Snag does not belong to your assigned site" },
        { status: 403 },
      );
    }
    if (snag.contactId !== payload.contactId) {
      return NextResponse.json(
        { error: "Snag is not assigned to you" },
        { status: 403 },
      );
    }
    if (snag.status === "RESOLVED" || snag.status === "CLOSED") {
      return NextResponse.json({ error: "Snag is already resolved" }, { status: 400 });
    }

    // Upload any attached photos under tag "after" (proof-of-fix).
    if (photos.length > 0) {
      for (const file of photos) {
        try {
          const ext = file.name.split(".").pop() || "jpg";
          const storagePath = `snags/${snagId}/${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}.${ext}`;
          const arrayBuffer = await file.arrayBuffer();
          const { error: uploadError } = await getSupabase()
            .storage.from(PHOTOS_BUCKET)
            .upload(storagePath, arrayBuffer, {
              contentType: file.type || "image/jpeg",
              upsert: false,
            });
          if (uploadError) {
            console.error("Snag photo upload error:", uploadError);
            continue;
          }
          const {
            data: { publicUrl },
          } = getSupabase().storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath);
          await prisma.snagPhoto.create({
            data: {
              snagId,
              url: publicUrl,
              fileName: file.name || "photo.jpg",
              tag: "after",
            },
          });
        } catch (err) {
          console.error("Snag photo handling error:", err);
        }
      }
    }

    // Append the contractor's note onto the snag history.
    const updateData: Record<string, unknown> = { status: "IN_PROGRESS" };
    if (notesStr) {
      const timestamp = new Date().toLocaleDateString("en-GB");
      const existing = snag.notes || "";
      const sep = existing ? "\n" : "";
      updateData.notes = `${existing}${sep}[${timestamp}] Contractor notes (via share link): ${notesStr}`;
    }
    await prisma.snag.update({ where: { id: snagId }, data: updateData });

    const plotLabel = snag.plot.plotNumber ? `Plot ${snag.plot.plotNumber}` : snag.plot.name;
    await prisma.eventLog
      .create({
        data: {
          type: "USER_ACTION",
          description: `Snag sign-off requested by contractor (share link): "${snag.description}" on ${plotLabel}`,
          siteId: snag.plot.site.id,
          plotId: snag.plotId,
        },
      })
      .catch(() => {});

    // Notify admins so they can come and verify the fix.
    await sendPushToAll("JOBS_READY_FOR_SIGNOFF", {
      title: "Snag Sign-Off Requested",
      body: `${plotLabel} on ${snag.plot.site.name}: "${snag.description}" — contractor says this is resolved`,
      url: `/sites/${snag.plot.site.id}?tab=snags&snagId=${snagId}`,
      tag: `snag-signoff-${snagId}`,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to record snag action");
  }
}
