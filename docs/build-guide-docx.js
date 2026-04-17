const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat } = require("docx");
const fs = require("fs");

const NAVY = "1E2761";
const ACCENT = "3B82F6";
const GREY = "64748B";
const GREEN = "10B981";

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 60, bottom: 60, left: 100, right: 100 };

function h1(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 },
    children: [new TextRun({ text, bold: true, size: 32, font: "Arial", color: NAVY })] });
}
function h2(text) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 150 },
    children: [new TextRun({ text, bold: true, size: 26, font: "Arial", color: NAVY })] });
}
function h3(text) {
  return new Paragraph({ spacing: { before: 200, after: 100 },
    children: [new TextRun({ text, bold: true, size: 22, font: "Arial", color: ACCENT })] });
}
function p(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120 },
    children: [new TextRun({ text, size: 22, font: "Calibri", italic: opts.italic, bold: opts.bold, color: opts.color || "333333" })] });
}
function step(num, text) {
  return new Paragraph({ spacing: { after: 80 }, indent: { left: 360 },
    children: [
      new TextRun({ text: num + ". ", bold: true, size: 22, font: "Calibri", color: ACCENT }),
      new TextRun({ text, size: 22, font: "Calibri", color: "333333" }),
    ] });
}
function tip(text) {
  return new Paragraph({ spacing: { before: 100, after: 100 }, indent: { left: 360 },
    border: { left: { style: BorderStyle.SINGLE, size: 6, color: GREEN, space: 8 } },
    children: [
      new TextRun({ text: "TIP: ", bold: true, size: 20, font: "Calibri", color: GREEN }),
      new TextRun({ text, size: 20, font: "Calibri", color: "333333", italic: true }),
    ] });
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
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1200, right: 1200, bottom: 1200, left: 1200 }
      }
    },
    headers: {
      default: new Header({ children: [new Paragraph({
        children: [new TextRun({ text: "Sight Manager \u2014 How to Use Guide", size: 16, font: "Calibri", color: GREY, italic: true })],
        alignment: AlignmentType.RIGHT
      })] })
    },
    footers: {
      default: new Footer({ children: [new Paragraph({
        children: [new TextRun({ text: "Page ", size: 16, color: GREY }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY })],
        alignment: AlignmentType.CENTER
      })] })
    },
    children: [
      // TITLE PAGE
      new Paragraph({ spacing: { before: 2000 }, children: [] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 },
        children: [new TextRun({ text: "SIGHT MANAGER", bold: true, size: 56, font: "Arial Black", color: NAVY })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 },
        children: [new TextRun({ text: "How to Use Guide", size: 32, font: "Calibri", color: ACCENT })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 400 },
        children: [new TextRun({ text: "A practical guide for site managers and administrators", size: 22, font: "Calibri", color: GREY, italic: true })] }),

      new Paragraph({ children: [new PageBreak()] }),

      // GETTING STARTED
      h1("Getting Started"),
      p("Sight Manager is accessed via your web browser at sight-manager.vercel.app. It works on desktop, tablet, and mobile. Log in with your email and password."),

      h2("Your First Morning"),
      p("When you arrive on site, your first stop should always be the Daily Brief. Here is how to get there:"),
      step("1", "Log in and select your site from the site selector dropdown"),
      step("2", "Click Daily Brief in the left sidebar"),
      step("3", "Review the stats bar at the top \u2014 it shows everything needing attention today"),
      step("4", "Work through each section from top to bottom"),
      tip("The Daily Brief is your command centre. Everything flows from here \u2014 orders, deliveries, contractor confirmations, inactive plots."),

      new Paragraph({ children: [new PageBreak()] }),

      // STARTING A JOB
      h1("Starting a Job"),
      p("You can start a job from multiple places: the Walkthrough, the Daily Brief, the Programme, or the Plot Detail page. No matter where you click Start, the same flow runs:"),

      h2("Step 1: Order Check"),
      p("If the job has materials that haven't been ordered or delivered, you will see a warning with 3 options:"),
      h3("Option A: Start today \u2014 resolve orders now"),
      p("You will step through each supplier and either Mark Sent, Send Order (opens an email), or mark as On Site. All orders must be resolved before continuing."),
      h3("Option B: Pick a start date"),
      p("Choose a future date. The programme will shift to match \u2014 all subsequent jobs and orders cascade automatically."),
      h3("Option C: Start anyway"),
      p("Orders stay as they are. They will appear on your Daily Brief under Orders to Place so you can handle them when ready."),

      h2("Step 2: Schedule Impact"),
      p("If the job is starting earlier or later than planned, you will see a schedule impact dialog:"),
      h3("Starting Early"),
      p("Pull Programme Forward \u2014 moves this job and all downstream jobs earlier."),
      p("Expand This Job \u2014 starts now but keeps the original end date. Programme stays put."),
      p("Pull to Next Event \u2014 shifts to align with the nearest upcoming delivery or job start."),
      h3("Starting Late"),
      p("Push Programme \u2014 shifts everything downstream later."),
      p("Compress Duration \u2014 starts today, shortens the job to fit the original end date."),
      tip("All shifts use working days (Monday to Friday). Weekends are automatically skipped. The delay input box explicitly says \"working days (Mon-Fri)\"."),

      new Paragraph({ children: [new PageBreak()] }),

      // COMPLETING AND SIGNING OFF
      h1("Completing and Signing Off a Job"),
      p("Complete and Sign Off are two separate steps:"),

      h2("Completing a Job"),
      step("1", "Click Complete on the job (from walkthrough, programme, or plot detail)"),
      step("2", "The Post-Completion Dialog appears showing how far ahead or behind you are"),
      step("3", "If the next job has undelivered orders, resolve them first"),
      step("4", "If a contractor is assigned and you are ahead of schedule, confirm their availability"),
      step("5", "Choose what happens next: Start today, Start Monday, Push forward, or Leave for now"),
      tip("If you are not ready to confirm the contractor, click \"Confirm later \u2014 add to Daily Brief\". The plot goes inactive and appears in the Contractor Confirmations section."),

      h2("Signing Off a Job"),
      step("1", "Click Sign Off Job (red button in walkthrough or programme)"),
      step("2", "Add optional sign-off notes and photos"),
      step("3", "Click Confirm Sign Off"),
      p("Sign-off is the quality approval. When you sign off, any ORDERED materials for that job are automatically marked as DELIVERED (materials confirmed used on site)."),

      new Paragraph({ children: [new PageBreak()] }),

      // MANAGING ORDERS
      h1("Managing Orders"),
      p("The Daily Brief is your hub for the full order lifecycle:"),

      h2("Orders to Place"),
      p("These are orders that should have been sent to suppliers. For each one you can:"),
      step("1", "Send Order \u2014 opens a pre-formatted email to the supplier with all items and quantities"),
      step("2", "Mark Sent \u2014 if you have already placed the order by phone or another method"),
      tip("If you chose \"Start anyway\" when starting a job, the orders will appear here. Send them when you are ready."),

      h2("Upcoming Deliveries"),
      p("Orders that have been sent and are awaiting delivery. For each one:"),
      step("1", "Check the expected delivery date \u2014 use the date picker to change it if the supplier gave a different date"),
      step("2", "When materials arrive, click Received to mark them as delivered"),
      tip("Changing the delivery date here updates the order record. The programme dots on the Gantt will update to match."),

      new Paragraph({ children: [new PageBreak()] }),

      // USING THE PROGRAMME
      h1("Using the Programme (Gantt Chart)"),

      h2("View Modes"),
      p("Jobs \u2014 shows parent stage bars (e.g. Groundworks) that aggregate from their sub-jobs. Click to expand."),
      p("Sub-Jobs \u2014 shows every individual task bar (e.g. Foundations, DPC, Oversite, Drainage)."),
      p("Week / Day \u2014 toggle between weekly and daily column views. Day view shows Mon-Fri with day names and greyed weekends."),

      h2("Overlay Mode"),
      p("Current \u2014 shows where jobs are now after any shifts."),
      p("Original \u2014 shows where jobs were originally planned."),
      p("Overlay \u2014 shows both, with ghost bars (dashed lines) showing the original plan behind the current bars."),

      h2("Delaying a Job"),
      step("1", "Click on a job bar to open its detail panel"),
      step("2", "Click Delay / Push Job"),
      step("3", "Enter the number of working days to delay"),
      step("4", "Select a reason (Rain, Temperature, or Other)"),
      step("5", "Click Delay \u2014 the job and all downstream jobs shift by that many working days"),
      tip("The input box allows you to clear it and type freely. The label says \"working days (Mon-Fri)\" so you know weekends are excluded."),

      h2("Bulk Actions"),
      step("1", "Click Select in the toolbar"),
      step("2", "Tick the plots you want to action"),
      step("3", "Use the floating bar at the bottom: Start All, Delay Jobs, or Cancel"),
      p("Start All triggers the full pre-start flow for each selected plot's next job. You will see order and schedule dialogs for each one."),

      new Paragraph({ children: [new PageBreak()] }),

      // SITE WALKTHROUGH
      h1("Site Walkthrough"),
      p("The Walkthrough is designed for site managers walking the site plot by plot."),
      step("1", "Navigate to your site and click Site Walkthrough in the sidebar"),
      step("2", "You will see the first plot with its current job and next job"),
      step("3", "Swipe left/right or use the arrows to move between plots"),
      step("4", "For each plot you can: Start the next sub-job, Sign Off the current job, Add photos/notes/snags, or Delay"),
      p("The walkthrough button always shows the sub-job name (e.g. \"Start Foundations\") not a generic \"Start Job\"."),
      tip("Every action from the walkthrough goes through the same centralised flow as everywhere else \u2014 order checks, predecessor checks, cascade dialogs."),

      new Paragraph({ children: [new PageBreak()] }),

      // INACTIVE PLOTS
      h1("Inactive Plots"),
      p("An inactive plot is one with no jobs currently in progress. The Daily Brief shows these in the Inactive Plots section with a label explaining why:"),
      p("Not Started \u2014 no work has begun yet on this plot."),
      p("Deferred \u2014 you chose \"Leave for now\" after completing a job. Restart when ready."),
      p("Awaiting contractor \u2014 you chose \"Confirm later\" on the contractor step. Contact the contractor and confirm from the Daily Brief."),
      p("Awaiting materials \u2014 the next job has undelivered orders. Materials need to arrive first."),
      p("Next: [job name] \u2014 ready to start the next job. Click the Start button to begin."),
      tip("Each inactive plot has a Start button that goes through the full pre-start flow. You do not need to navigate to the walkthrough or plot detail \u2014 you can start directly from the Daily Brief."),

      // CONTRACTOR CONFIRMATIONS
      h1("Contractor Confirmations"),
      p("When you sign off a job and the next job has a contractor assigned, and you are ahead of schedule, you will be asked to confirm the contractor is available."),
      p("If you are not ready to confirm, click \"Confirm later \u2014 add to Daily Brief\". This creates an entry in the Awaiting Contractor Confirmation section of the Daily Brief."),
      p("From the Daily Brief, you can:"),
      step("1", "Call \u2014 tap to phone the contractor directly"),
      step("2", "Email \u2014 open an email to the contractor"),
      step("3", "Confirmed \u2014 Start Job \u2014 the contractor is available, start the job (full pre-start flow runs)"),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("C:\\Users\\keith\\OneDrive\\Desktop\\sight-manager\\docs\\Sight-Manager-How-To-Guide.docx", buffer);
  console.log("Guide DOCX created successfully");
});
