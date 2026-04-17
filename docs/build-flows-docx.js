const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat } = require("docx");
const fs = require("fs");

const NAVY = "1E2761";
const ACCENT = "3B82F6";
const LIGHT = "EFF6FF";
const GREEN = "10B981";
const AMBER = "F59E0B";
const RED = "EF4444";
const GREY = "64748B";

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const headerShading = { fill: NAVY, type: ShadingType.CLEAR };
const altShading = { fill: "F8FAFC", type: ShadingType.CLEAR };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

function headerCell(text, width) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: headerShading, margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 20, font: "Calibri" })] })]
  });
}

function cell(text, width, opts = {}) {
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: opts.shade ? altShading : undefined,
    margins: cellMargins,
    children: [new Paragraph({ children: [new TextRun({ text, size: 20, font: "Calibri", bold: opts.bold, color: opts.color })] })]
  });
}

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32, font: "Arial", color: NAVY })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true, size: 26, font: "Arial", color: NAVY })] });
}
function p(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120 },
    children: [new TextRun({ text, size: 22, font: "Calibri", italic: opts.italic, bold: opts.bold, color: opts.color || "333333" })] });
}
function flowStep(text) {
  return new Paragraph({ spacing: { after: 80 }, indent: { left: 360 },
    children: [new TextRun({ text: "→  " + text, size: 22, font: "Calibri", color: "333333" })] });
}

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Calibri", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 400, after: 200 } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: NAVY },
        paragraph: { spacing: { before: 300, after: 150 } } },
    ]
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }]
    }]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 }
      }
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        children: [new TextRun({ text: "Sight Manager \u2014 System Flow Schematic", size: 16, font: "Calibri", color: GREY, italic: true })],
        alignment: AlignmentType.RIGHT
      })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        children: [new TextRun({ text: "Page ", size: 16, font: "Calibri", color: GREY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, font: "Calibri", color: GREY })],
        alignment: AlignmentType.CENTER
      })] })
    },
    children: [
      // TITLE PAGE
      new Paragraph({ spacing: { before: 2000 }, children: [] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
        children: [new TextRun({ text: "SIGHT MANAGER", bold: true, size: 56, font: "Arial Black", color: NAVY })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
        children: [new TextRun({ text: "System Flow Schematic", size: 32, font: "Calibri", color: ACCENT })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
        children: [new TextRun({ text: "Technical reference for how every flow works end-to-end", size: 22, font: "Calibri", color: GREY, italic: true })] }),
      new Paragraph({ alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "April 2026  \u2014  Confidential", size: 18, font: "Calibri", color: GREY })] }),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION 1: JOB LIFECYCLE
      h1("1. Job Lifecycle Flow"),
      p("Every job follows this exact lifecycle. Each transition has specific side effects that are enforced by the server."),
      new Paragraph({ spacing: { before: 200, after: 200 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "NOT_STARTED  \u2192  IN_PROGRESS  \u2192  COMPLETED  \u2192  SIGNED OFF", bold: true, size: 24, font: "Consolas", color: NAVY })] }),

      h2("Transition Side Effects"),
      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [1600, 1600, 3320, 3320],
        rows: [
          new TableRow({ children: [headerCell("Action", 1600), headerCell("New Status", 1600), headerCell("Fields Set", 3320), headerCell("Order Effects", 3320)] }),
          new TableRow({ children: [cell("start", 1600, { bold: true }), cell("IN_PROGRESS", 1600), cell("actualStartDate, buildCompletePercent", 3320), cell("PENDING \u2192 ORDERED (unless skip)", 3320)] }),
          new TableRow({ children: [cell("complete", 1600, { bold: true, shade: true }), cell("COMPLETED", 1600, { shade: true }), cell("actualEndDate, buildCompletePercent", 3320, { shade: true }), cell("No order changes", 3320, { shade: true })] }),
          new TableRow({ children: [cell("signoff", 1600, { bold: true }), cell("stays COMPLETED", 1600), cell("signedOffAt, signedOffById", 3320), cell("ORDERED \u2192 DELIVERED (auto)", 3320)] }),
        ]
      }),
      p("Complete and Sign-off are SEPARATE actions. A job can be completed but not yet signed off. Sign-off is the explicit approval step that confirms materials have been used.", { italic: true }),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION 2: PRE-START FLOW
      h1("2. Pre-Start Flow (Centralised Hook)"),
      p("EVERY start button on EVERY screen goes through this identical flow. The useJobAction hook is the single entry point \u2014 no exceptions."),

      h2("Entry Points"),
      p("Walkthrough, Daily Brief (Late Starts, Inactive Plots), Plot Detail, Job Detail, Programme Panel (parent + child), Plot Todo List, Contractor Day Sheets, Programme Bulk Start All"),

      h2("Flow Steps"),
      flowStep("1. User clicks Start (from ANY screen) \u2192 triggerJobAction called"),
      flowStep("2. If orders not provided \u2192 auto-fetch from /api/jobs/{id}"),
      flowStep("3. Check predecessors (by DATE, not sortOrder)"),
      flowStep("   \u2514 If incomplete predecessor exists \u2192 show warning dialog"),
      flowStep("4. Check undelivered orders \u2192 if any exist \u2192 show 3-option dialog:"),
      flowStep("   \u251C Option A: Resolve orders now \u2192 per-supplier resolution (Mark Sent / Send Order / On Site)"),
      flowStep("   \u251C Option B: Pick a start date \u2192 date picker \u2192 cascade to match"),
      flowStep("   \u2514 Option C: Start anyway \u2192 skipOrderProgression flag \u2192 orders stay PENDING"),
      flowStep("5. After resolution: if orders ORDERED (not DELIVERED) \u2192 target = delivery date, not today"),
      flowStep("6. Check early/late start:"),
      flowStep("   \u251C Early: Pull Programme Forward / Expand This Job / Pull to Next Event"),
      flowStep("   \u251C Late: Push Programme / Compress Duration / Backdate"),
      flowStep("   \u2514 On time: start immediately"),
      flowStep("7. Cascade runs (if pull forward or push back chosen)"),
      flowStep("8. Job starts \u2192 all side effects execute"),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION 3: ORDER LIFECYCLE
      h1("3. Order Lifecycle"),
      new Paragraph({ spacing: { before: 100, after: 200 }, alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: "PENDING  \u2192  ORDERED  \u2192  DELIVERED   (+ CANCELLED at any point)", bold: true, size: 24, font: "Consolas", color: NAVY })] }),

      h2("Status Triggers"),
      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [2800, 1400, 1640, 4000],
        rows: [
          new TableRow({ children: [headerCell("Trigger", 2800), headerCell("From", 1400), headerCell("To", 1640), headerCell("Notes", 4000)] }),
          new TableRow({ children: [cell("Job Start (normal)", 2800), cell("PENDING", 1400), cell("ORDERED", 1640), cell("Auto unless skipOrderProgression", 4000)] }),
          new TableRow({ children: [cell("Job Start (\"start anyway\")", 2800, { shade: true }), cell("PENDING", 1400, { shade: true }), cell("stays PENDING", 1640, { shade: true }), cell("User handles manually via Daily Brief", 4000, { shade: true })] }),
          new TableRow({ children: [cell("Job Complete", 2800), cell("\u2014", 1400), cell("\u2014", 1640), cell("No order changes", 4000)] }),
          new TableRow({ children: [cell("Job Sign Off", 2800, { shade: true }), cell("ORDERED", 1400, { shade: true }), cell("DELIVERED", 1640, { shade: true }), cell("Auto-delivered on sign-off", 4000, { shade: true })] }),
          new TableRow({ children: [cell("User \"Send Order\"", 2800), cell("PENDING", 1400), cell("ORDERED", 1640), cell("Opens ASAP email + marks ORDERED", 4000)] }),
          new TableRow({ children: [cell("User \"On Site\"", 2800, { shade: true }), cell("Any", 1400, { shade: true }), cell("DELIVERED", 1640, { shade: true }), cell("Manual confirmation", 4000, { shade: true })] }),
          new TableRow({ children: [cell("Cascade", 2800), cell("\u2014", 1400), cell("\u2014", 1640), cell("Only dates shift, status unchanged", 4000)] }),
        ]
      }),

      h2("Daily Brief Order Pipeline"),
      flowStep("1. Orders to Place (PENDING, due today) \u2192 Send Order email / Mark Sent"),
      flowStep("2. Upcoming Orders (PENDING, future) \u2192 Same actions"),
      flowStep("3. Upcoming Deliveries (ORDERED) \u2192 Change Date / Mark Delivered"),
      flowStep("4. Deliveries Today (ORDERED, due today) \u2192 Mark Delivered"),
      flowStep("5. Overdue Deliveries (ORDERED, past due) \u2192 Mark Delivered"),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION 4: CASCADE
      h1("4. Cascade System"),
      p("ALL schedule shifts use working days (Mon-Fri). Weekends are automatically skipped. Job durations stay as calendar days.", { bold: true }),

      h2("Pull Forward (Starting Early)"),
      flowStep("Shift triggering job startDate AND endDate by working days"),
      flowStep("Shift ALL jobs on same plot starting at or after triggering job"),
      flowStep("Shift ALL non-cancelled order dates on affected jobs"),
      flowStep("Cap all dates at today \u2014 never into past, snap to working day"),
      flowStep("Preserve originalStartDate/originalEndDate on FIRST shift only"),
      flowStep("Orders landing on weekends snap to Friday"),

      h2("Push Back (Delay)"),
      flowStep("Shift triggering job endDate (and startDate if NOT_STARTED)"),
      flowStep("Shift ALL subsequent jobs (higher sortOrder only)"),
      flowStep("Delay input shows \"working days (Mon-Fri)\" explicitly"),
      flowStep("Same order shifting and original preservation rules"),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION 5: POST-COMPLETION
      h1("5. Post-Completion Flow"),
      p("Triggered after every job complete or sign-off. Guides the user through what happens next."),

      h2("Steps"),
      flowStep("1. Summary: job name, days ahead/behind, next job preview"),
      flowStep("2. Order Resolution (if next job has undelivered orders):"),
      flowStep("   Per supplier: Confirmed on site / Email supplier / Place order now"),
      flowStep("3. Contractor Check (if contractor assigned AND ahead of schedule):"),
      flowStep("   \u251C Email contractor to request early start"),
      flowStep("   \u251C Contractor confirmed \u2014 pull programme forward"),
      flowStep("   \u251C Contractor confirmed \u2014 keep programme as is"),
      flowStep("   \u2514 Confirm later \u2014 add to Daily Brief (plot goes inactive)"),
      flowStep("4. Decision:"),
      flowStep("   \u251C Start today & pull forward \u2192 cascade entire programme"),
      flowStep("   \u251C Start next Monday \u2192 schedule for Monday"),
      flowStep("   \u251C Push forward by X weeks \u2192 delay programme"),
      flowStep("   \u2514 Leave for now \u2192 plot goes inactive (\"Deferred\")"),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION 6: INACTIVE PLOTS
      h1("6. Inactive Plots"),
      p("Plot with NO IN_PROGRESS jobs AND NOT all completed."),

      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [2200, 3640, 2400, 1600],
        rows: [
          new TableRow({ children: [headerCell("Type", 2200), headerCell("Condition", 3640), headerCell("Label", 2400), headerCell("Badge", 1600)] }),
          new TableRow({ children: [cell("awaiting_contractor", 2200, { bold: true }), cell("awaitingContractorConfirmation = true", 3640), cell("Awaiting contractor for [job]", 2400), cell("Orange", 1600, { color: "EA580C" })] }),
          new TableRow({ children: [cell("deferred", 2200, { bold: true, shade: true }), cell("awaitingRestart = true", 3640, { shade: true }), cell("Deferred", 2400, { shade: true }), cell("Amber", 1600, { shade: true, color: "D97706" })] }),
          new TableRow({ children: [cell("awaiting_materials", 2200, { bold: true }), cell("Completed jobs + undelivered orders", 3640), cell("Awaiting materials for [job]", 2400), cell("Red", 1600, { color: "DC2626" })] }),
          new TableRow({ children: [cell("awaiting_next", 2200, { bold: true, shade: true }), cell("Completed jobs, no material issues", 3640, { shade: true }), cell("Next: [job name]", 2400, { shade: true }), cell("Blue", 1600, { shade: true, color: "2563EB" })] }),
          new TableRow({ children: [cell("not_started", 2200, { bold: true }), cell("No jobs completed", 3640), cell("Not started", 2400), cell("Grey", 1600, { color: "6B7280" })] }),
        ]
      }),
      p("All start buttons go through full triggerJobAction flow. Both awaitingRestart and awaitingContractorConfirmation cleared on job start.", { italic: true }),

      new Paragraph({ children: [new PageBreak()] }),

      // SECTION 7: JOBS AS CONTAINERS
      h1("7. Jobs as Containers"),
      flowStep("Parent jobs: parentStage = null, have stageCode (e.g. \"Groundworks\")"),
      flowStep("Sub-jobs: parentStage = parent's stageCode (e.g. \"Foundations\", \"DPC\")"),
      flowStep("You never \"start a job\" \u2014 you start a sub-job"),
      flowStep("Programme Jobs view: synthetic parent bars aggregate from children"),
      flowStep("Programme Sub-Jobs view: individual sub-job bars"),
      flowStep("Parent bar spans min(child.startDate) \u2192 max(child.endDate)"),
      flowStep("Walkthrough shows first actionable sub-job, button says \"Start [sub-job name]\""),

      // SECTION 8: DATA-TO-VIEW MAP
      h1("8. Data-to-View Map"),
      p("When changing any entity, check ALL views that consume it."),

      h2("Order Status Consumers"),
      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [3200, 6640],
        rows: [
          new TableRow({ children: [headerCell("View", 3200), headerCell("What It Uses", 6640)] }),
          new TableRow({ children: [cell("Cash Flow Report", 3200, { bold: true }), cell("ORDERED = committed spend, DELIVERED = actual spend", 6640)] }),
          new TableRow({ children: [cell("Budget Report", 3200, { bold: true, shade: true }), cell("DELIVERED = delivered costs vs budget", 6640, { shade: true })] }),
          new TableRow({ children: [cell("Supplier Performance", 3200, { bold: true }), cell("Only DELIVERED orders counted for on-time rate", 6640)] }),
          new TableRow({ children: [cell("Daily Brief", 3200, { bold: true, shade: true }), cell("Orders to Place, Awaiting Delivery, Overdue, Due Today", 6640, { shade: true })] }),
          new TableRow({ children: [cell("Programme/Gantt", 3200, { bold: true }), cell("Order dots by status on calendar dates", 6640)] }),
          new TableRow({ children: [cell("Contractor Share Page", 3200, { bold: true, shade: true }), cell("On Site = DELIVERED orders", 6640, { shade: true })] }),
        ]
      }),

      h2("Job Status Consumers"),
      new Table({
        width: { size: 9840, type: WidthType.DXA },
        columnWidths: [3200, 6640],
        rows: [
          new TableRow({ children: [headerCell("View", 3200), headerCell("What It Uses", 6640)] }),
          new TableRow({ children: [cell("Programme/Gantt", 3200, { bold: true }), cell("Bar colours, completion %, parent aggregation", 6640)] }),
          new TableRow({ children: [cell("Walkthrough", 3200, { bold: true, shade: true }), cell("Current job, next job, schedule badge", 6640, { shade: true })] }),
          new TableRow({ children: [cell("Daily Brief", 3200, { bold: true }), cell("Starting, finishing, late, overdue, inactive plots", 6640)] }),
          new TableRow({ children: [cell("Plot Detail", 3200, { bold: true, shade: true }), cell("Overview stats, gantt, jobs list, progress", 6640, { shade: true })] }),
          new TableRow({ children: [cell("Heatmap", 3200, { bold: true }), cell("buildCompletePercent, RAG status", 6640)] }),
          new TableRow({ children: [cell("Analytics", 3200, { bold: true, shade: true }), cell("Job status breakdown, durations, performance", 6640, { shade: true })] }),
        ]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("C:\\Users\\keith\\OneDrive\\Desktop\\sight-manager\\docs\\Sight-Manager-System-Flows.docx", buffer);
  console.log("Flows DOCX created successfully");
});
