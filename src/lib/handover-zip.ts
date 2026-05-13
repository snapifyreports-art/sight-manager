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

  // Caller is expected to start streaming AFTER they've attached the
  // archive to a response, so we don't call finalize() here. Returning
  // the archive instance gives the caller control over piping.
  return archive;
}
