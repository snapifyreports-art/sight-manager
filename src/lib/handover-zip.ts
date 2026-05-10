// archiver is a CJS module — Next 16 / Turbopack rejects the default-import
// shorthand. Use the namespace form so the runtime callable + the type export
// both resolve from the same import.
import * as archiverNs from "archiver";
import type { Archiver } from "archiver";
import type { PrismaClient } from "@prisma/client";

// Some bundlers expose the function as `default`, others as the namespace
// itself. Try default first then fall back. Both resolutions are typed.
const archiver = (
  (archiverNs as unknown as { default?: typeof archiverNs }).default ??
  archiverNs
) as unknown as (...args: unknown[]) => Archiver;
import { buildSiteStory } from "./site-story";
import {
  renderSiteStoryPdf,
  renderCompletionSummaryPdf,
  renderPlotStoryPdf,
  renderPlotSnagLogPdf,
  renderContractorSummaryPdf,
  renderContractorDetailPdf,
  renderSupplierSummaryPdf,
  renderSupplierDetailPdf,
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
 *   05_Cost_Analysis/    (TODO: budget + cash-flow PDFs)
 *   06_Reports/          (TODO: delay-report-final.pdf)
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
async function fetchAsBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[handover-zip] failed to fetch ${url}: ${res.status}`);
      return null;
    }
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
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
    for (const doc of docs) {
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
      const buf = await fetchAsBuffer(doc.url);
      if (!buf) continue;
      const ext = extractExtension(doc.url, null);
      const name = safeName(doc.name);
      archive.append(buf, {
        name: `${folder}/${folderForCat}/${name}.${ext}`,
      });
    }

    // photos/ — every JobPhoto on the plot, organised by stage
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
    for (const p of photos) {
      const buf = await fetchAsBuffer(p.url);
      if (!buf) continue;
      const ext = extractExtension(p.url, null);
      const stageFolder = safeName(p.job.stageCode || p.job.name);
      const ts = p.createdAt.toISOString().slice(0, 10);
      const filename = `${ts}_${safeName(p.caption || p.tag || p.id)}.${ext}`;
      archive.append(buf, {
        name: `${folder}/photos/${stageFolder}/${filename}`,
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
        // Working-day count between original and actual end
        const ms = r.job.actualEndDate.getTime() - r.job.originalEndDate.getTime();
        daysLate = Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
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

  // ─── 05_Cost_Analysis + 06_Reports ───────────────────────────────
  // First-pass: skip the heavy report PDFs to keep the initial ZIP
  // shipping. Drop a placeholder so the structure is obvious — the
  // budget/cash-flow/delay-report renderers can be added in a follow-
  // up that wraps the existing JSON endpoints in jsPDF.
  archive.append(
    Buffer.from(
      "Cost analysis PDFs (budget-vs-actual, cash-flow, variance) " +
        "will be added in a follow-up — for now please refer to the " +
        "respective Reporting tabs in the app.\n",
      "utf-8",
    ),
    { name: "05_Cost_Analysis/_pending.txt" },
  );
  archive.append(
    Buffer.from(
      "Delay report + weekly reports will be added in a follow-up.\n",
      "utf-8",
    ),
    { name: "06_Reports/_pending.txt" },
  );

  // Caller is expected to start streaming AFTER they've attached the
  // archive to a response, so we don't call finalize() here. Returning
  // the archive instance gives the caller control over piping.
  return archive;
}
