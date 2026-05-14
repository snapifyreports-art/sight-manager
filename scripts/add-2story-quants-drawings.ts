/**
 * One-off (May 2026) — flesh out the live "2 Story House" template
 * for testing: add structured line items to every order, plus a quant
 * (TemplateMaterial) list and a drawing (TemplateDocument) set — to
 * the BASE and all 4 variants.
 *
 * Drawings are placeholder rows (isPlaceholder=true, empty url) — the
 * same pattern the template-clone flow uses. No real files fabricated.
 *
 * Idempotent per scope: skips orders that already have line items and
 * scopes that already have quants/drawings.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

// ── Order line items, keyed by the order's itemsDescription text
//    (identical across base + variants, since variants are clones).
const ORDER_ITEMS: Record<string, Array<{ name: string; quantity: number; unit: string; unitCost: number }>> = {
  "Lintels / formers / meter boxes": [
    { name: "Concrete lintel 100mm (1200mm)", quantity: 8, unit: "each", unitCost: 18.5 },
    { name: "Cavity closer / former", quantity: 12, unit: "each", unitCost: 6.2 },
    { name: "External meter box", quantity: 2, unit: "each", unitCost: 24.0 },
  ],
  "Joists": [
    { name: "Timber joist 47x220mm C24 (4.8m)", quantity: 32, unit: "each", unitCost: 31.4 },
    { name: "Joist hangers", quantity: 64, unit: "each", unitCost: 1.85 },
  ],
  "Trusses": [
    { name: "Roof truss (standard fink)", quantity: 14, unit: "each", unitCost: 62.0 },
    { name: "Truss clips", quantity: 28, unit: "each", unitCost: 0.95 },
    { name: "Bracing timber 22x97mm (4.8m)", quantity: 10, unit: "each", unitCost: 7.8 },
  ],
  "Felt, batten, tile": [
    { name: "Breathable roofing felt (1m x 50m roll)", quantity: 6, unit: "roll", unitCost: 78.0 },
    { name: "Treated roof batten 25x50mm (pack of 50)", quantity: 8, unit: "pack", unitCost: 42.0 },
    { name: "Concrete interlocking roof tile", quantity: 1450, unit: "each", unitCost: 0.78 },
    { name: "Ridge tile", quantity: 24, unit: "each", unitCost: 4.1 },
  ],
  "Scant timber, internal door frames": [
    { name: "Scant timber 47x75mm CLS (3m)", quantity: 60, unit: "each", unitCost: 4.3 },
    { name: "Internal door lining set", quantity: 8, unit: "each", unitCost: 17.5 },
  ],
  "Boards, skim & beads": [
    { name: "Plasterboard 12.5mm (2.4m x 1.2m)", quantity: 95, unit: "sheet", unitCost: 9.4 },
    { name: "Bonding plaster (25kg bag)", quantity: 22, unit: "bag", unitCost: 8.6 },
    { name: "Multi-finish plaster (25kg bag)", quantity: 30, unit: "bag", unitCost: 9.2 },
    { name: "Galvanised angle bead (2.4m)", quantity: 40, unit: "each", unitCost: 1.3 },
  ],
  "Internal doors, skirts, architrave": [
    { name: "Internal door (primed, 762mm)", quantity: 8, unit: "each", unitCost: 38.0 },
    { name: "Skirting board MDF 18x144mm (4.4m)", quantity: 28, unit: "each", unitCost: 11.2 },
    { name: "Architrave MDF 18x69mm (2.2m)", quantity: 36, unit: "each", unitCost: 4.6 },
  ],
  "Post, feather edge and postmix": [
    { name: "Timber fence post 100x100mm (2.4m)", quantity: 22, unit: "each", unitCost: 14.5 },
    { name: "Feather edge board (1.5m)", quantity: 320, unit: "each", unitCost: 1.95 },
    { name: "Postmix concrete (20kg bag)", quantity: 44, unit: "bag", unitCost: 5.4 },
  ],
};

// ── Quants (TemplateMaterial) — per-plot material schedule.
const QUANTS: Array<{ name: string; quantity: number; unit: string; unitCost: number; category: string; linkedStageCode: string }> = [
  // Groundworks
  { name: "Ready-mix concrete C25 (foundations)", quantity: 14, unit: "m³", unitCost: 115.0, category: "Groundworks", linkedStageCode: "FND" },
  { name: "MOT Type 1 sub-base", quantity: 18, unit: "tonne", unitCost: 32.0, category: "Groundworks", linkedStageCode: "SLB" },
  { name: "Drainage pipe 110mm", quantity: 45, unit: "m", unitCost: 6.8, category: "Groundworks", linkedStageCode: "DRN" },
  { name: "Spantherm insulated floor units", quantity: 1, unit: "set", unitCost: 1850.0, category: "Groundworks", linkedStageCode: "SPT" },
  // Brickwork
  { name: "Facing brick", quantity: 8500, unit: "each", unitCost: 0.62, category: "Brickwork", linkedStageCode: "B1" },
  { name: "Concrete block 100mm", quantity: 2400, unit: "each", unitCost: 1.45, category: "Brickwork", linkedStageCode: "B1" },
  { name: "Building sand", quantity: 16, unit: "tonne", unitCost: 38.0, category: "Brickwork", linkedStageCode: "B1" },
  { name: "Cement (25kg bag)", quantity: 90, unit: "bag", unitCost: 5.2, category: "Brickwork", linkedStageCode: "B1" },
  { name: "Wall ties", quantity: 1800, unit: "each", unitCost: 0.18, category: "Brickwork", linkedStageCode: "B2" },
  { name: "Cavity wall insulation batt", quantity: 220, unit: "m²", unitCost: 6.4, category: "Brickwork", linkedStageCode: "B2" },
  // Roofing
  { name: "Roof truss (fink)", quantity: 14, unit: "each", unitCost: 62.0, category: "Roofing", linkedStageCode: "TRS" },
  { name: "Concrete roof tile", quantity: 1450, unit: "each", unitCost: 0.78, category: "Roofing", linkedStageCode: "RF" },
  { name: "Breathable roofing felt (50m roll)", quantity: 6, unit: "roll", unitCost: 78.0, category: "Roofing", linkedStageCode: "RF" },
  { name: "Treated roof batten 25x50mm", quantity: 400, unit: "m", unitCost: 0.85, category: "Roofing", linkedStageCode: "RF" },
  // Carpentry
  { name: "Timber joist 47x220mm C24", quantity: 32, unit: "each", unitCost: 31.4, category: "Carpentry", linkedStageCode: "JST" },
  { name: "Floor decking (chipboard T&G 2.4x0.6m)", quantity: 38, unit: "sheet", unitCost: 14.2, category: "Carpentry", linkedStageCode: "1FJ" },
  { name: "Internal door (primed)", quantity: 8, unit: "each", unitCost: 38.0, category: "Carpentry", linkedStageCode: "2FJ" },
  { name: "Skirting & architrave (MDF, room set)", quantity: 8, unit: "set", unitCost: 64.0, category: "Carpentry", linkedStageCode: "2FJ" },
  // Plastering
  { name: "Plasterboard 12.5mm (2.4x1.2m)", quantity: 95, unit: "sheet", unitCost: 9.4, category: "Plastering", linkedStageCode: "PLS" },
  { name: "Plaster (multi-finish + bonding, 25kg)", quantity: 52, unit: "bag", unitCost: 8.9, category: "Plastering", linkedStageCode: "PLS" },
  // Decoration
  { name: "Trade emulsion (10L)", quantity: 8, unit: "tub", unitCost: 28.0, category: "Decoration", linkedStageCode: "DECP" },
  { name: "Undercoat / primer (5L)", quantity: 4, unit: "tub", unitCost: 22.0, category: "Decoration", linkedStageCode: "DECP" },
  // Externals
  { name: "Tarmac (driveway)", quantity: 9, unit: "tonne", unitCost: 95.0, category: "Externals", linkedStageCode: "EXTT" },
  { name: "Block paving / flags", quantity: 65, unit: "m²", unitCost: 22.0, category: "Externals", linkedStageCode: "EXTF" },
  { name: "Timber fence post 100x100mm", quantity: 22, unit: "each", unitCost: 14.5, category: "Externals", linkedStageCode: "FENB" },
  { name: "Feather edge board", quantity: 320, unit: "each", unitCost: 1.95, category: "Externals", linkedStageCode: "FENB" },
];

// ── Drawings (TemplateDocument) — placeholder records (no real files).
const DRAWINGS: Array<{ name: string; fileName: string }> = [
  { name: "Site Location Plan", fileName: "site-location-plan.pdf" },
  { name: "Ground Floor Plan", fileName: "ground-floor-plan.pdf" },
  { name: "First Floor Plan", fileName: "first-floor-plan.pdf" },
  { name: "Elevations (N/S/E/W)", fileName: "elevations.pdf" },
  { name: "Foundation & Groundworks Layout", fileName: "foundation-layout.pdf" },
  { name: "Drainage Layout", fileName: "drainage-layout.pdf" },
  { name: "Roof Plan", fileName: "roof-plan.pdf" },
  { name: "Cross Sections", fileName: "cross-sections.pdf" },
];

async function main() {
  const template = await prisma.plotTemplate.findFirst({
    where: { name: { startsWith: "2 Story House" }, archivedAt: null },
    include: { variants: { orderBy: { sortOrder: "asc" } } },
  });
  if (!template) throw new Error("Live '2 Story House' template not found");
  const templateId = template.id;

  // Scopes: base (variantId null) + every variant.
  const scopes: Array<{ variantId: string | null; label: string }> = [
    { variantId: null, label: "base" },
    ...template.variants.map((v) => ({ variantId: v.id, label: `variant "${v.name}"` })),
  ];
  console.log(`Template: ${template.name}\nScopes: ${scopes.map((s) => s.label).join(", ")}\n`);

  await prisma.$transaction(async (tx) => {
    for (const scope of scopes) {
      // ── 1. Order line items ──────────────────────────────────────
      const orders = await tx.templateOrder.findMany({
        where: { templateJob: { templateId, variantId: scope.variantId } },
        include: { items: true },
      });
      let itemsAdded = 0, ordersSkipped = 0;
      for (const order of orders) {
        if (order.items.length > 0) { ordersSkipped++; continue; }
        const lineItems = order.itemsDescription ? ORDER_ITEMS[order.itemsDescription] : undefined;
        if (!lineItems) continue;
        await tx.templateOrderItem.createMany({
          data: lineItems.map((li) => ({ templateOrderId: order.id, ...li })),
        });
        itemsAdded += lineItems.length;
      }

      // ── 2. Quants ────────────────────────────────────────────────
      const existingMaterials = await tx.templateMaterial.count({
        where: { templateId, variantId: scope.variantId },
      });
      let quantsAdded = 0;
      if (existingMaterials === 0) {
        await tx.templateMaterial.createMany({
          data: QUANTS.map((q) => ({ templateId, variantId: scope.variantId, ...q })),
        });
        quantsAdded = QUANTS.length;
      }

      // ── 3. Drawings (placeholder records) ────────────────────────
      const existingDocs = await tx.templateDocument.count({
        where: { templateId, variantId: scope.variantId },
      });
      let drawingsAdded = 0;
      if (existingDocs === 0) {
        await tx.templateDocument.createMany({
          data: DRAWINGS.map((d) => ({
            templateId,
            variantId: scope.variantId,
            name: d.name,
            url: "",
            fileName: d.fileName,
            mimeType: "application/pdf",
            category: "DRAWING",
            isPlaceholder: true,
          })),
        });
        drawingsAdded = DRAWINGS.length;
      }

      console.log(
        `✓ ${scope.label.padEnd(18)} — ${itemsAdded} order line-items` +
        `${ordersSkipped ? ` (${ordersSkipped} orders already had items)` : ""}, ` +
        `${quantsAdded} quants${existingMaterials ? " (skipped — already had some)" : ""}, ` +
        `${drawingsAdded} drawings${existingDocs ? " (skipped — already had some)" : ""}`,
      );
    }
  }, { timeout: 120_000 });

  console.log(`\nDone.`);
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
