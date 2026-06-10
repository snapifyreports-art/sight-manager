import { format } from "date-fns";
import type { SiteStory, PlotStory, ContractorPerf } from "./site-story";
import { loadJsPdf, pdfBuffer, safeDate } from "./pdf-builder";

/**
 * jsPDF renderers for each PDF inside the Handover ZIP.
 *
 * (May 2026 PDF refactor) Routed through src/lib/pdf-builder.ts —
 * shared loadJsPdf / pdfBuffer / safeDate so every PDF in the system
 * follows the same convention. The renderers below still know about
 * the Handover ZIP's particular layout choices, but the boilerplate
 * (dynamic import, ArrayBuffer→Buffer, date formatting) lives in the
 * canonical module.
 */

// ──────────────────────────────────────────────────────────────────────
// 01_Site_Overview/site-story.pdf
// ──────────────────────────────────────────────────────────────────────
export async function renderSiteStoryPdf(story: SiteStory): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Cover
  doc.setFontSize(22);
  doc.text(story.site.name, 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text("Site Story — internal retrospective", 14, 30);
  doc.setTextColor(0);

  doc.setFontSize(9);
  doc.text(
    `Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`,
    14,
    37,
  );

  // Overview
  doc.setFontSize(13);
  doc.text("Overview", 14, 52);
  autoTable(doc, {
    startY: 56,
    body: [
      ["Plots completed", `${story.overview.plotsCompleted} of ${story.overview.plotCount}`],
      ["Overall completion", `${Math.round(story.overview.overallPercent)}%`],
      ["Days elapsed (working)", String(story.overview.daysElapsed)],
      [
        "Plan duration (working)",
        story.overview.daysOriginalPlan != null
          ? String(story.overview.daysOriginalPlan)
          : "—",
      ],
      [
        "Variance",
        story.overview.daysVarianceWorking == null
          ? "—"
          : `${story.overview.daysVarianceWorking > 0 ? "+" : ""}${story.overview.daysVarianceWorking} working days`,
      ],
      [
        "On-time plot rate",
        `${Math.round(story.variance.onTimePlotCompletionRate * 100)}%`,
      ],
      [
        "Snags raised / open",
        `${story.variance.snagsRaised} / ${story.variance.snagsOpen}`,
      ],
    ],
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 70, fontStyle: "bold" } },
  });

  // Milestones
  let y =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? 100;
  y += 10;
  doc.setFontSize(13);
  doc.text("Milestones", 14, y);
  autoTable(doc, {
    startY: y + 4,
    head: [["Milestone", "Date"]],
    body: story.milestones.map((m) => [m.label, safeDate(m.date, "not yet")]),
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
  });

  // Variance breakdown
  y =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? y;
  y += 10;
  doc.setFontSize(13);
  doc.text("Variance breakdown", 14, y);
  autoTable(doc, {
    startY: y + 4,
    body: [
      ["Weather days (rain)", String(story.variance.totalRainDays)],
      ["Weather days (temperature)", String(story.variance.totalTemperatureDays)],
      ["Weather-excused delay days", String(story.variance.totalDelayDaysWeather)],
      ["Other delay days", String(story.variance.totalDelayDaysOther)],
    ],
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 70 } },
  });

  // Per-plot summary table
  doc.addPage();
  doc.setFontSize(15);
  doc.text("Plot summary", 14, 20);
  autoTable(doc, {
    startY: 26,
    head: [
      [
        "Plot",
        "House type",
        "Status",
        "%",
        "Variance",
        "Delays",
        "Snags",
        "Photos",
      ],
    ],
    body: story.plotStories.map((p) => [
      p.plotNumber || p.name,
      p.houseType ?? "—",
      p.status,
      `${Math.round(p.buildCompletePercent)}%`,
      p.daysVarianceWorking == null
        ? "—"
        : `${p.daysVarianceWorking > 0 ? "+" : ""}${p.daysVarianceWorking}d`,
      String(p.delayCount),
      `${p.snagCount} (${p.snagsOpen} open)`,
      String(p.photoCount),
    ]),
    styles: { fontSize: 8, cellPadding: 1 },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
  });

  return pdfBuffer(doc);
}

// ──────────────────────────────────────────────────────────────────────
// 01_Site_Overview/completion-summary.pdf
// ──────────────────────────────────────────────────────────────────────
export async function renderCompletionSummaryPdf(
  story: SiteStory,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(20);
  doc.text("Site Handover Pack", 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(
    `${story.site.name}${story.site.location ? ` — ${story.site.location}` : ""}`,
    14,
    30,
  );
  doc.setTextColor(0);

  doc.setFontSize(9);
  doc.text(
    `Pack generated ${format(new Date(), "dd MMM yyyy HH:mm")}`,
    14,
    38,
  );

  doc.setFontSize(13);
  doc.text("Completion summary", 14, 52);
  autoTable(doc, {
    startY: 56,
    body: [
      [
        "Site started",
        safeDate(
          story.milestones.find((m) => m.key === "first-job-started")?.date,
        ),
      ],
      [
        "First plot complete",
        safeDate(
          story.milestones.find((m) => m.key === "first-plot-complete")?.date,
        ),
      ],
      [
        "Site closed",
        safeDate(story.site.completedAt, "not yet"),
      ],
      ["Total plots", String(story.overview.plotCount)],
      ["Plots completed", String(story.overview.plotsCompleted)],
      [
        "Plan vs actual (working days)",
        story.overview.daysOriginalPlan != null
          ? `Plan ${story.overview.daysOriginalPlan} · Actual ${story.overview.daysElapsed}`
          : "no baseline",
      ],
      [
        "On-time plot completion",
        `${Math.round(story.variance.onTimePlotCompletionRate * 100)}%`,
      ],
      [
        "Total weather days",
        String(
          story.variance.totalRainDays + story.variance.totalTemperatureDays,
        ),
      ],
      ["Snags raised", String(story.variance.snagsRaised)],
      ["Snags resolved", String(story.variance.snagsResolved)],
    ],
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 70, fontStyle: "bold" } },
  });

  return pdfBuffer(doc);
}

// ──────────────────────────────────────────────────────────────────────
// 02_Plots/Plot_<N>/plot-story.pdf
// ──────────────────────────────────────────────────────────────────────
export async function renderPlotStoryPdf(
  story: SiteStory,
  plot: PlotStory,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(18);
  doc.text(`Plot ${plot.plotNumber || plot.name}`, 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(
    `${plot.houseType ?? "—"} · ${story.site.name}`,
    14,
    30,
  );
  doc.setTextColor(0);

  doc.setFontSize(9);
  doc.text(
    `Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`,
    14,
    37,
  );

  // Plot facts
  autoTable(doc, {
    startY: 50,
    body: [
      ["Status", plot.status],
      ["Build completion", `${Math.round(plot.buildCompletePercent)}%`],
      ["Started", safeDate(plot.startedAt, "not yet")],
      ["Completed", safeDate(plot.completedAt, "not yet")],
      [
        "Variance",
        plot.daysVarianceWorking == null
          ? "—"
          : `${plot.daysVarianceWorking > 0 ? "+" : ""}${plot.daysVarianceWorking} working days`,
      ],
      ["Delay events", String(plot.delayCount)],
      [
        "Snags",
        `${plot.snagCount} raised, ${plot.snagsOpen} open`,
      ],
      ["Photos captured", String(plot.photoCount)],
      ["Journal entries", String(plot.journalEntryCount)],
    ],
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 60, fontStyle: "bold" } },
  });

  // Timeline
  const y =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? 100;
  doc.setFontSize(13);
  doc.text("Timeline", 14, y + 10);
  if (plot.highlights.length === 0) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text("No timeline events recorded.", 14, y + 18);
    doc.setTextColor(0);
  } else {
    autoTable(doc, {
      startY: y + 14,
      head: [["When", "Event", "Detail"]],
      body: plot.highlights.map((h) => [
        format(new Date(h.date), "dd MMM yy"),
        h.type,
        h.reason
          ? `${h.description} (${h.reason})`
          : h.description.length > 80
            ? `${h.description.slice(0, 80)}…`
            : h.description,
      ]),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 28 } },
    });
  }

  return pdfBuffer(doc);
}

// ──────────────────────────────────────────────────────────────────────
// 02_Plots/Plot_<N>/snag-log.pdf
// ──────────────────────────────────────────────────────────────────────
export async function renderPlotSnagLogPdf(
  plotName: string,
  snags: Array<{
    description: string;
    location: string | null;
    status: string;
    priority: string;
    createdAt: Date;
    resolvedAt: Date | null;
    raisedBy: { name: string } | null;
    assignedTo: { name: string } | null;
  }>,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(`Snag log — ${plotName}`, 14, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${snags.length} snag${snags.length === 1 ? "" : "s"} recorded`,
    14,
    28,
  );
  doc.setTextColor(0);

  if (snags.length === 0) {
    doc.setFontSize(10);
    doc.text("No snags recorded for this plot.", 14, 40);
  } else {
    autoTable(doc, {
      startY: 36,
      head: [["Description", "Location", "Priority", "Status", "Raised", "Resolved", "By"]],
      body: snags.map((s) => [
        s.description.length > 60
          ? `${s.description.slice(0, 60)}…`
          : s.description,
        s.location ?? "—",
        s.priority,
        s.status,
        format(s.createdAt, "dd MMM yy"),
        s.resolvedAt ? format(s.resolvedAt, "dd MMM yy") : "—",
        s.raisedBy?.name ?? "—",
      ]),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  return pdfBuffer(doc);
}

// ──────────────────────────────────────────────────────────────────────
// 02_Plots/Plot_<N>/inspection-log.pdf
// (Jun 2026 Q5 + S12) Branded inspection register — replaces the plain
// inspection-log.txt so the statutory hold-point record matches the rest
// of the buyer pack. Headline "X of Y passed" + per-row cert presence.
// ──────────────────────────────────────────────────────────────────────
export async function renderPlotInspectionLogPdf(
  plotName: string,
  inspections: Array<{
    name: string;
    type: string;
    status: string;
    scheduledDate: Date;
    bookedDate: Date | null;
    passedAt: Date | null;
    failedAt: Date | null;
    notes: string | null;
    inspector: { name: string; company: string | null } | null;
    certificate: { name: string } | null;
  }>,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const passed = inspections.filter((i) => i.status === "PASSED").length;

  doc.setFontSize(16);
  doc.text(`Inspection register — ${plotName}`, 14, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${inspections.length} hold-point${inspections.length === 1 ? "" : "s"} · ${passed} of ${inspections.length} passed`,
    14,
    28,
  );
  doc.setTextColor(0);

  if (inspections.length === 0) {
    doc.setFontSize(10);
    doc.text("No inspections recorded for this plot.", 14, 40);
  } else {
    autoTable(doc, {
      startY: 36,
      head: [["Inspection", "Type", "Status", "Scheduled", "Result", "Inspector", "Certificate"]],
      body: inspections.map((i) => {
        const resolved = i.passedAt ?? i.failedAt;
        return [
          i.name.length > 40 ? `${i.name.slice(0, 40)}…` : i.name,
          i.type.replace(/_/g, " "),
          i.status,
          format(i.scheduledDate, "dd MMM yy"),
          resolved ? format(resolved, "dd MMM yy") : "—",
          i.inspector ? `${i.inspector.name}${i.inspector.company ? ` (${i.inspector.company})` : ""}` : "—",
          i.certificate ? i.certificate.name : "NOT ATTACHED",
        ];
      }),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  return pdfBuffer(doc);
}

// ──────────────────────────────────────────────────────────────────────
// (May 2026 Story-linkage audit) Per-plot NCR / Defect / Variation
// log PDFs. Modelled after renderPlotSnagLogPdf so the layout, fonts
// and table styling match the rest of the handover pack.

export async function renderPlotNcrLogPdf(
  plotName: string,
  ncrs: Array<{
    ref: string | null;
    title: string;
    description: string;
    rootCause: string | null;
    correctiveAction: string | null;
    status: string;
    raisedAt: Date;
    closedAt: Date | null;
    raisedBy: { name: string } | null;
    closedBy: { name: string } | null;
    contact: { name: string; company: string | null } | null;
  }>,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(`NCR log — ${plotName}`, 14, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${ncrs.length} non-conformance${ncrs.length === 1 ? "" : "s"} recorded`,
    14,
    28,
  );
  doc.setTextColor(0);

  if (ncrs.length === 0) {
    doc.setFontSize(10);
    doc.text("No NCRs recorded for this plot.", 14, 40);
  } else {
    autoTable(doc, {
      startY: 36,
      head: [["Ref", "Title", "Status", "Raised", "Closed", "Raised by"]],
      body: ncrs.map((n) => [
        n.ref ?? "—",
        n.title.length > 50 ? `${n.title.slice(0, 50)}…` : n.title,
        n.status,
        format(n.raisedAt, "dd MMM yy"),
        n.closedAt ? format(n.closedAt, "dd MMM yy") : "—",
        n.raisedBy?.name ?? "—",
      ]),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });

    // Detail blocks below the summary table — root cause +
    // corrective action are the point of an NCR, so they get full
    // text rather than a truncated cell.
    let y = (doc as unknown as { lastAutoTable?: { finalY?: number } })
      .lastAutoTable?.finalY ?? 60;
    y += 8;
    for (const n of ncrs) {
      if (y > 270) {
        doc.addPage();
        y = 22;
      }
      doc.setFontSize(11);
      doc.text(`${n.ref ?? "(no ref)"} — ${n.title}`, 14, y);
      y += 5;
      doc.setFontSize(9);
      doc.setTextColor(80);
      const desc = doc.splitTextToSize(n.description || "—", 180);
      doc.text(desc, 14, y);
      y += desc.length * 4 + 2;
      if (n.rootCause) {
        doc.setTextColor(0);
        doc.text("Root cause:", 14, y);
        y += 4;
        const rc = doc.splitTextToSize(n.rootCause, 180);
        doc.setTextColor(80);
        doc.text(rc, 14, y);
        y += rc.length * 4 + 2;
      }
      if (n.correctiveAction) {
        doc.setTextColor(0);
        doc.text("Corrective action:", 14, y);
        y += 4;
        const ca = doc.splitTextToSize(n.correctiveAction, 180);
        doc.setTextColor(80);
        doc.text(ca, 14, y);
        y += ca.length * 4 + 2;
      }
      doc.setTextColor(0);
      y += 4;
    }
  }

  return pdfBuffer(doc);
}

export async function renderPlotDefectLogPdf(
  plotName: string,
  defects: Array<{
    ref: string | null;
    title: string;
    description: string;
    status: string;
    reportedAt: Date;
    resolvedAt: Date | null;
  }>,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(`Defect log — ${plotName}`, 14, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(
    `${defects.length} defect${defects.length === 1 ? "" : "s"} recorded`,
    14,
    28,
  );
  doc.setTextColor(0);

  if (defects.length === 0) {
    doc.setFontSize(10);
    doc.text("No defects recorded for this plot.", 14, 40);
  } else {
    autoTable(doc, {
      startY: 36,
      head: [["Ref", "Title", "Description", "Status", "Reported", "Resolved"]],
      body: defects.map((d) => [
        d.ref ?? "—",
        d.title.length > 40 ? `${d.title.slice(0, 40)}…` : d.title,
        d.description.length > 60
          ? `${d.description.slice(0, 60)}…`
          : d.description,
        d.status,
        format(d.reportedAt, "dd MMM yy"),
        d.resolvedAt ? format(d.resolvedAt, "dd MMM yy") : "—",
      ]),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  return pdfBuffer(doc);
}

export async function renderPlotVariationLogPdf(
  plotName: string,
  variations: Array<{
    ref: string | null;
    title: string;
    description: string | null;
    requestedBy: string | null;
    costDelta: number | null;
    daysDelta: number | null;
    status: string;
    approvedAt: Date | null;
    createdAt: Date;
  }>,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(`Variation log — ${plotName}`, 14, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  const totalCost = variations.reduce((s, v) => s + (v.costDelta ?? 0), 0);
  const totalDays = variations.reduce((s, v) => s + (v.daysDelta ?? 0), 0);
  doc.text(
    `${variations.length} variation${variations.length === 1 ? "" : "s"} · £${Math.round(totalCost).toLocaleString()} cost delta · ${totalDays > 0 ? "+" : ""}${totalDays} working days`,
    14,
    28,
  );
  doc.setTextColor(0);

  if (variations.length === 0) {
    doc.setFontSize(10);
    doc.text("No variations recorded for this plot.", 14, 40);
  } else {
    autoTable(doc, {
      startY: 36,
      head: [
        ["Ref", "Title", "Requested by", "Status", "£ delta", "Days", "Approved"],
      ],
      body: variations.map((v) => [
        v.ref ?? "—",
        v.title.length > 40 ? `${v.title.slice(0, 40)}…` : v.title,
        v.requestedBy ?? "—",
        v.status,
        v.costDelta != null
          ? `£${Math.round(v.costDelta).toLocaleString()}`
          : "—",
        v.daysDelta != null ? `${v.daysDelta > 0 ? "+" : ""}${v.daysDelta}` : "—",
        v.approvedAt ? format(v.approvedAt, "dd MMM yy") : "—",
      ]),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  return pdfBuffer(doc);
}

// (May 2026 Story-linkage audit) HandoverChecklist per plot — the
// actual model behind the buyer-pack docs (EPC, gas-safe, electrical,
// NHBC, warranty, building-regs etc.). Distinct from PreStartCheck
// which is pre-construction. Renders one row per docType with
// required/signed-off status + who-checked.
export async function renderPlotHandoverChecklistPdf(
  plotName: string,
  items: Array<{
    docType: string;
    required: boolean;
    checkedAt: Date | null;
    notes: string | null;
    checkedBy: { name: string } | null;
    document: { name: string } | null;
  }>,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(`Handover checklist — ${plotName}`, 14, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  const required = items.filter((i) => i.required).length;
  const checked = items.filter((i) => i.required && i.checkedAt).length;
  doc.text(
    `${checked} of ${required} required documents signed off`,
    14,
    28,
  );
  doc.setTextColor(0);

  if (items.length === 0) {
    doc.setFontSize(10);
    doc.text("No handover checklist defined for this plot.", 14, 40);
  } else {
    autoTable(doc, {
      startY: 36,
      head: [["Document", "Required", "Status", "Signed off", "By", "File", "Notes"]],
      body: items.map((i) => [
        i.docType.replace(/_/g, " "),
        i.required ? "Yes" : "No",
        i.checkedAt ? "✓ Signed" : "—",
        i.checkedAt ? format(i.checkedAt, "dd MMM yy") : "—",
        i.checkedBy?.name ?? "—",
        i.document?.name ?? "—",
        i.notes ?? "",
      ]),
      styles: { fontSize: 8, cellPadding: 1.2 },
      columnStyles: { 6: { cellWidth: 40 } },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  return pdfBuffer(doc);
}

// (May 2026 Story-linkage audit) Pre-start check log per plot — pre-
// handover readiness signal (do all the items on the plot checklist
// have a tick + a date + who-checked?).
export async function renderPlotPreStartChecksPdf(
  plotName: string,
  checks: Array<{
    label: string;
    checked: boolean;
    checkedAt: Date | null;
    notes: string | null;
    checkedBy: { name: string } | null;
  }>,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(`Pre-start checks — ${plotName}`, 14, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  const checked = checks.filter((c) => c.checked).length;
  doc.text(
    `${checked} of ${checks.length} items checked`,
    14,
    28,
  );
  doc.setTextColor(0);

  if (checks.length === 0) {
    doc.setFontSize(10);
    doc.text("No pre-start checks recorded.", 14, 40);
  } else {
    autoTable(doc, {
      startY: 36,
      head: [["Item", "Status", "Checked", "By", "Notes"]],
      body: checks.map((c) => [
        c.label.length > 50 ? `${c.label.slice(0, 50)}…` : c.label,
        c.checked ? "✓ Checked" : "—",
        c.checkedAt ? format(c.checkedAt, "dd MMM yy") : "—",
        c.checkedBy?.name ?? "—",
        c.notes ?? "",
      ]),
      styles: { fontSize: 8, cellPadding: 1.2 },
      columnStyles: { 4: { cellWidth: 60 } },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  return pdfBuffer(doc);
}

// Per-plot draw schedule — payment milestones, amounts, status,
// trigger jobs. Useful for the buyer's solicitor + accountant.
export async function renderPlotDrawSchedulePdf(
  plotName: string,
  draws: Array<{
    name: string;
    amount: number;
    status: string;
    dueAt: Date | null;
    paidAt: Date | null;
    notes: string | null;
    triggerJob: { name: string } | null;
  }>,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(`Draw schedule — ${plotName}`, 14, 22);
  doc.setFontSize(9);
  doc.setTextColor(120);
  const total = draws.reduce((s, d) => s + d.amount, 0);
  const paid = draws
    .filter((d) => d.status === "PAID")
    .reduce((s, d) => s + d.amount, 0);
  doc.text(
    `${draws.length} milestone${draws.length === 1 ? "" : "s"} · £${Math.round(total).toLocaleString()} total · £${Math.round(paid).toLocaleString()} paid`,
    14,
    28,
  );
  doc.setTextColor(0);

  if (draws.length === 0) {
    doc.setFontSize(10);
    doc.text("No draw schedule defined.", 14, 40);
  } else {
    autoTable(doc, {
      startY: 36,
      head: [["#", "Milestone", "Amount", "Status", "Due", "Paid", "Trigger"]],
      body: draws.map((d, i) => [
        String(i + 1),
        d.name.length > 40 ? `${d.name.slice(0, 40)}…` : d.name,
        `£${Math.round(d.amount).toLocaleString()}`,
        d.status,
        d.dueAt ? format(d.dueAt, "dd MMM yy") : "—",
        d.paidAt ? format(d.paidAt, "dd MMM yy") : "—",
        d.triggerJob?.name ?? "—",
      ]),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  return pdfBuffer(doc);
}

// ──────────────────────────────────────────────────────────────────────
// 03_Contractor_Analysis/summary.pdf + per-contractor/<Name>.pdf
// ──────────────────────────────────────────────────────────────────────
export async function renderContractorSummaryPdf(
  siteName: string,
  contractors: ContractorPerf[],
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(`Contractor analysis — ${siteName}`, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`${contractors.length} contractors`, 14, 24);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 30,
    head: [
      ["Contractor", "Company", "Assigned", "Done", "On time", "Late", "Days late"],
    ],
    body: contractors.map((c) => [
      c.name,
      c.company ?? "—",
      String(c.jobsAssigned),
      String(c.jobsCompleted),
      String(c.jobsOnTime),
      String(c.jobsLate),
      c.totalDelayDaysAttributed > 0
        ? `${c.totalDelayDaysAttributed}d`
        : "—",
    ]),
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
  });

  return pdfBuffer(doc);
}

interface ContractorJobRow {
  jobName: string;
  plotNumber: string | null;
  status: string;
  plannedEnd: string | null;
  actualEnd: string | null;
  daysLate: number | null;
}

export async function renderContractorDetailPdf(
  siteName: string,
  contractor: {
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    jobsAssigned: number;
    jobsCompleted: number;
    jobsOnTime: number;
    jobsLate: number;
    totalDelayDaysAttributed: number;
    jobs: ContractorJobRow[];
  },
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(contractor.name, 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(
    `${contractor.company ?? "—"} · ${siteName}`,
    14,
    30,
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 40,
    body: [
      ["Email", contractor.email ?? "—"],
      ["Phone", contractor.phone ?? "—"],
      ["Jobs assigned", String(contractor.jobsAssigned)],
      ["Jobs completed", String(contractor.jobsCompleted)],
      ["On time / Late", `${contractor.jobsOnTime} / ${contractor.jobsLate}`],
      ["Total days late", `${contractor.totalDelayDaysAttributed}d`],
    ],
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 50, fontStyle: "bold" } },
  });

  const y =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? 100;
  doc.setFontSize(13);
  doc.text("Jobs", 14, y + 10);
  autoTable(doc, {
    startY: y + 14,
    head: [["Plot", "Job", "Status", "Planned end", "Actual end", "Days late"]],
    body: contractor.jobs.map((j) => [
      j.plotNumber ?? "—",
      j.jobName,
      j.status,
      safeDate(j.plannedEnd),
      safeDate(j.actualEnd),
      j.daysLate == null ? "—" : `${j.daysLate}d`,
    ]),
    styles: { fontSize: 8, cellPadding: 1 },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
  });

  return pdfBuffer(doc);
}

// ──────────────────────────────────────────────────────────────────────
// 04_Supplier_Analysis/summary.pdf + per-supplier/<Name>.pdf
// ──────────────────────────────────────────────────────────────────────
interface SupplierSummaryRow {
  name: string;
  contactName: string | null;
  ordersTotal: number;
  ordersDelivered: number;
  ordersLate: number;
  ordersOutstanding: number;
  totalDaysLate: number;
}

export async function renderSupplierSummaryPdf(
  siteName: string,
  suppliers: SupplierSummaryRow[],
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(`Supplier analysis — ${siteName}`, 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`${suppliers.length} suppliers`, 14, 24);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 30,
    head: [
      [
        "Supplier",
        "Contact",
        "Orders",
        "Delivered",
        "Late",
        "Outstanding",
        "Days late",
      ],
    ],
    body: suppliers.map((s) => [
      s.name,
      s.contactName ?? "—",
      String(s.ordersTotal),
      String(s.ordersDelivered),
      String(s.ordersLate),
      String(s.ordersOutstanding),
      s.totalDaysLate > 0 ? `${s.totalDaysLate}d` : "—",
    ]),
    styles: { fontSize: 9, cellPadding: 1.5 },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
  });

  return pdfBuffer(doc);
}

interface SupplierOrderRow {
  items: string;
  status: string;
  expectedDelivery: string | null;
  actualDelivery: string | null;
  daysLate: number | null;
  plotNumber: string | null;
  jobName: string | null;
}

export async function renderSupplierDetailPdf(
  siteName: string,
  supplier: {
    name: string;
    contactName: string | null;
    contactEmail: string | null;
    ordersTotal: number;
    ordersDelivered: number;
    ordersLate: number;
    ordersOutstanding: number;
    totalDaysLate: number;
    orders: SupplierOrderRow[];
  },
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(16);
  doc.text(supplier.name, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`${supplier.contactName ?? "—"} · ${siteName}`, 14, 24);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 32,
    body: [
      ["Email", supplier.contactEmail ?? "—"],
      ["Orders total", String(supplier.ordersTotal)],
      ["Delivered", String(supplier.ordersDelivered)],
      ["Late", String(supplier.ordersLate)],
      ["Outstanding", String(supplier.ordersOutstanding)],
      ["Total days late", `${supplier.totalDaysLate}d`],
    ],
    styles: { fontSize: 9, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 45, fontStyle: "bold" } },
  });

  const y =
    (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable
      ?.finalY ?? 70;
  doc.setFontSize(13);
  doc.text("Orders", 14, y + 8);
  autoTable(doc, {
    startY: y + 12,
    head: [
      ["Items", "Plot", "Job", "Status", "Expected", "Actual", "Days late"],
    ],
    body: supplier.orders.map((o) => [
      o.items.length > 40 ? `${o.items.slice(0, 40)}…` : o.items,
      o.plotNumber ?? "—",
      o.jobName ?? "—",
      o.status,
      safeDate(o.expectedDelivery),
      safeDate(o.actualDelivery),
      o.daysLate == null ? "—" : `${o.daysLate}d`,
    ]),
    styles: { fontSize: 7, cellPadding: 0.8 },
    headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
  });

  return pdfBuffer(doc);
}

// ──────────────────────────────────────────────────────────────────────
// 00_README.txt — plain-text manifest
// ──────────────────────────────────────────────────────────────────────
export function renderReadmeTxt(
  story: SiteStory,
  triggeredByName: string,
  plotFolderNames: string[],
): Buffer {
  const lines: string[] = [];
  lines.push("=".repeat(72));
  lines.push(`SITE HANDOVER PACK — ${story.site.name}`);
  lines.push("=".repeat(72));
  lines.push("");
  lines.push(`Generated: ${format(new Date(), "dd MMM yyyy HH:mm")}`);
  lines.push(`Triggered by: ${triggeredByName}`);
  lines.push(
    `Site closed: ${safeDate(story.site.completedAt, "still active at generation time")}`,
  );
  lines.push("");
  lines.push("CONTENTS");
  lines.push("-".repeat(72));
  lines.push("01_Site_Overview/");
  lines.push("    site-story.pdf            internal warts-and-all retrospective");
  lines.push("    completion-summary.pdf    high-level handover summary");
  lines.push("");
  lines.push("02_Plots/");
  for (const f of plotFolderNames) {
    lines.push(`    ${f}/`);
    lines.push("        plot-story.pdf");
    lines.push("        snag-log.pdf");
    lines.push("        inspection-log.pdf     (statutory + QA hold-point register, when inspections exist)");
    lines.push("        ncr-log.pdf            (when NCRs recorded)");
    lines.push("        defect-log.pdf         (when warranty defects recorded)");
    lines.push("        variation-log.pdf      (when variations recorded)");
    lines.push("        pre-start-checks.pdf   (when pre-start checks defined)");
    lines.push("        draw-schedule.pdf      (when draw schedule defined)");
    lines.push("        handover-checklist.pdf (EPC / gas-safe / electrical / NHBC etc.)");
    lines.push("        certificates/  drawings/  photos/");
    lines.push("        voice-notes/           (audio clips + _index.txt transcript summary)");
  }
  lines.push("");
  lines.push("03_Contractor_Analysis/");
  lines.push("    summary.pdf");
  lines.push("    per-contractor/<Name>.pdf");
  lines.push("");
  lines.push("04_Supplier_Analysis/");
  lines.push("    summary.pdf");
  lines.push("    per-supplier/<Name>.pdf");
  lines.push("");
  lines.push("05_Cost_Analysis/");
  lines.push("    budget-vs-actual.pdf");
  lines.push("    cash-flow.pdf");
  lines.push("");
  lines.push("06_Reports/");
  lines.push("    delay-report-final.pdf");
  lines.push("");
  lines.push("08_Toolbox_Talks/         (when toolbox talks logged on the site)");
  lines.push("    _register.txt         (every talk: topic, status, notes, attendees)");
  lines.push("    <yyyy-MM-dd>_<topic>/ (subfolder per talk with briefing docs)");
  lines.push("");
  lines.push("=".repeat(72));
  lines.push("");
  return Buffer.from(lines.join("\n"), "utf-8");
}

// ──────────────────────────────────────────────────────────────────────
// 05_Cost_Analysis/budget-vs-actual.pdf
// ──────────────────────────────────────────────────────────────────────

interface BudgetReportShape {
  siteSummary: {
    totalBudgeted: number;
    totalActual: number;
    totalDelivered: number;
    totalCommitted: number;
    totalPending: number;
    totalVariance: number;
    variancePercent: number;
    plotCount: number;
    plotsOverBudget: number;
    plotsUnderBudget: number;
    plotsOnBudget: number;
  };
  topOverruns: Array<{
    plotName: string;
    name: string;
    budgeted: number;
    actual: number;
    variance: number;
    variancePercent: number;
  }>;
  plots: Array<{
    plotName: string;
    plotNumber: string | null;
    budgeted: number;
    actual: number;
    variance: number;
  }>;
}

function fmtCurrency(n: number): string {
  return `£${n.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

export async function renderBudgetReportPdf(
  siteName: string,
  data: BudgetReportShape,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(18);
  doc.text("Budget vs Actual", 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(siteName, 14, 30);
  doc.setFontSize(8);
  doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 36);
  doc.setTextColor(0);

  doc.setFontSize(12);
  doc.text("Site summary", 14, 48);
  autoTable(doc, {
    startY: 52,
    body: [
      ["Total budgeted", fmtCurrency(data.siteSummary.totalBudgeted)],
      ["Total committed", fmtCurrency(data.siteSummary.totalCommitted)],
      ["Total delivered", fmtCurrency(data.siteSummary.totalDelivered)],
      ["Total actual", fmtCurrency(data.siteSummary.totalActual)],
      [
        "Variance (actual − budgeted)",
        `${fmtCurrency(data.siteSummary.totalVariance)} (${data.siteSummary.variancePercent}%)`,
      ],
      ["Plots over budget", String(data.siteSummary.plotsOverBudget)],
      ["Plots under budget", String(data.siteSummary.plotsUnderBudget)],
      ["Plots on budget", String(data.siteSummary.plotsOnBudget)],
    ],
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 80, fontStyle: "bold" } },
  });

  if (data.topOverruns.length > 0) {
    doc.setFontSize(12);
    const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 100;
    doc.text("Top overruns", 14, lastY + 12);
    autoTable(doc, {
      startY: lastY + 16,
      head: [["Plot", "Job", "Budgeted", "Actual", "Variance", "%"]],
      body: data.topOverruns.map((r) => [
        r.plotName,
        r.name,
        fmtCurrency(r.budgeted),
        fmtCurrency(r.actual),
        fmtCurrency(r.variance),
        `${r.variancePercent}%`,
      ]),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  if (data.plots.length > 0) {
    doc.setFontSize(12);
    const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 100;
    doc.text("Per-plot summary", 14, lastY + 12);
    autoTable(doc, {
      startY: lastY + 16,
      head: [["Plot", "Budgeted", "Actual", "Variance"]],
      body: data.plots.map((p) => [
        p.plotNumber ? `Plot ${p.plotNumber}` : p.plotName,
        fmtCurrency(p.budgeted),
        fmtCurrency(p.actual),
        fmtCurrency(p.variance),
      ]),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  return pdfBuffer(doc);
}

// ──────────────────────────────────────────────────────────────────────
// 05_Cost_Analysis/cash-flow.pdf
// ──────────────────────────────────────────────────────────────────────

interface CashFlowShape {
  months: Array<{
    month: string;
    forecast: number;
    actual: number;
    committed: number;
  }>;
  totals: {
    committed: number;
    orderedOpen: number;
    forecast: number;
    actual: number;
  };
}

export async function renderCashFlowPdf(
  siteName: string,
  data: CashFlowShape,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  doc.setFontSize(18);
  doc.text("Cash Flow", 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(siteName, 14, 30);
  doc.setFontSize(8);
  doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 36);
  doc.setTextColor(0);

  doc.setFontSize(12);
  doc.text("Site totals", 14, 48);
  autoTable(doc, {
    startY: 52,
    body: [
      ["Total forecast", fmtCurrency(data.totals.forecast)],
      ["Total committed", fmtCurrency(data.totals.committed)],
      ["Open orders", fmtCurrency(data.totals.orderedOpen)],
      ["Total actual (delivered)", fmtCurrency(data.totals.actual)],
    ],
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 80, fontStyle: "bold" } },
  });

  if (data.months.length > 0) {
    const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 100;
    doc.setFontSize(12);
    doc.text("By month", 14, lastY + 12);
    autoTable(doc, {
      startY: lastY + 16,
      head: [["Month", "Forecast", "Committed", "Actual"]],
      body: data.months.map((m) => [
        m.month,
        fmtCurrency(m.forecast),
        fmtCurrency(m.committed),
        fmtCurrency(m.actual),
      ]),
      styles: { fontSize: 9, cellPadding: 1.5 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  return pdfBuffer(doc);
}

// ──────────────────────────────────────────────────────────────────────
// 06_Reports/delay-report-final.pdf
// ──────────────────────────────────────────────────────────────────────

interface DelayReportShape {
  totalWeatherImpactDays: number;
  totalRainDays: number;
  totalTemperatureDays: number;
  /** Completed-late jobs (actualEnd > endDate). */
  delayedJobs: Array<{
    plotName: string;
    name: string;
    delayDays: number;
    isWeatherExcused: boolean;
    weatherReasonType: string | null;
    delayReason: string | null;
  }>;
  /** (May 2026 audit D-P0-8) Currently-overdue leaf jobs — NOT_STARTED
   *  or IN_PROGRESS past their endDate. Pre-fix the PDF omitted these
   *  entirely so the buyer pack hid the largest delay bucket. */
  currentlyOverdueJobs?: Array<{
    plotName: string;
    name: string;
    status: string;
    daysLate: number;
    isWeatherExcused: boolean;
    contractor: string | null;
    /** (May 2026) Per-job reason from the LatenessEvent. The lateness
     *  cron stamps this when the job first goes overdue; managers can
     *  override via the attribution picker. Used in the PDF row so a
     *  buyer sees WHY each overdue job is overdue, not just THAT it is. */
    reasonCode?: string | null;
  }>;
  overdueDeliveries: Array<{
    items: string;
    supplier: string;
    expectedDate: string | null;
    job: string;
  }>;
  /** (May 2026 audit D-P0-8) Lateness rollup — totals across the site
   *  from the LatenessEvent table. Lets a director see "12 WD lost
   *  this site, mostly weather" at a glance without reading the table. */
  latenessSummary?: {
    openCount: number;
    openDays: number;
    resolvedCount: number;
    resolvedDays: number;
    topReason: string | null;
  };
}

export async function renderDelayReportPdf(
  siteName: string,
  data: DelayReportShape,
): Promise<Buffer> {
  const { jsPDF, autoTable } = await loadJsPdf();
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFontSize(18);
  doc.text("Delay Report", 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(120);
  doc.text(siteName, 14, 30);
  doc.setFontSize(8);
  doc.text(`Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`, 14, 36);
  doc.setTextColor(0);

  // (May 2026 audit D-P0-8) Lead with the LatenessEvent rollup so the
  // reader sees the headline before scrolling tables.
  if (data.latenessSummary) {
    doc.setFontSize(12);
    doc.text("Lateness summary", 14, 48);
    autoTable(doc, {
      startY: 52,
      body: [
        [
          "Open events",
          `${data.latenessSummary.openCount} (${data.latenessSummary.openDays} WD lost)`,
        ],
        [
          "Resolved events",
          `${data.latenessSummary.resolvedCount} (${data.latenessSummary.resolvedDays} WD historic)`,
        ],
        ["Top reason", data.latenessSummary.topReason ?? "—"],
      ],
      styles: { fontSize: 10, cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 60, fontStyle: "bold" } },
    });
  }

  const weatherStartY = data.latenessSummary
    ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12
    : 48;
  doc.setFontSize(12);
  doc.text("Weather impact", 14, weatherStartY);
  autoTable(doc, {
    startY: weatherStartY + 4,
    body: [
      ["Total weather impact days", String(data.totalWeatherImpactDays)],
      ["  · Rain", String(data.totalRainDays)],
      ["  · Temperature", String(data.totalTemperatureDays)],
    ],
    styles: { fontSize: 10, cellPadding: 1.5 },
    columnStyles: { 0: { cellWidth: 100, fontStyle: "bold" } },
  });

  // (May 2026 audit D-P0-8) Currently-overdue jobs are the largest
  // bucket on most sites. Pre-fix the PDF omitted them entirely — so
  // the buyer pack hid the worst-looking data. Render before the
  // completed-late table so it's first in the reader's eye.
  if (data.currentlyOverdueJobs && data.currentlyOverdueJobs.length > 0) {
    const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 80;
    doc.setFontSize(12);
    doc.text(
      `Currently overdue jobs (${data.currentlyOverdueJobs.length})`,
      14,
      lastY + 12,
    );
    autoTable(doc, {
      startY: lastY + 16,
      head: [["Plot", "Job", "Status", "WD overdue", "Contractor", "Reason", "Weather?"]],
      body: data.currentlyOverdueJobs.map((j) => [
        j.plotName,
        j.name,
        j.status === "IN_PROGRESS" ? "In progress" : j.status === "NOT_STARTED" ? "Not started" : j.status,
        String(j.daysLate),
        j.contractor ?? "—",
        // (May 2026) Reason code per overdue job — the LatenessEvent
        // carries it; collapse OTHER to a placeholder so a default-only
        // row reads "needs attribution" rather than as a confident
        // "OTHER" answer.
        j.reasonCode && j.reasonCode !== "OTHER"
          ? j.reasonCode.replace(/_/g, " ")
          : "(needs attribution)",
        j.isWeatherExcused ? "Yes" : "No",
      ]),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [254, 226, 226], textColor: [127, 29, 29] },
    });
  }

  if (data.delayedJobs.length > 0) {
    const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 80;
    doc.setFontSize(12);
    doc.text(`Delayed jobs (${data.delayedJobs.length})`, 14, lastY + 12);
    autoTable(doc, {
      startY: lastY + 16,
      head: [["Plot", "Job", "Days late", "Weather?", "Reason"]],
      body: data.delayedJobs.map((j) => [
        j.plotName,
        j.name,
        String(j.delayDays),
        j.isWeatherExcused ? (j.weatherReasonType || "Yes") : "No",
        j.delayReason || "—",
      ]),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  if (data.overdueDeliveries.length > 0) {
    const lastY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY ?? 80;
    doc.setFontSize(12);
    doc.text(
      `Overdue deliveries (${data.overdueDeliveries.length})`,
      14,
      lastY + 12,
    );
    autoTable(doc, {
      startY: lastY + 16,
      head: [["Items", "Supplier", "Job", "Expected"]],
      body: data.overdueDeliveries.map((d) => [
        d.items,
        d.supplier,
        d.job,
        d.expectedDate ? safeDate(d.expectedDate) : "—",
      ]),
      styles: { fontSize: 8, cellPadding: 1 },
      headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
    });
  }

  return pdfBuffer(doc);
}
