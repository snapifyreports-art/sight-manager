// archiver is a CJS module — Next 16 / Turbopack rejects the default-import
// shorthand. Use the namespace form so the runtime callable + the type export
// both resolve from the same import.
import * as archiverNs from "archiver";
import type { Archiver } from "archiver";
import type { PrismaClient } from "@prisma/client";
import { Readable } from "stream";

// Some bundlers expose the function as `default`, others as the namespace
// itself. Try default first then fall back. Both resolutions are typed.
const archiver = (
  (archiverNs as unknown as { default?: typeof archiverNs }).default ??
  archiverNs
) as unknown as (...args: unknown[]) => Archiver;
import { format } from "date-fns";
import { buildSiteStory } from "./site-story";
import {
  renderSiteStoryPdf,
  renderCompletionSummaryPdf,
  renderPlotStoryPdf,
  renderPlotSnagLogPdf,
  renderPlotNcrLogPdf,
  renderPlotDefectLogPdf,
  renderPlotVariationLogPdf,
  renderPlotPreStartChecksPdf,
  renderPlotDrawSchedulePdf,
  renderPlotHandoverChecklistPdf,
  renderContractorSummaryPdf,
  renderContractorDetailPdf,
  renderSupplierSummaryPdf,
  renderSupplierDetailPdf,
  renderBudgetReportPdf,
  renderCashFlowPdf,
  renderDelayReportPdf,
  renderReadmeTxt,
} from "./handover-pdf-renderers";

/**
 * Site Handover ZIP assembler.
 *
 * Returns an archiver `Archive` instance — the API route pipes its
 * data stream straight into the HTTP response so we never buffer the
 * full ZIP in memory. archiver keeps each file's append → finalize
 * sequence simple; concurrency comes for free at the network layer.
 *
 * Folder structure follows the plan in
 * `C:\Users\keith\.claude\plans\playful-bouncing-stream.md`:
 *
 *   00_README.txt
 *   01_Site_Overview/
 *   02_Plots/Plot_<N>_<HouseType>/...
 *   03_Contractor_Analysis/
 *   04_Supplier_Analysis/
 *   05_Cost_Analysis/    budget-vs-actual.pdf + cash-flow.pdf
 *   06_Reports/          delay-report-final.pdf
 *
 * Each Supabase-hosted document/photo is fetched via its public URL
 * and streamed into the ZIP — no service-role key needed because the
 * `job-photos` bucket exposes public reads.
 */

interface BuildArgs {
  prisma: PrismaClient;
  siteId: string;
  triggeredByUserName: string;
}

// Sanitize any string used as a filename or folder. Keep it ASCII-safe
// — Windows + macOS + Linux all happy.
function safeName(input: string): string {
  return (input || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "untitled";
}

// Pull the file extension off a Supabase URL, falling back to the
// MIME-type sniff via response Content-Type if absent.
function extractExtension(url: string, contentType: string | null): string {
  const m = url.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  if (m) return m[1].toLowerCase();
  if (contentType?.includes("pdf")) return "pdf";
  if (contentType?.includes("png")) return "png";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg"))
    return "jpg";
  if (contentType?.includes("webp")) return "webp";
  return "bin";
}

// Best-effort fetch — if a Supabase URL 404s (e.g. file deleted from
// storage but DB row remains), we log + skip rather than blow up the
// whole ZIP. The README will still list the plot folder.
//
// (May 2026 audit #26 + #83) Streaming fetcher. Pre-fix this used
// arrayBuffer() which holds the entire file in RAM before appending.
// On a site with 500 photos × 2MB each = 1GB peak, way over Lambda's
// default budget. Now we hand the Web ReadableStream straight to
// archiver via Readable.fromWeb so each chunk passes through and is
// gone — peak memory is one chunk + the zip's internal compression
// buffer, regardless of how many or how big the source files are.
async function fetchAsStream(url: string): Promise<Readable | null> {
  try {
    const res = await fetch(url);
    if (!res.ok || !res.body) {
      console.warn(`[handover-zip] failed to fetch ${url}: ${res.status}`);
      return null;
    }
    return Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  } catch (err) {
    console.warn(`[handover-zip] fetch error for ${url}:`, err);
    return null;
  }
}

export async function buildHandoverArchive({
  prisma,
  siteId,
  triggeredByUserName,
}: BuildArgs): Promise<Archiver> {
  const archive = archiver("zip", { zlib: { level: 6 } });

  archive.on("warning", (err) => {
    console.warn("[handover-zip] archiver warning:", err);
  });
  archive.on("error", (err) => {
    console.error("[handover-zip] archiver error:", err);
    throw err;
  });

  // Build the rich Story payload up front — used by overview PDFs +
  // per-plot PDFs + contractor section.
  const story = await buildSiteStory(prisma, siteId, {
    includeFullDetail: true,
  });

  const safeSiteName = safeName(story.site.name);
  const plotFolderNames = story.plotStories.map(
    (p) =>
      `Plot_${safeName(p.plotNumber || p.name)}${p.houseType ? `_${safeName(p.houseType)}` : ""}`,
  );

  // Kick off the async work — `archive.append` is synchronous but the
  // PDF renderers are async. We `await` each so the order in the ZIP
  // is deterministic. Ordering doesn't matter for correctness but
  // helps when QAing the output in Windows Explorer.

  // ─── 00_README ────────────────────────────────────────────────────
  archive.append(
    renderReadmeTxt(story, triggeredByUserName, plotFolderNames),
    { name: "00_README.txt" },
  );

  // ─── 01_Site_Overview ─────────────────────────────────────────────
  const siteStoryPdf = await renderSiteStoryPdf(story);
  archive.append(siteStoryPdf, {
    name: "01_Site_Overview/site-story.pdf",
  });
  const completionPdf = await renderCompletionSummaryPdf(story);
  archive.append(completionPdf, {
    name: "01_Site_Overview/completion-summary.pdf",
  });

  // ─── 02_Plots ─────────────────────────────────────────────────────
  for (let i = 0; i < story.plotStories.length; i++) {
    const plot = story.plotStories[i];
    const folder = `02_Plots/${plotFolderNames[i]}`;

    // plot-story.pdf
    const plotStoryPdf = await renderPlotStoryPdf(story, plot);
    archive.append(plotStoryPdf, { name: `${folder}/plot-story.pdf` });

    // snag-log.pdf — Snag uses createdAt + description (no separate
    // title field) per schema.prisma:757
    const snags = await prisma.snag.findMany({
      where: { plotId: plot.id },
      orderBy: { createdAt: "asc" },
      select: {
        description: true,
        location: true,
        status: true,
        priority: true,
        createdAt: true,
        resolvedAt: true,
        raisedBy: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    });
    const snagPdf = await renderPlotSnagLogPdf(
      `Plot ${plot.plotNumber || plot.name}`,
      snags,
    );
    archive.append(snagPdf, { name: `${folder}/snag-log.pdf` });

    // (May 2026 Story-linkage audit) NCR / Defect / Variation logs per
    // plot. These were silently absent from Handover ZIP pre-this pass
    // — buyer pack stopped at snags + photos + docs. Now QA + warranty
    // + scope-change narrative all land in 02_Plots/Plot_*/...
    const plotLabel = `Plot ${plot.plotNumber || plot.name}`;

    // NCR.raisedById/closedById are plain FK columns — no Prisma
    // relation defined — so resolve user names via a separate User
    // lookup, then reshape into the nested-object form the renderer
    // expects.
    const ncrRows = await prisma.nCR.findMany({
      where: { plotId: plot.id },
      orderBy: { raisedAt: "asc" },
      select: {
        ref: true,
        title: true,
        description: true,
        rootCause: true,
        correctiveAction: true,
        status: true,
        raisedAt: true,
        closedAt: true,
        raisedById: true,
        closedById: true,
        contact: { select: { name: true, company: true } },
      },
    });
    if (ncrRows.length > 0) {
      const ncrUserIds = Array.from(
        new Set(
          ncrRows.flatMap((n) =>
            [n.raisedById, n.closedById].filter((v): v is string => !!v),
          ),
        ),
      );
      const ncrUsers = ncrUserIds.length
        ? await prisma.user.findMany({
            where: { id: { in: ncrUserIds } },
            select: { id: true, name: true },
          })
        : [];
      const ncrUserMap = new Map(ncrUsers.map((u) => [u.id, u.name]));
      const ncrs = ncrRows.map((n) => ({
        ref: n.ref,
        title: n.title,
        description: n.description,
        rootCause: n.rootCause,
        correctiveAction: n.correctiveAction,
        status: n.status,
        raisedAt: n.raisedAt,
        closedAt: n.closedAt,
        raisedBy: n.raisedById
          ? { name: ncrUserMap.get(n.raisedById) ?? "Unknown" }
          : null,
        closedBy: n.closedById
          ? { name: ncrUserMap.get(n.closedById) ?? "Unknown" }
          : null,
        contact: n.contact,
      }));
      const ncrPdf = await renderPlotNcrLogPdf(plotLabel, ncrs);
      archive.append(ncrPdf, { name: `${folder}/ncr-log.pdf` });
    }

    const defects = await prisma.defectReport.findMany({
      where: { plotId: plot.id },
      orderBy: { reportedAt: "asc" },
      select: {
        ref: true,
        title: true,
        description: true,
        status: true,
        reportedAt: true,
        resolvedAt: true,
      },
    });
    if (defects.length > 0) {
      const defectPdf = await renderPlotDefectLogPdf(plotLabel, defects);
      archive.append(defectPdf, {
        name: `${folder}/defect-log.pdf`,
      });
    }

    const variations = await prisma.variation.findMany({
      where: { plotId: plot.id },
      orderBy: { createdAt: "asc" },
      select: {
        ref: true,
        title: true,
        description: true,
        requestedBy: true,
        costDelta: true,
        daysDelta: true,
        status: true,
        approvedAt: true,
        createdAt: true,
      },
    });
    if (variations.length > 0) {
      const varPdf = await renderPlotVariationLogPdf(plotLabel, variations);
      archive.append(varPdf, { name: `${folder}/variation-log.pdf` });
    }

    // (May 2026 Story-linkage audit) Pre-start checks — handover-
    // readiness audit. Emit only when checks were ever defined for
    // the plot.
    // PreStartCheck.checkedById is a plain FK — no Prisma relation —
    // so resolve via a separate User lookup like the NCR block above.
    const preStartRows = await prisma.preStartCheck.findMany({
      where: { plotId: plot.id },
      orderBy: { sortOrder: "asc" },
      select: {
        label: true,
        checked: true,
        checkedAt: true,
        notes: true,
        checkedById: true,
      },
    });
    if (preStartRows.length > 0) {
      const psUserIds = Array.from(
        new Set(
          preStartRows
            .map((p) => p.checkedById)
            .filter((v): v is string => !!v),
        ),
      );
      const psUsers = psUserIds.length
        ? await prisma.user.findMany({
            where: { id: { in: psUserIds } },
            select: { id: true, name: true },
          })
        : [];
      const psUserMap = new Map(psUsers.map((u) => [u.id, u.name]));
      const preStartChecks = preStartRows.map((p) => ({
        label: p.label,
        checked: p.checked,
        checkedAt: p.checkedAt,
        notes: p.notes,
        checkedBy: p.checkedById
          ? { name: psUserMap.get(p.checkedById) ?? "Unknown" }
          : null,
      }));
      const psPdf = await renderPlotPreStartChecksPdf(
        plotLabel,
        preStartChecks,
      );
      archive.append(psPdf, { name: `${folder}/pre-start-checks.pdf` });
    }

    // Per-plot draw schedule. Buyer's solicitor wants this in writing.
    // PlotDrawSchedule.triggerJobId is a plain FK — no Prisma relation
    // defined — so resolve job names via a separate Job.findMany.
    const drawRows = await prisma.plotDrawSchedule.findMany({
      where: { plotId: plot.id },
      orderBy: { sortOrder: "asc" },
      select: {
        name: true,
        amount: true,
        status: true,
        dueAt: true,
        paidAt: true,
        notes: true,
        triggerJobId: true,
      },
    });
    if (drawRows.length > 0) {
      const triggerJobIds = Array.from(
        new Set(
          drawRows
            .map((d) => d.triggerJobId)
            .filter((v): v is string => !!v),
        ),
      );
      const triggerJobs = triggerJobIds.length
        ? await prisma.job.findMany({
            where: { id: { in: triggerJobIds } },
            select: { id: true, name: true },
          })
        : [];
      const triggerJobMap = new Map(triggerJobs.map((j) => [j.id, j.name]));
      const drawSchedule = drawRows.map((d) => ({
        name: d.name,
        amount: d.amount,
        status: d.status,
        dueAt: d.dueAt,
        paidAt: d.paidAt,
        notes: d.notes,
        triggerJob: d.triggerJobId
          ? { name: triggerJobMap.get(d.triggerJobId) ?? "Unknown" }
          : null,
      }));
      const dsPdf = await renderPlotDrawSchedulePdf(plotLabel, drawSchedule);
      archive.append(dsPdf, { name: `${folder}/draw-schedule.pdf` });
    }

    // (May 2026 Story-linkage audit) HandoverChecklist — distinct
    // from the SiteDocument "HANDOVER" category folder above. This is
    // the structured per-doc-type tracker (EPC / gas-safe / electrical
    // / NHBC / warranty / etc.) with required + signed-off + checked-by
    // metadata. Renders even when items exist but haven't been linked
    // to a SiteDocument yet, so buyers see what's still outstanding.
    const handoverItems = await prisma.handoverChecklist.findMany({
      where: { plotId: plot.id },
      orderBy: { docType: "asc" },
      select: {
        docType: true,
        required: true,
        checkedAt: true,
        notes: true,
        checkedBy: { select: { name: true } },
        document: { select: { name: true } },
      },
    });
    if (handoverItems.length > 0) {
      const hcPdf = await renderPlotHandoverChecklistPdf(
        plotLabel,
        handoverItems,
      );
      archive.append(hcPdf, { name: `${folder}/handover-checklist.pdf` });
    }

    // VoiceNotes for this plot — copy the audio files into a
    // per-plot voice-notes/ folder and emit a transcript-index.txt
    // so the buyer/director can find the relevant clips without
    // listening to every one. Same parallel-batch fetch pattern as
    // photos and docs above.
    // VoiceNote.jobId is a plain FK — no Prisma relation defined —
    // so resolve job names via a separate Job.findMany.
    const voiceNoteRows = await prisma.voiceNote.findMany({
      where: { plotId: plot.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        url: true,
        durationSec: true,
        caption: true,
        transcript: true,
        createdAt: true,
        jobId: true,
      },
    });
    const voiceJobIds = Array.from(
      new Set(
        voiceNoteRows
          .map((v) => v.jobId)
          .filter((v): v is string => !!v),
      ),
    );
    const voiceJobs = voiceJobIds.length
      ? await prisma.job.findMany({
          where: { id: { in: voiceJobIds } },
          select: { id: true, name: true },
        })
      : [];
    const voiceJobMap = new Map(voiceJobs.map((j) => [j.id, j.name]));
    const voiceNotes = voiceNoteRows.map((v) => ({
      id: v.id,
      url: v.url,
      durationSec: v.durationSec,
      caption: v.caption,
      transcript: v.transcript,
      createdAt: v.createdAt,
      job: v.jobId ? { name: voiceJobMap.get(v.jobId) ?? null } : null,
    }));
    if (voiceNotes.length > 0) {
      const VOICE_BATCH = 5;
      for (let j = 0; j < voiceNotes.length; j += VOICE_BATCH) {
        const batch = voiceNotes.slice(j, j + VOICE_BATCH);
        const streams = await Promise.all(
          batch.map((v) => fetchAsStream(v.url)),
        );
        batch.forEach((v, idx) => {
          const stream = streams[idx];
          if (!stream) return;
          const ext = extractExtension(v.url, "m4a");
          const dateStr = format(v.createdAt, "yyyy-MM-dd-HHmm");
          const captionPart = v.caption
            ? `_${safeName(v.caption).slice(0, 40)}`
            : "";
          archive.append(stream, {
            name: `${folder}/voice-notes/${dateStr}${captionPart}.${ext}`,
          });
        });
      }
      // Transcript index — one text file summarising every clip so
      // a reader can grep for a phrase without playing the audio.
      const indexLines: string[] = [];
      indexLines.push(`Voice notes — ${plotLabel}`);
      indexLines.push("");
      for (const v of voiceNotes) {
        indexLines.push(
          `[${format(v.createdAt, "dd MMM yy HH:mm")}] ${v.job?.name ? `(${v.job.name}) ` : ""}${v.caption ?? ""}${v.durationSec ? ` — ${v.durationSec}s` : ""}`,
        );
        if (v.transcript) {
          indexLines.push(`  ${v.transcript}`);
        }
        indexLines.push("");
      }
      archive.append(indexLines.join("\n"), {
        name: `${folder}/voice-notes/_index.txt`,
      });
    }

    // PhotoAnnotation count — stored against JobPhotos that already
    // get copied into the photos/ folder. We append an annotations
    // manifest so a reader can see which photos were marked up
    // (the stroke overlays themselves still need a future renderer
    // — schema:1450 has them serialised as JSON for now).
    // PhotoAnnotation.createdById is a plain FK — no Prisma relation
    // — so resolve names via a separate User lookup.
    const annotationRows = await prisma.photoAnnotation.findMany({
      where: { plotId: plot.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        caption: true,
        createdAt: true,
        createdById: true,
        jobPhoto: { select: { caption: true } },
      },
    });
    const annUserIds = Array.from(
      new Set(
        annotationRows
          .map((a) => a.createdById)
          .filter((v): v is string => !!v),
      ),
    );
    const annUsers = annUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: annUserIds } },
          select: { id: true, name: true },
        })
      : [];
    const annUserMap = new Map(annUsers.map((u) => [u.id, u.name]));
    const annotations = annotationRows.map((a) => ({
      id: a.id,
      caption: a.caption,
      createdAt: a.createdAt,
      createdBy: a.createdById
        ? { name: annUserMap.get(a.createdById) ?? null }
        : null,
      jobPhoto: a.jobPhoto,
    }));
    if (annotations.length > 0) {
      const lines: string[] = [];
      lines.push(`Photo annotations — ${plotLabel}`);
      lines.push("");
      lines.push(
        `${annotations.length} annotation${annotations.length === 1 ? "" : "s"} recorded against this plot's photos.`,
      );
      lines.push("");
      for (const a of annotations) {
        lines.push(
          `[${format(a.createdAt, "dd MMM yy HH:mm")}] ${a.createdBy?.name ?? "unknown"} — ${a.caption ?? "(no caption)"} (on photo: ${a.jobPhoto?.caption ?? "(no caption)"})`,
        );
      }
      archive.append(lines.join("\n"), {
        name: `${folder}/photos/_annotations.txt`,
      });
    }

    // certificates/ + drawings/ from SiteDocument by category
    const docs = await prisma.siteDocument.findMany({
      where: { plotId: plot.id },
      select: {
        id: true,
        name: true,
        url: true,
        category: true,
      },
    });
    // (May 2026 audit P-*) Same parallel-batch pattern as the photos
    // loop below — pre-fix this was N sequential fetches per plot.
    const DOC_BATCH = 10;
    for (let i = 0; i < docs.length; i += DOC_BATCH) {
      const batch = docs.slice(i, i + DOC_BATCH);
      const streams = await Promise.all(batch.map((d) => fetchAsStream(d.url)));
      batch.forEach((doc, idx) => {
        const stream = streams[idx];
        if (!stream) return;
        const cat = (doc.category || "OTHER").toUpperCase();
        const folderForCat =
          cat === "CERT"
            ? "certificates"
            : cat === "DRAWING"
              ? "drawings"
              : cat === "SPEC"
                ? "specs"
                : cat === "RAMS"
                  ? "rams"
                  : cat === "HANDOVER"
                    ? "handover-checklist"
                    : "other";
        const ext = extractExtension(doc.url, null);
        const name = safeName(doc.name);
        archive.append(stream, {
          name: `${folder}/${folderForCat}/${name}.${ext}`,
        });
      });
    }

    // photos/ — every JobPhoto on the plot, organised by stage.
    // (May 2026 audit P-* handover-zip) Pre-fix this awaited each photo
    // fetch in series — a 500-photo site = 500 sequential HTTPS round
    // trips before the ZIP could finalise, easily exceeding the Lambda
    // budget. Now fetch in parallel batches of 10 (avoids saturating
    // Supabase's CDN + keeps Node's event loop responsive), but append
    // in chronological order so the ZIP's file ordering matches the
    // findMany orderBy. The stream itself is still chunked; only the
    // HTTPS request kick-off is concurrent.
    const photos = await prisma.jobPhoto.findMany({
      where: { job: { plotId: plot.id } },
      select: {
        id: true,
        url: true,
        caption: true,
        tag: true,
        createdAt: true,
        job: { select: { name: true, stageCode: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const PHOTO_BATCH = 10;
    for (let i = 0; i < photos.length; i += PHOTO_BATCH) {
      const batch = photos.slice(i, i + PHOTO_BATCH);
      const streams = await Promise.all(batch.map((p) => fetchAsStream(p.url)));
      batch.forEach((p, idx) => {
        const stream = streams[idx];
        if (!stream) return;
        const ext = extractExtension(p.url, null);
        const stageFolder = safeName(p.job.stageCode || p.job.name);
        const ts = p.createdAt.toISOString().slice(0, 10);
        const filename = `${ts}_${safeName(p.caption || p.tag || p.id)}.${ext}`;
        archive.append(stream, {
          name: `${folder}/photos/${stageFolder}/${filename}`,
        });
      });
    }
  }

  // ─── 03_Contractor_Analysis ──────────────────────────────────────
  // Pull the rich per-contractor data via the same logic as the API
  // route. Inline a query so we don't HTTP-call ourselves.
  const contractorRows = await prisma.jobContractor.findMany({
    where: { job: { plot: { siteId } } },
    select: {
      contactId: true,
      contact: {
        select: {
          name: true,
          company: true,
          email: true,
          phone: true,
        },
      },
      job: {
        select: {
          id: true,
          name: true,
          status: true,
          startDate: true,
          endDate: true,
          actualEndDate: true,
          originalEndDate: true,
          plot: { select: { plotNumber: true, houseType: true } },
        },
      },
    },
  });
  const contractorMap = new Map<
    string,
    {
      name: string;
      company: string | null;
      email: string | null;
      phone: string | null;
      jobsAssigned: number;
      jobsCompleted: number;
      jobsOnTime: number;
      jobsLate: number;
      totalDelayDaysAttributed: number;
      jobs: Array<{
        jobName: string;
        plotNumber: string | null;
        status: string;
        plannedEnd: string | null;
        actualEnd: string | null;
        daysLate: number | null;
      }>;
    }
  >();
  for (const r of contractorRows) {
    const row =
      contractorMap.get(r.contactId) ?? {
        name: r.contact.name,
        company: r.contact.company,
        email: r.contact.email,
        phone: r.contact.phone,
        jobsAssigned: 0,
        jobsCompleted: 0,
        jobsOnTime: 0,
        jobsLate: 0,
        totalDelayDaysAttributed: 0,
        jobs: [],
      };
    row.jobsAssigned++;
    let daysLate: number | null = null;
    if (r.job.status === "COMPLETED") {
      row.jobsCompleted++;
      if (
        r.job.actualEndDate &&
        r.job.actualEndDate.getTime() <= r.job.originalEndDate.getTime()
      ) {
        row.jobsOnTime++;
        daysLate = 0;
      } else if (r.job.actualEndDate) {
        row.jobsLate++;
        // (May 2026 audit D-P2) Comment lied — was actually calendar-day
        // division (`Math.round(ms/86400000)`). Route through the SSOT
        // working-day helper so this matches the in-app contractor-
        // analysis route, which is the canonical "days attributed" for
        // each contractor.
        const { differenceInWorkingDays } = await import("@/lib/working-days");
        daysLate = Math.max(
          0,
          differenceInWorkingDays(r.job.actualEndDate, r.job.originalEndDate),
        );
        row.totalDelayDaysAttributed += daysLate;
      }
    }
    row.jobs.push({
      jobName: r.job.name,
      plotNumber: r.job.plot.plotNumber,
      status: r.job.status,
      plannedEnd: r.job.endDate?.toISOString() ?? null,
      actualEnd: r.job.actualEndDate?.toISOString() ?? null,
      daysLate,
    });
    contractorMap.set(r.contactId, row);
  }
  const contractors = Array.from(contractorMap.values()).sort(
    (a, b) => b.jobsCompleted - a.jobsCompleted,
  );

  const contractorSummaryPdf = await renderContractorSummaryPdf(
    story.site.name,
    contractors.map((c) => ({
      contactId: "",
      name: c.name,
      company: c.company,
      jobsAssigned: c.jobsAssigned,
      jobsCompleted: c.jobsCompleted,
      jobsOnTime: c.jobsOnTime,
      jobsLate: c.jobsLate,
      totalDelayDaysAttributed: c.totalDelayDaysAttributed,
    })),
  );
  archive.append(contractorSummaryPdf, {
    name: "03_Contractor_Analysis/summary.pdf",
  });
  for (const c of contractors) {
    const detailPdf = await renderContractorDetailPdf(story.site.name, c);
    archive.append(detailPdf, {
      name: `03_Contractor_Analysis/per-contractor/${safeName(c.name)}.pdf`,
    });
  }

  // ─── 04_Supplier_Analysis ────────────────────────────────────────
  const orderRows = await prisma.materialOrder.findMany({
    where: {
      OR: [
        { job: { plot: { siteId } } },
        { siteId },
      ],
    },
    select: {
      id: true,
      itemsDescription: true,
      status: true,
      expectedDeliveryDate: true,
      deliveredDate: true,
      supplier: {
        select: {
          id: true,
          name: true,
          contactName: true,
          contactEmail: true,
        },
      },
      job: {
        select: {
          name: true,
          plot: { select: { plotNumber: true } },
        },
      },
    },
  });
  const supplierMap = new Map<
    string,
    {
      name: string;
      contactName: string | null;
      contactEmail: string | null;
      ordersTotal: number;
      ordersDelivered: number;
      ordersLate: number;
      ordersOutstanding: number;
      totalDaysLate: number;
      orders: Array<{
        items: string;
        status: string;
        expectedDelivery: string | null;
        actualDelivery: string | null;
        daysLate: number | null;
        plotNumber: string | null;
        jobName: string | null;
      }>;
    }
  >();
  for (const o of orderRows) {
    const row =
      supplierMap.get(o.supplier.id) ?? {
        name: o.supplier.name,
        contactName: o.supplier.contactName,
        contactEmail: o.supplier.contactEmail,
        ordersTotal: 0,
        ordersDelivered: 0,
        ordersLate: 0,
        ordersOutstanding: 0,
        totalDaysLate: 0,
        orders: [],
      };
    row.ordersTotal++;
    let daysLate: number | null = null;
    if (o.status === "DELIVERED") {
      row.ordersDelivered++;
      if (o.deliveredDate && o.expectedDeliveryDate) {
        if (o.deliveredDate.getTime() > o.expectedDeliveryDate.getTime()) {
          row.ordersLate++;
          daysLate = Math.max(
            0,
            Math.round(
              (o.deliveredDate.getTime() - o.expectedDeliveryDate.getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          );
          row.totalDaysLate += daysLate;
        } else {
          daysLate = 0;
        }
      }
    } else if (o.status !== "CANCELLED") {
      row.ordersOutstanding++;
    }
    row.orders.push({
      items: o.itemsDescription ?? "",
      status: o.status,
      expectedDelivery: o.expectedDeliveryDate?.toISOString() ?? null,
      actualDelivery: o.deliveredDate?.toISOString() ?? null,
      daysLate,
      plotNumber: o.job?.plot?.plotNumber ?? null,
      jobName: o.job?.name ?? null,
    });
    supplierMap.set(o.supplier.id, row);
  }
  const suppliers = Array.from(supplierMap.values()).sort(
    (a, b) => b.ordersTotal - a.ordersTotal,
  );

  const supplierSummaryPdf = await renderSupplierSummaryPdf(
    story.site.name,
    suppliers,
  );
  archive.append(supplierSummaryPdf, {
    name: "04_Supplier_Analysis/summary.pdf",
  });
  for (const s of suppliers) {
    const detailPdf = await renderSupplierDetailPdf(story.site.name, s);
    archive.append(detailPdf, {
      name: `04_Supplier_Analysis/per-supplier/${safeName(s.name)}.pdf`,
    });
  }

  // ─── 05_Cost_Analysis ────────────────────────────────────────────
  // (May 2026 audit follow-up) Inline summary aggregations rather than
  // calling into the API route handlers. The richer per-plot detail
  // remains in the in-app Reporting tabs; this PDF is the executive
  // summary that lives inside the handover pack.

  const allOrdersRaw = await prisma.materialOrder.findMany({
    where: { OR: [{ siteId }, { job: { plot: { siteId } } }] },
    select: {
      status: true,
      expectedDeliveryDate: true,
      deliveredDate: true,
      orderItems: { select: { quantity: true, unitCost: true } },
      job: { select: { plot: { select: { id: true, name: true, plotNumber: true } } } },
    },
  });
  // Compute totalCost on the fly — there's no cached total on the model.
  const allOrders = allOrdersRaw.map((o) => ({
    ...o,
    totalCost: o.orderItems.reduce(
      (s, i) => s + (i.quantity ?? 0) * (i.unitCost ?? 0),
      0,
    ),
  }));

  const allMaterials = await prisma.plotMaterial.findMany({
    where: { plot: { siteId } },
    select: {
      quantity: true,
      unitCost: true,
      delivered: true,
      plot: { select: { id: true, name: true, plotNumber: true } },
    },
  });

  // Budget = sum of plotMaterial.quantity*unitCost (template / forecast).
  // Actual = sum of materialOrder.totalCost where DELIVERED.
  // Committed = orders ORDERED or DELIVERED.
  // Per-plot = group by plot.id and sum.
  const totalBudgeted = allMaterials.reduce(
    (s, m) => s + (m.quantity ?? 0) * (m.unitCost ?? 0),
    0,
  );
  const totalActual = allOrders
    .filter((o) => o.status === "DELIVERED")
    .reduce((s, o) => s + (o.totalCost ?? 0), 0);
  const totalCommitted = allOrders
    .filter((o) => ["ORDERED", "DELIVERED"].includes(o.status))
    .reduce((s, o) => s + (o.totalCost ?? 0), 0);
  const totalDelivered = totalActual;
  const totalPending = allOrders
    .filter((o) => o.status === "PENDING")
    .reduce((s, o) => s + (o.totalCost ?? 0), 0);

  const plotBudgetMap = new Map<
    string,
    { plotName: string; plotNumber: string | null; budgeted: number; actual: number }
  >();
  for (const m of allMaterials) {
    const k = m.plot.id;
    const cur = plotBudgetMap.get(k) ?? {
      plotName: m.plot.name,
      plotNumber: m.plot.plotNumber,
      budgeted: 0,
      actual: 0,
    };
    cur.budgeted += (m.quantity ?? 0) * (m.unitCost ?? 0);
    plotBudgetMap.set(k, cur);
  }
  for (const o of allOrders) {
    if (o.status !== "DELIVERED") continue;
    if (!o.job?.plot) continue;
    const k = o.job.plot.id;
    const cur = plotBudgetMap.get(k) ?? {
      plotName: o.job.plot.name,
      plotNumber: o.job.plot.plotNumber,
      budgeted: 0,
      actual: 0,
    };
    cur.actual += o.totalCost ?? 0;
    plotBudgetMap.set(k, cur);
  }
  const plotBudgetRows = Array.from(plotBudgetMap.values())
    .map((r) => ({ ...r, variance: r.actual - r.budgeted }))
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  const totalVariance = totalActual - totalBudgeted;
  const variancePercent =
    totalBudgeted > 0 ? Math.round((totalVariance / totalBudgeted) * 100) : 0;

  const budgetPdf = await renderBudgetReportPdf(story.site.name, {
    siteSummary: {
      totalBudgeted,
      totalActual,
      totalDelivered,
      totalCommitted,
      totalPending,
      totalVariance,
      variancePercent,
      plotCount: plotBudgetRows.length,
      plotsOverBudget: plotBudgetRows.filter((p) => p.variance > 0).length,
      plotsUnderBudget: plotBudgetRows.filter((p) => p.variance < 0).length,
      plotsOnBudget: plotBudgetRows.filter((p) => p.variance === 0).length,
    },
    topOverruns: plotBudgetRows.slice(0, 10).map((p) => ({
      plotName: p.plotNumber ? `Plot ${p.plotNumber}` : p.plotName,
      name: "(plot total)",
      budgeted: p.budgeted,
      actual: p.actual,
      variance: p.variance,
      variancePercent:
        p.budgeted > 0 ? Math.round((p.variance / p.budgeted) * 100) : 0,
    })),
    plots: plotBudgetRows,
  });
  archive.append(budgetPdf, { name: "05_Cost_Analysis/budget-vs-actual.pdf" });

  // Cash-flow PDF — group orders by their dateOfOrder month.
  const monthMap = new Map<
    string,
    { forecast: number; actual: number; committed: number }
  >();
  for (const o of allOrders) {
    const dateRef = o.deliveredDate ?? o.expectedDeliveryDate;
    if (!dateRef) continue;
    const ym = `${dateRef.getUTCFullYear()}-${String(dateRef.getUTCMonth() + 1).padStart(2, "0")}`;
    const cur = monthMap.get(ym) ?? { forecast: 0, actual: 0, committed: 0 };
    cur.forecast += o.totalCost ?? 0;
    if (o.status === "DELIVERED") cur.actual += o.totalCost ?? 0;
    if (["ORDERED", "DELIVERED"].includes(o.status))
      cur.committed += o.totalCost ?? 0;
    monthMap.set(ym, cur);
  }
  const months = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({ month, ...v }));

  const cashFlowPdf = await renderCashFlowPdf(story.site.name, {
    months,
    totals: {
      committed: totalCommitted,
      orderedOpen: allOrders
        .filter((o) => o.status === "ORDERED")
        .reduce((s, o) => s + (o.totalCost ?? 0), 0),
      forecast: totalBudgeted,
      actual: totalActual,
    },
  });
  archive.append(cashFlowPdf, { name: "05_Cost_Analysis/cash-flow.pdf" });

  // ─── 06_Reports — Delay report ───────────────────────────────────
  const rainedOff = await prisma.rainedOffDay.findMany({
    where: { siteId },
    select: { type: true },
  });
  const totalRainDays = rainedOff.filter((r) => r.type === "RAIN").length;
  const totalTemperatureDays = rainedOff.filter(
    (r) => r.type === "TEMPERATURE",
  ).length;

  // Delayed jobs: leaf jobs where actualEndDate > endDate (planned).
  const delayedJobsRaw = await prisma.job.findMany({
    where: {
      plot: { siteId },
      actualEndDate: { not: null },
      children: { none: {} },
    },
    select: {
      name: true,
      endDate: true,
      actualEndDate: true,
      weatherAffected: true,
      plot: { select: { name: true, plotNumber: true } },
    },
  });
  const delayedJobs = delayedJobsRaw
    .filter((j) => j.endDate && j.actualEndDate && j.actualEndDate > j.endDate)
    .map((j) => {
      const days = Math.ceil(
        (j.actualEndDate!.getTime() - j.endDate!.getTime()) / (24 * 60 * 60 * 1000),
      );
      return {
        plotName: j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name,
        name: j.name,
        delayDays: days,
        isWeatherExcused: !!j.weatherAffected,
        weatherReasonType: null,
        delayReason: null,
      };
    })
    .sort((a, b) => b.delayDays - a.delayDays);

  // (May 2026 audit D-P0-8) Currently-overdue jobs — NOT_STARTED or
  // IN_PROGRESS past their endDate. Pre-fix the PDF omitted these
  // entirely so the largest delay bucket was invisible in the buyer
  // pack. Now pulled and rendered above the completed-late table.
  const todayForReport = new Date();
  todayForReport.setHours(0, 0, 0, 0);
  const overdueRaw = await prisma.job.findMany({
    where: {
      plot: { siteId },
      endDate: { lt: todayForReport },
      status: { not: "COMPLETED" },
      children: { none: {} },
    },
    select: {
      // (May 2026 audit P-* delay PDF) id selected so we can batch-
      // resolve reason codes from LatenessEvent below.
      id: true,
      name: true,
      status: true,
      endDate: true,
      weatherAffected: true,
      plot: { select: { name: true, plotNumber: true } },
      contractors: {
        select: { contact: { select: { name: true, company: true } } },
        take: 1,
      },
    },
    orderBy: { endDate: "asc" },
  });
  const { differenceInWorkingDays } = await import("@/lib/working-days");
  // (May 2026 audit) Pull the open JOB_END_OVERDUE lateness rows for
  // these jobs so each row in the PDF carries the reason code. Single
  // batch query, then map by jobId. delayReason.label preferred over
  // the broad reasonCode enum when a manager has picked a specific one.
  const overdueIds = overdueRaw.map((j) => j.id);
  const overdueLateness = overdueIds.length
    ? await prisma.latenessEvent.findMany({
        where: {
          targetType: "job",
          targetId: { in: overdueIds },
          kind: "JOB_END_OVERDUE",
          resolvedAt: null,
        },
        select: {
          targetId: true,
          reasonCode: true,
          delayReason: { select: { label: true } },
        },
      })
    : [];
  const reasonByJob = new Map<string, string | null>();
  for (const le of overdueLateness) {
    const label = le.delayReason?.label ?? le.reasonCode ?? null;
    reasonByJob.set(le.targetId, label);
  }
  const currentlyOverdueJobs = overdueRaw.map((j) => ({
    plotName: j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name,
    name: j.name,
    status: j.status,
    daysLate: j.endDate
      ? Math.max(0, differenceInWorkingDays(todayForReport, j.endDate))
      : 0,
    isWeatherExcused: !!j.weatherAffected,
    contractor: j.contractors[0]?.contact
      ? j.contractors[0].contact.company || j.contractors[0].contact.name
      : null,
    reasonCode: reasonByJob.get(j.id) ?? null,
  }));

  // Lateness rollup (LatenessEvent table — open + resolved across the site).
  const latenessRows = await prisma.latenessEvent.findMany({
    where: { siteId },
    select: { resolvedAt: true, daysLate: true, reasonCode: true },
  });
  const openLatenessRows = latenessRows.filter((r) => !r.resolvedAt);
  const resolvedLatenessRows = latenessRows.filter((r) => r.resolvedAt);
  const reasonCounts = new Map<string, number>();
  for (const r of openLatenessRows) {
    reasonCounts.set(r.reasonCode, (reasonCounts.get(r.reasonCode) ?? 0) + r.daysLate);
  }
  const sortedReasons = Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1]);
  const latenessSummary = latenessRows.length > 0
    ? {
        openCount: openLatenessRows.length,
        openDays: openLatenessRows.reduce((s, r) => s + r.daysLate, 0),
        resolvedCount: resolvedLatenessRows.length,
        resolvedDays: resolvedLatenessRows.reduce((s, r) => s + r.daysLate, 0),
        topReason: sortedReasons[0]?.[0] ?? null,
      }
    : undefined;

  // Overdue deliveries (open orders past expected date).
  const overdueDeliveriesRaw = await prisma.materialOrder.findMany({
    where: {
      OR: [{ siteId }, { job: { plot: { siteId } } }],
      status: "ORDERED",
      expectedDeliveryDate: { lt: new Date() },
    },
    select: {
      itemsDescription: true,
      expectedDeliveryDate: true,
      supplier: { select: { name: true } },
      job: { select: { name: true } },
    },
  });
  const overdueDeliveries = overdueDeliveriesRaw.map((d) => ({
    items: d.itemsDescription ?? "(unspecified)",
    supplier: d.supplier?.name ?? "",
    expectedDate: d.expectedDeliveryDate?.toISOString() ?? null,
    job: d.job?.name ?? "(one-off order)",
  }));

  const delayPdf = await renderDelayReportPdf(story.site.name, {
    totalWeatherImpactDays: rainedOff.length,
    totalRainDays,
    totalTemperatureDays,
    delayedJobs,
    currentlyOverdueJobs,
    overdueDeliveries,
    latenessSummary,
  });
  archive.append(delayPdf, { name: "06_Reports/delay-report-final.pdf" });

  // ─── 08_Toolbox_Talks ────────────────────────────────────────────
  // (May 2026 Story-linkage audit) Site-wide TBT register +
  // attachments. Pre-this the ZIP didn't include any TBT data — the
  // safety briefing audit trail was invisible at handover. Now:
  // a register text file + per-talk subfolder for the briefing docs
  // / RAMS / incident photos that managers attached when raising
  // the request. Folder only created when there's at least one
  // talk on the site.
  const allTalks = await prisma.toolboxTalk.findMany({
    where: { siteId: story.site.id },
    orderBy: { requestedAt: "asc" },
    select: {
      id: true,
      topic: true,
      notes: true,
      attendees: true,
      contractorIds: true,
      status: true,
      requestedAt: true,
      deliveredAt: true,
      dueBy: true,
      attachments: {
        select: { id: true, url: true, fileName: true, size: true, mimeType: true },
      },
    },
  });
  if (allTalks.length > 0) {
    const regLines: string[] = [];
    regLines.push("Toolbox talks register");
    regLines.push("─".repeat(64));
    regLines.push("");
    for (const t of allTalks) {
      regLines.push(
        `[${format(t.requestedAt, "dd MMM yy HH:mm")}] (${t.status}) ${t.topic}`,
      );
      if (t.deliveredAt) {
        regLines.push(
          `   delivered ${format(t.deliveredAt, "dd MMM yy HH:mm")}`,
        );
      }
      if (t.dueBy) {
        regLines.push(`   due by ${format(t.dueBy, "dd MMM yy HH:mm")}`);
      }
      if (t.contractorIds.length > 0) {
        regLines.push(`   contractors: ${t.contractorIds.length} assigned`);
      }
      if (t.attendees) {
        regLines.push(`   attendees: ${t.attendees}`);
      }
      if (t.notes) {
        regLines.push(`   notes: ${t.notes.replace(/\n/g, "\n            ")}`);
      }
      if (t.attachments.length > 0) {
        regLines.push(
          `   attachments: ${t.attachments.length} file${t.attachments.length === 1 ? "" : "s"} in attachments/`,
        );
      }
      regLines.push("");
    }
    archive.append(regLines.join("\n"), {
      name: "08_Toolbox_Talks/_register.txt",
    });

    // Per-talk subfolder for the attachments. Folder named with the
    // talk's date + a slug of the topic so files are findable in a
    // file browser without consulting the register.
    for (const t of allTalks) {
      if (t.attachments.length === 0) continue;
      const folderName = `${format(t.requestedAt, "yyyy-MM-dd")}_${safeName(t.topic).slice(0, 40)}`;
      const TALK_BATCH = 5;
      for (let j = 0; j < t.attachments.length; j += TALK_BATCH) {
        const batch = t.attachments.slice(j, j + TALK_BATCH);
        const streams = await Promise.all(
          batch.map((a) => fetchAsStream(a.url)),
        );
        batch.forEach((a, idx) => {
          const stream = streams[idx];
          if (!stream) return;
          archive.append(stream, {
            name: `08_Toolbox_Talks/${folderName}/${safeName(a.fileName)}`,
          });
        });
      }
    }
  }

  // Caller is expected to start streaming AFTER they've attached the
  // archive to a response, so we don't call finalize() here. Returning
  // the archive instance gives the caller control over piping.
  return archive;
}
