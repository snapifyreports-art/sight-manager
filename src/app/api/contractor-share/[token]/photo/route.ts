import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyContractorToken } from "@/lib/share-token";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";
import { apiError } from "@/lib/api-errors";
import { logEvent } from "@/lib/event-log";

export const dynamic = "force-dynamic";

/**
 * POST /api/contractor-share/[token]/photo
 *
 * Contractor uploads progress photos against a job they're assigned
 * to. Mirrors the admin /api/jobs/[id]/photos endpoint but auth'd by
 * the contractor share token, with two narrowing rules:
 *   - The job must be assigned to the contact in the token
 *   - The job's plot must be on the site in the token
 *
 * FormData:
 *   - jobId      (string, required)
 *   - photos[]   (Files, required — at least one)
 *   - caption    (string, optional)
 *
 * Photos are saved with uploadedById = site.createdById (same compromise
 * used elsewhere for token-auth writes — JobPhoto.uploadedById is
 * non-nullable). The audit message in EventLog records the contractor.
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
    const jobId = formData.get("jobId");
    if (typeof jobId !== "string" || !jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }
    const caption = formData.get("caption");
    const captionStr = typeof caption === "string" ? caption.trim() : "";
    const photos = formData.getAll("photos").filter((p): p is File => p instanceof File);
    if (photos.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const assignment = await prisma.jobContractor.findFirst({
      where: {
        jobId,
        contactId: payload.contactId,
        job: { plot: { siteId: payload.siteId } },
      },
      select: {
        contact: { select: { name: true, company: true } },
        job: {
          select: {
            id: true,
            name: true,
            plotId: true,
            plot: { select: { plotNumber: true, name: true } },
          },
        },
      },
    });
    if (!assignment) {
      return NextResponse.json(
        { error: "Job not found or not assigned to you on this site" },
        { status: 404 },
      );
    }

    const site = await prisma.site.findUnique({
      where: { id: payload.siteId },
      select: { createdById: true },
    });
    if (!site?.createdById) {
      return NextResponse.json({ error: "Site owner not found" }, { status: 500 });
    }

    const created: { id: string; url: string }[] = [];
    for (const file of photos) {
      try {
        const ext = file.name.split(".").pop() || "jpg";
        const storagePath = `jobs/${jobId}/${Date.now()}-${Math.random()
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
          console.error("Contractor photo upload error:", uploadError);
          continue;
        }
        const {
          data: { publicUrl },
        } = getSupabase().storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath);
        const contractorLabel =
          assignment.contact.company || assignment.contact.name;
        const photo = await prisma.jobPhoto.create({
          data: {
            jobId,
            url: publicUrl,
            fileName: file.name || "photo.jpg",
            caption: captionStr || `Uploaded by ${contractorLabel} (via share link)`,
            tag: null,
            uploadedById: site.createdById,
          },
        });
        created.push({ id: photo.id, url: photo.url });
      } catch (err) {
        console.error("Contractor photo handling error:", err);
      }
    }

    if (created.length > 0) {
      const contractorLabel =
        assignment.contact.company || assignment.contact.name;
      const plotLabel = assignment.job.plot.plotNumber
        ? `Plot ${assignment.job.plot.plotNumber}`
        : assignment.job.plot.name;
      await logEvent(prisma, {
        type: "PHOTO_UPLOADED",
        description: `${created.length} progress photo${created.length !== 1 ? "s" : ""} uploaded by ${contractorLabel} (via share link) — ${plotLabel} · ${assignment.job.name}`,
        siteId: payload.siteId,
        plotId: assignment.job.plotId,
        jobId,
        detail: {
          count: created.length,
          contractor: contractorLabel,
          viaShareLink: true,
          jobName: assignment.job.name,
        },
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, count: created.length, photos: created });
  } catch (err) {
    return apiError(err, "Failed to upload photo");
  }
}
