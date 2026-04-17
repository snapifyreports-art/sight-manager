const PptxGenJS = require("pptxgenjs");
const pptx = new PptxGenJS();

// Theme
const NAVY = "1E2761";
const ICE = "CADCFC";
const WHITE = "FFFFFF";
const DARK = "0F1729";
const ACCENT = "3B82F6";
const GREEN = "10B981";
const AMBER = "F59E0B";
const GREY = "64748B";
const LIGHT_BG = "F8FAFC";

pptx.layout = "LAYOUT_WIDE";
pptx.author = "Sight Manager";
pptx.subject = "Platform Overview";

// ─── SLIDE 1: TITLE ───
{
  const s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addText("SIGHT MANAGER", { x: 1.2, y: 1.8, w: 10, h: 1.2, fontSize: 48, fontFace: "Arial Black", color: WHITE, bold: true });
  s.addText("Construction Site Management Platform", { x: 1.2, y: 3.0, w: 10, h: 0.6, fontSize: 22, fontFace: "Calibri", color: ICE });
  s.addShape(pptx.ShapeType.rect, { x: 1.2, y: 3.8, w: 2, h: 0.05, fill: { color: ACCENT } });
  s.addText("Every plot. Every job. Every order. One system.", { x: 1.2, y: 4.2, w: 10, h: 0.5, fontSize: 16, fontFace: "Calibri", color: ICE, italic: true });
}

// ─── SLIDE 2: THE PROBLEM ───
{
  const s = pptx.addSlide();
  s.background = { color: LIGHT_BG };
  s.addText("The Problem", { x: 1.2, y: 0.6, w: 10, h: 0.8, fontSize: 36, fontFace: "Arial Black", color: NAVY, bold: true });
  const problems = [
    ["Spreadsheet chaos", "Managing 26+ plots across multiple spreadsheets with no single view"],
    ["Order blind spots", "510+ material orders across 6 suppliers — easy to miss a delivery"],
    ["Contractor coordination", "Phone calls and texts to chase availability, no audit trail"],
    ["Programme drift", "No visibility of schedule deviation until it's too late"],
    ["Morning scramble", "Site managers arrive not knowing what needs attention today"],
  ];
  problems.forEach((p, i) => {
    const y = 1.8 + i * 0.85;
    s.addShape(pptx.ShapeType.rect, { x: 1.2, y, w: 0.4, h: 0.4, fill: { color: "FEE2E2" }, rectRadius: 0.05 });
    s.addText("!", { x: 1.2, y, w: 0.4, h: 0.4, fontSize: 18, fontFace: "Arial", color: "DC2626", bold: true, align: "center", valign: "middle" });
    s.addText(p[0], { x: 1.8, y: y - 0.05, w: 4, h: 0.3, fontSize: 15, fontFace: "Calibri", color: DARK, bold: true });
    s.addText(p[1], { x: 1.8, y: y + 0.2, w: 9, h: 0.3, fontSize: 12, fontFace: "Calibri", color: GREY });
  });
}

// ─── SLIDE 3: THE SOLUTION ───
{
  const s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addText("The Solution", { x: 1.2, y: 0.6, w: 10, h: 0.8, fontSize: 36, fontFace: "Arial Black", color: WHITE, bold: true });
  const features = [
    ["Programme", "Interactive Gantt with jobs, sub-jobs, overlay tracking, and automatic cascade"],
    ["Order Pipeline", "Full lifecycle: Place → Confirm Delivery → Received — all from the Daily Brief"],
    ["Working Days", "All scheduling uses Mon-Fri — weekends automatically skipped everywhere"],
    ["Daily Brief", "Single morning hub — every action item, every alert, one screen"],
    ["Walkthrough", "Mobile-first plot-by-plot mode for site managers on the ground"],
  ];
  features.forEach((f, i) => {
    const y = 1.8 + i * 0.85;
    s.addShape(pptx.ShapeType.rect, { x: 1.2, y, w: 10.5, h: 0.7, fill: { color: "243178" }, rectRadius: 0.08 });
    s.addShape(pptx.ShapeType.rect, { x: 1.4, y: y + 0.12, w: 0.45, h: 0.45, fill: { color: ACCENT }, rectRadius: 0.22 });
    s.addText(String(i + 1), { x: 1.4, y: y + 0.12, w: 0.45, h: 0.45, fontSize: 16, fontFace: "Arial", color: WHITE, bold: true, align: "center", valign: "middle" });
    s.addText(f[0], { x: 2.1, y: y + 0.05, w: 3, h: 0.3, fontSize: 15, fontFace: "Calibri", color: WHITE, bold: true });
    s.addText(f[1], { x: 2.1, y: y + 0.3, w: 9, h: 0.3, fontSize: 12, fontFace: "Calibri", color: ICE });
  });
}

// ─── SLIDE 4: DAILY BRIEF ───
{
  const s = pptx.addSlide();
  s.background = { color: LIGHT_BG };
  s.addText("Daily Brief — Your Morning Hub", { x: 1.2, y: 0.5, w: 10, h: 0.8, fontSize: 32, fontFace: "Arial Black", color: NAVY, bold: true });
  s.addText("One screen. Everything needing attention. Updated in real-time.", { x: 1.2, y: 1.2, w: 10, h: 0.4, fontSize: 14, fontFace: "Calibri", color: GREY, italic: true });

  const cards = [
    ["Starting Today", "6", GREEN], ["Overdue", "0", GREEN], ["Orders to Place", "12", AMBER],
    ["Awaiting Delivery", "8", ACCENT], ["Sign Offs", "3", AMBER], ["Inactive Plots", "21", AMBER],
    ["Contractor Confirms", "1", AMBER], ["Weather Alerts", "Rain", "DC2626"],
  ];
  cards.forEach((c, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 1.2 + col * 2.7;
    const y = 1.9 + row * 1.3;
    s.addShape(pptx.ShapeType.rect, { x, y, w: 2.4, h: 1.0, fill: { color: WHITE }, shadow: { type: "outer", blur: 4, offset: 2, color: "D0D0D0" }, rectRadius: 0.08 });
    s.addText(c[1], { x, y: y + 0.05, w: 2.4, h: 0.5, fontSize: 28, fontFace: "Arial Black", color: c[2], align: "center", valign: "middle", bold: true });
    s.addText(c[0], { x, y: y + 0.55, w: 2.4, h: 0.35, fontSize: 11, fontFace: "Calibri", color: GREY, align: "center" });
  });

  s.addShape(pptx.ShapeType.rect, { x: 1.2, y: 4.7, w: 10.5, h: 0.7, fill: { color: "EFF6FF" }, rectRadius: 0.08 });
  s.addText("Budget: £804,739  |  Delivered: £13,897  |  Variance: £0 (0%)  |  ON BUDGET", { x: 1.5, y: 4.75, w: 10, h: 0.6, fontSize: 13, fontFace: "Calibri", color: NAVY, align: "center" });
}

// ─── SLIDE 5: PROGRAMME MANAGEMENT ───
{
  const s = pptx.addSlide();
  s.background = { color: LIGHT_BG };
  s.addText("Programme Management", { x: 1.2, y: 0.5, w: 10, h: 0.8, fontSize: 32, fontFace: "Arial Black", color: NAVY, bold: true });

  const left = [
    "Jobs view — parent containers aggregate sub-jobs",
    "Sub-Jobs view — individual task bars",
    "Current / Original / Overlay mode",
    "Day view shows Mon-Fri names, weekends greyed",
    "Order delivery dots on calendar dates",
    "Working days — weekends auto-skipped",
  ];
  left.forEach((t, i) => {
    s.addShape(pptx.ShapeType.rect, { x: 1.4, y: 1.7 + i * 0.55, w: 0.2, h: 0.2, fill: { color: ACCENT }, rectRadius: 0.1 });
    s.addText(t, { x: 1.8, y: 1.65 + i * 0.55, w: 5, h: 0.3, fontSize: 13, fontFace: "Calibri", color: DARK });
  });

  // Cascade box
  s.addShape(pptx.ShapeType.rect, { x: 7.2, y: 1.5, w: 5, h: 3.5, fill: { color: WHITE }, shadow: { type: "outer", blur: 4, offset: 2, color: "D0D0D0" }, rectRadius: 0.1 });
  s.addText("Cascade System", { x: 7.5, y: 1.6, w: 4.5, h: 0.4, fontSize: 16, fontFace: "Calibri", color: NAVY, bold: true });
  const cascade = [
    "Pull Forward → shift all jobs earlier",
    "Push Back → delay all subsequent jobs",
    "Dates capped at today — never into past",
    "Original dates preserved for overlay",
    "Orders shift with jobs automatically",
    "All shifts use working days (Mon-Fri)",
  ];
  cascade.forEach((t, i) => {
    s.addText("→  " + t, { x: 7.5, y: 2.2 + i * 0.42, w: 4.5, h: 0.35, fontSize: 11, fontFace: "Calibri", color: DARK });
  });
}

// ─── SLIDE 6: SMART JOB START FLOW ───
{
  const s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addText("Smart Job Start Flow", { x: 1.2, y: 0.5, w: 10, h: 0.8, fontSize: 32, fontFace: "Arial Black", color: WHITE, bold: true });
  s.addText("Every start button — on every screen — goes through this identical flow:", { x: 1.2, y: 1.15, w: 10, h: 0.4, fontSize: 14, fontFace: "Calibri", color: ICE, italic: true });

  const steps = [
    ["1", "Predecessor Check", "By date, not sort order — blocks if incomplete"],
    ["2", "Order Warning", "3 options: Resolve Now / Pick a Date / Start Anyway"],
    ["3", "Order Resolution", "Mark Sent, Send Order (email), or On Site per supplier"],
    ["4", "Early/Late Start", "Pull Forward / Expand / Pull to Next Event"],
    ["5", "Contractor Check", "Confirm availability or defer to Daily Brief"],
    ["6", "Start Job", "Job begins — programme updated automatically"],
  ];
  steps.forEach((st, i) => {
    const y = 1.7 + i * 0.65;
    s.addShape(pptx.ShapeType.rect, { x: 1.2, y, w: 0.45, h: 0.45, fill: { color: ACCENT }, rectRadius: 0.22 });
    s.addText(st[0], { x: 1.2, y, w: 0.45, h: 0.45, fontSize: 16, fontFace: "Arial", color: WHITE, bold: true, align: "center", valign: "middle" });
    s.addText(st[1], { x: 1.9, y: y - 0.02, w: 4, h: 0.25, fontSize: 14, fontFace: "Calibri", color: WHITE, bold: true });
    s.addText(st[2], { x: 1.9, y: y + 0.22, w: 9, h: 0.25, fontSize: 11, fontFace: "Calibri", color: ICE });
  });
}

// ─── SLIDE 7: ORDER PIPELINE ───
{
  const s = pptx.addSlide();
  s.background = { color: LIGHT_BG };
  s.addText("Order Pipeline", { x: 1.2, y: 0.5, w: 10, h: 0.8, fontSize: 32, fontFace: "Arial Black", color: NAVY, bold: true });
  s.addText("Full lifecycle managed from the Daily Brief — user controls every step", { x: 1.2, y: 1.15, w: 10, h: 0.4, fontSize: 14, fontFace: "Calibri", color: GREY, italic: true });

  const stages = [
    ["PENDING", "Orders to Place", "Send email or Mark Sent", AMBER],
    ["ORDERED", "Awaiting Delivery", "Confirm or change delivery date", ACCENT],
    ["DUE", "Deliveries Today", "Mark as Received", GREEN],
    ["DELIVERED", "On Site", "Auto-confirmed on sign-off", "6D28D9"],
  ];
  stages.forEach((st, i) => {
    const x = 1.2 + i * 2.8;
    s.addShape(pptx.ShapeType.rect, { x, y: 1.8, w: 2.5, h: 2.5, fill: { color: WHITE }, shadow: { type: "outer", blur: 4, offset: 2, color: "D0D0D0" }, rectRadius: 0.1 });
    s.addShape(pptx.ShapeType.rect, { x: x + 0.6, y: 2.0, w: 1.3, h: 0.35, fill: { color: st[3] }, rectRadius: 0.17 });
    s.addText(st[0], { x: x + 0.6, y: 2.0, w: 1.3, h: 0.35, fontSize: 10, fontFace: "Calibri", color: WHITE, bold: true, align: "center", valign: "middle" });
    s.addText(st[1], { x, y: 2.6, w: 2.5, h: 0.4, fontSize: 14, fontFace: "Calibri", color: DARK, bold: true, align: "center" });
    s.addText(st[2], { x, y: 3.1, w: 2.5, h: 0.6, fontSize: 11, fontFace: "Calibri", color: GREY, align: "center" });
    if (i < 3) {
      s.addText("→", { x: x + 2.5, y: 2.7, w: 0.3, h: 0.4, fontSize: 24, fontFace: "Arial", color: ACCENT, bold: true });
    }
  });

  s.addShape(pptx.ShapeType.rect, { x: 1.2, y: 4.7, w: 10.5, h: 0.6, fill: { color: "FEF3C7" }, rectRadius: 0.08 });
  s.addText("No silent auto-progression — the user decides when orders move through each stage", { x: 1.5, y: 4.75, w: 10, h: 0.5, fontSize: 12, fontFace: "Calibri", color: "92400E", align: "center", bold: true });
}

// ─── SLIDE 8: POST-COMPLETION ───
{
  const s = pptx.addSlide();
  s.background = { color: LIGHT_BG };
  s.addText("Post-Completion Flow", { x: 1.2, y: 0.5, w: 10, h: 0.8, fontSize: 32, fontFace: "Arial Black", color: NAVY, bold: true });
  s.addText("After every job sign-off — guided decision for what happens next", { x: 1.2, y: 1.15, w: 10, h: 0.4, fontSize: 14, fontFace: "Calibri", color: GREY, italic: true });

  const options = [
    ["Start today & pull forward", "Cascade entire programme earlier", GREEN],
    ["Start next Monday", "Schedule for Monday, cascade to match", ACCENT],
    ["Push forward by X weeks", "Delay programme by specified duration", AMBER],
    ["Leave for now", "Plot goes inactive — appears on Daily Brief", "DC2626"],
  ];
  options.forEach((o, i) => {
    const y = 1.8 + i * 0.85;
    s.addShape(pptx.ShapeType.rect, { x: 1.2, y, w: 10.5, h: 0.7, fill: { color: WHITE }, shadow: { type: "outer", blur: 3, offset: 1, color: "E0E0E0" }, rectRadius: 0.08 });
    s.addShape(pptx.ShapeType.rect, { x: 1.4, y: y + 0.12, w: 0.45, h: 0.45, fill: { color: o[2] }, rectRadius: 0.22 });
    s.addText(String(i + 1), { x: 1.4, y: y + 0.12, w: 0.45, h: 0.45, fontSize: 16, fontFace: "Arial", color: WHITE, bold: true, align: "center", valign: "middle" });
    s.addText(o[0], { x: 2.1, y: y + 0.05, w: 5, h: 0.3, fontSize: 14, fontFace: "Calibri", color: DARK, bold: true });
    s.addText(o[1], { x: 2.1, y: y + 0.3, w: 9, h: 0.3, fontSize: 12, fontFace: "Calibri", color: GREY });
  });

  s.addShape(pptx.ShapeType.rect, { x: 1.2, y: 5.3, w: 10.5, h: 0.5, fill: { color: "FFF7ED" }, rectRadius: 0.08 });
  s.addText("Contractor step: Confirm now, or 'Confirm later — add to Daily Brief' (plot goes inactive)", { x: 1.5, y: 5.32, w: 10, h: 0.45, fontSize: 12, fontFace: "Calibri", color: "9A3412", align: "center" });
}

// ─── SLIDE 9: WALKTHROUGH ───
{
  const s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addText("Site Walkthrough", { x: 1.2, y: 0.5, w: 10, h: 0.8, fontSize: 32, fontFace: "Arial Black", color: WHITE, bold: true });
  s.addText("Mobile-optimised plot-by-plot mode for site managers on the ground", { x: 1.2, y: 1.15, w: 10, h: 0.4, fontSize: 14, fontFace: "Calibri", color: ICE, italic: true });

  const items = [
    "Shows current sub-job + next sub-job with parent stage context",
    "Button says 'Start Foundations' not 'Start Job'",
    "Full pre-start flow on every action — order checks, predecessor, cascade",
    "Sign Off with notes and photos",
    "Quick access: Photos, Notes, Snags per plot",
    "Swipe or arrow between plots",
    "Schedule badge: ahead / on track / behind / deferred",
    "Works on any device — phone, tablet, desktop",
  ];
  items.forEach((t, i) => {
    const y = 1.8 + i * 0.47;
    s.addText("✓", { x: 1.2, y, w: 0.3, h: 0.35, fontSize: 14, fontFace: "Arial", color: GREEN, bold: true });
    s.addText(t, { x: 1.6, y, w: 10, h: 0.35, fontSize: 13, fontFace: "Calibri", color: WHITE });
  });
}

// ─── SLIDE 10: KEY NUMBERS ───
{
  const s = pptx.addSlide();
  s.background = { color: LIGHT_BG };
  s.addText("Key Numbers — Docco Site", { x: 1.2, y: 0.5, w: 10, h: 0.8, fontSize: 32, fontFace: "Arial Black", color: NAVY, bold: true });

  const stats = [
    ["26", "Plots", "5 house types with staggered starts"],
    ["566", "Jobs", "Parent stages + individual sub-jobs"],
    ["510", "Orders", "Across 6 suppliers, £804k budget"],
    ["< 2s", "Cascade", "Full programme shift in under 2 seconds"],
  ];
  stats.forEach((st, i) => {
    const x = 1.2 + i * 2.8;
    s.addShape(pptx.ShapeType.rect, { x, y: 1.8, w: 2.5, h: 2.2, fill: { color: WHITE }, shadow: { type: "outer", blur: 4, offset: 2, color: "D0D0D0" }, rectRadius: 0.1 });
    s.addText(st[0], { x, y: 1.9, w: 2.5, h: 0.9, fontSize: 44, fontFace: "Arial Black", color: ACCENT, bold: true, align: "center", valign: "middle" });
    s.addText(st[1], { x, y: 2.7, w: 2.5, h: 0.4, fontSize: 16, fontFace: "Calibri", color: DARK, bold: true, align: "center" });
    s.addText(st[2], { x, y: 3.2, w: 2.5, h: 0.5, fontSize: 11, fontFace: "Calibri", color: GREY, align: "center" });
  });

  s.addShape(pptx.ShapeType.rect, { x: 1.2, y: 4.5, w: 10.5, h: 0.6, fill: { color: "EFF6FF" }, rectRadius: 0.08 });
  s.addText("Every action logged to event timeline  •  Full audit trail  •  Real-time updates across all views", { x: 1.5, y: 4.55, w: 10, h: 0.5, fontSize: 12, fontFace: "Calibri", color: NAVY, align: "center" });
}

// ─── SLIDE 11: WHAT'S NEXT ───
{
  const s = pptx.addSlide();
  s.background = { color: NAVY };
  s.addText("What's Next", { x: 1.2, y: 0.6, w: 10, h: 0.8, fontSize: 36, fontFace: "Arial Black", color: WHITE, bold: true });
  const roadmap = [
    "Enhanced analytics and reporting dashboards",
    "Supplier portal for delivery confirmations",
    "Client handover digital pack",
    "Photo AI for progress tracking",
    "Integration with accounting systems",
  ];
  roadmap.forEach((t, i) => {
    const y = 1.8 + i * 0.7;
    s.addShape(pptx.ShapeType.rect, { x: 1.2, y, w: 10.5, h: 0.55, fill: { color: "243178" }, rectRadius: 0.08 });
    s.addText("→  " + t, { x: 1.5, y, w: 10, h: 0.55, fontSize: 15, fontFace: "Calibri", color: WHITE, valign: "middle" });
  });
  s.addShape(pptx.ShapeType.rect, { x: 1.2, y: 5.6, w: 2, h: 0.05, fill: { color: ACCENT } });
  s.addText("sight-manager.vercel.app", { x: 1.2, y: 5.8, w: 10, h: 0.4, fontSize: 14, fontFace: "Calibri", color: ICE });
}

pptx.writeFile({ fileName: "C:\\Users\\keith\\OneDrive\\Desktop\\sight-manager\\docs\\Sight-Manager-Overview.pptx" })
  .then(() => console.log("PPTX created successfully"))
  .catch(e => console.error("Error:", e));
