/**
 * One-shot enrichment for the "2 Story House (copy)" template:
 *
 *   1. Cleanup — the clone was made before the variant-scope fix
 *      landed, so every sub-job is duplicated as an orphan top-level
 *      row (parentId null + 0 children). Drop those.
 *   2. Assign a sensible contractor to every sub-job based on name.
 *   3. Assign a sensible supplier to every order based on items.
 *   4. Add line items (qty + unitCost) to every order so costs roll.
 *   5. Add a handful of TemplateMaterial quants.
 *   6. Add placeholder TemplateDocument rows for drawings.
 *   7. Spawn 4 variants (765, 775, 923, 990) seeded from base, each
 *      with slightly different durationDays on the bricklaying-heavy
 *      stages so they actually differ.
 *   8. Run resequenceTopLevelStages on base + every variant so the
 *      cached startWeek/endWeek values are clean.
 */

import { PrismaClient } from "@prisma/client";
import { resequenceTopLevelStages } from "../src/lib/template-pack-children";

const prisma = new PrismaClient();
const TEMPLATE_NAME = "2 Story House (765 / 775 / 923 / 990 / 1047) (copy)";

// ------------------------ Mapping tables ------------------------

// Sub-job name → contractor company. Lower-cased name match.
const CONTRACTOR_BY_NAME: Array<{ pattern: RegExp; company: string }> = [
  { pattern: /dig|drainage|spantherm|concrete slab|scaff matt/i, company: "Nichols Groundworks Ltd" },
  { pattern: /^brickwork$|brickwork.*lift|brick pikes|brickwork \d+/i, company: "Bradley Bricklaying" },
  { pattern: /scaff/i, company: "Bradley Bricklaying" },
  { pattern: /joist|truss|joiners|joiner/i, company: "Cooper Carpentry & Joinery" },
  { pattern: /roofers|felt batten tile/i, company: "BuildRight Roofing" },
  { pattern: /sparks|electric/i, company: "Walker Electrical Ltd" },
  { pattern: /plumber|plumb/i, company: "Patel Plumbing & Heating" },
  { pattern: /window fitters|window/i, company: "Cooper Carpentry & Joinery" },
  { pattern: /plaster/i, company: "Murphy Plastering" },
  { pattern: /painters|paint/i, company: "Roberts Decorating" },
  { pattern: /driveway|edgings|paths|tarmac|flagging/i, company: "Fisher Landscapes" },
  { pattern: /boundary fence|gate|fencer/i, company: "Fisher Landscapes" },
];

// Order itemsDescription → supplier name + line items to seed.
interface OrderSeed {
  pattern: RegExp;
  supplierName: string;
  items: Array<{ name: string; quantity: number; unit: string; unitCost: number }>;
}
const ORDER_SEEDS: OrderSeed[] = [
  {
    pattern: /lintel|former|meter box/i,
    supplierName: "Travis Perkins",
    items: [
      { name: "Concrete lintel 1200mm", quantity: 12, unit: "ea", unitCost: 28 },
      { name: "Cavity former / closer", quantity: 60, unit: "ea", unitCost: 4.5 },
      { name: "Meter box (electric)", quantity: 1, unit: "ea", unitCost: 65 },
      { name: "Meter box (gas)", quantity: 1, unit: "ea", unitCost: 70 },
    ],
  },
  {
    pattern: /joist/i,
    supplierName: "Jewson",
    items: [
      { name: "Engineered I-joist 240mm", quantity: 28, unit: "ea", unitCost: 42 },
      { name: "Joist hanger 240mm", quantity: 56, unit: "ea", unitCost: 3.2 },
    ],
  },
  {
    pattern: /truss/i,
    supplierName: "Jewson",
    items: [
      { name: "Roof truss (gable)", quantity: 2, unit: "ea", unitCost: 145 },
      { name: "Roof truss (intermediate)", quantity: 14, unit: "ea", unitCost: 92 },
      { name: "Truss clip", quantity: 32, unit: "ea", unitCost: 1.5 },
    ],
  },
  {
    pattern: /felt|batten|tile/i,
    supplierName: "Marley Roof Tiles",
    items: [
      { name: "Roof felt (1m × 50m)", quantity: 4, unit: "roll", unitCost: 95 },
      { name: "Roofing batten 25×50", quantity: 120, unit: "m", unitCost: 1.2 },
      { name: "Marley plain tile", quantity: 1800, unit: "ea", unitCost: 0.85 },
      { name: "Ridge tile", quantity: 18, unit: "ea", unitCost: 8.5 },
    ],
  },
  {
    pattern: /scant timber|internal door frame/i,
    supplierName: "Jewson",
    items: [
      { name: "CLS 38×89 stud timber", quantity: 60, unit: "m", unitCost: 3.4 },
      { name: "Internal door frame", quantity: 8, unit: "ea", unitCost: 38 },
    ],
  },
  {
    pattern: /board|skim|bead/i,
    supplierName: "British Gypsum",
    items: [
      { name: "Plasterboard 12.5mm 2.4×1.2", quantity: 90, unit: "ea", unitCost: 12.5 },
      { name: "Multi-finish plaster 25kg", quantity: 30, unit: "bag", unitCost: 9.5 },
      { name: "Corner bead 2.4m", quantity: 24, unit: "ea", unitCost: 2.1 },
    ],
  },
  {
    pattern: /int doors|skirts|architrave|internal doors/i,
    supplierName: "Howdens Joinery",
    items: [
      { name: "Internal door — 762×1981", quantity: 8, unit: "ea", unitCost: 78 },
      { name: "Skirting 145mm 4.2m length", quantity: 22, unit: "ea", unitCost: 12 },
      { name: "Architrave 70mm 2.4m", quantity: 24, unit: "ea", unitCost: 6.5 },
    ],
  },
  {
    pattern: /post|feather edge|postmix/i,
    supplierName: "Travis Perkins",
    items: [
      { name: "Concrete post 100×100×2400", quantity: 14, unit: "ea", unitCost: 18 },
      { name: "Feather edge board 150×22", quantity: 60, unit: "m", unitCost: 4.2 },
      { name: "Postmix 20kg", quantity: 14, unit: "bag", unitCost: 5.5 },
      { name: "Gate (hardwood 900mm)", quantity: 1, unit: "ea", unitCost: 220 },
    ],
  },
];

// Materials to add — one-off quants the template carries directly.
const MATERIALS = [
  { name: "Facing brick (Ibstock)", quantity: 6500, unit: "ea", unitCost: 0.55, category: "Brickwork", linkedStageCode: "BW" },
  { name: "Cement 25kg", quantity: 80, unit: "bag", unitCost: 6.2, category: "Brickwork", linkedStageCode: "BW" },
  { name: "Sharp sand", quantity: 8, unit: "tonne", unitCost: 42, category: "Brickwork", linkedStageCode: "BW" },
  { name: "Concrete block 100mm", quantity: 1200, unit: "ea", unitCost: 1.4, category: "Brickwork", linkedStageCode: "BW" },
  { name: "Insulation 100mm PIR", quantity: 60, unit: "sheet", unitCost: 28, category: "1st Fix", linkedStageCode: "1F" },
  { name: "Wall plate 100×50", quantity: 32, unit: "m", unitCost: 5.2, category: "Roofing", linkedStageCode: "RF" },
  { name: "Damp-proof course", quantity: 36, unit: "m", unitCost: 1.5, category: "Foundation", linkedStageCode: "GW" },
  { name: "Floor screed 50mm", quantity: 95, unit: "m²", unitCost: 22, category: "Foundation", linkedStageCode: "GW" },
];

// Placeholder drawings (no real Supabase upload, just rows so the
// validation panel passes). isPlaceholder=true so the UI shows the
// "Re-upload needed" affordance.
const DRAWING_PLACEHOLDERS = [
  { name: "Floor plan — Ground", fileName: "ground-floor-plan.pdf", category: "DRAWING" },
  { name: "Floor plan — First", fileName: "first-floor-plan.pdf", category: "DRAWING" },
  { name: "Elevations", fileName: "elevations.pdf", category: "DRAWING" },
  { name: "Spec sheet", fileName: "spec.pdf", category: "SPEC" },
];

// Variants to spawn. durationFactor scales the bigger sub-jobs (more
// brickwork / boards on a bigger plot). 765 is the smallest, 1047
// already exists implicitly as the base.
interface VariantSeed {
  name: string;
  description: string;
  /** Per-stageCode multiplier applied to leaf durationDays. Decimals
   *  rounded up to whole working days. */
  multiplier: number;
}
const VARIANT_SEEDS: VariantSeed[] = [
  { name: "765", description: "765 sq ft — smallest 2-storey footprint", multiplier: 0.85 },
  { name: "775", description: "775 sq ft — slightly extended over the 765", multiplier: 0.9 },
  { name: "923", description: "923 sq ft — mid-range with extra reception", multiplier: 1.0 },
  { name: "990", description: "990 sq ft — fourth bedroom + en-suite", multiplier: 1.1 },
];

// ------------------------ Implementation ------------------------

async function main() {
  const tpl = await prisma.plotTemplate.findFirst({
    where: { name: TEMPLATE_NAME },
    select: { id: true, name: true },
  });
  if (!tpl) throw new Error(`Template "${TEMPLATE_NAME}" not found`);
  console.log(`Working on: ${tpl.name} (id=${tpl.id})\n`);

  // ---------- 1. Cleanup orphan top-level duplicates ----------
  const allTopLevel = await prisma.templateJob.findMany({
    where: { templateId: tpl.id, variantId: null, parentId: null },
    include: { children: { select: { id: true } } },
  });
  const PROPER_STAGE_NAMES = new Set([
    "Foundation",
    "Superstructure",
    "1st Fix",
    "Windows & Doors",
    "Plasterers",
    "2nd Fix",
    "Paint",
    "Final",
    "Externals",
    "Fencer",
  ]);
  const orphans = allTopLevel.filter(
    (j) =>
      !PROPER_STAGE_NAMES.has(j.name) &&
      j.children.length === 0,
  );
  console.log(
    `Cleanup — found ${allTopLevel.length} top-level rows, ${orphans.length} orphans to drop.`,
  );
  if (orphans.length > 0) {
    await prisma.templateJob.deleteMany({
      where: { id: { in: orphans.map((o) => o.id) } },
    });
    console.log(`  ✓ deleted ${orphans.length} orphan rows`);
  }

  // ---------- 2. Look up contractors + suppliers by name ----------
  const contacts = await prisma.contact.findMany({
    where: { type: "CONTRACTOR" },
    select: { id: true, name: true, company: true },
  });
  const contactByCompany = new Map(
    contacts.map((c) => [c.company ?? c.name, c.id]),
  );
  const suppliers = await prisma.supplier.findMany({
    select: { id: true, name: true },
  });
  const supplierByName = new Map(suppliers.map((s) => [s.name, s.id]));

  function findContractor(jobName: string): string | null {
    for (const m of CONTRACTOR_BY_NAME) {
      if (m.pattern.test(jobName)) {
        return contactByCompany.get(m.company) ?? null;
      }
    }
    return null;
  }
  function findOrderSeed(itemsDescription: string): OrderSeed | null {
    for (const s of ORDER_SEEDS) {
      if (s.pattern.test(itemsDescription)) return s;
    }
    return null;
  }

  // ---------- 3. Assign contractors to every leaf sub-job ----------
  const subJobs = await prisma.templateJob.findMany({
    where: { templateId: tpl.id, variantId: null, parentId: { not: null } },
    select: { id: true, name: true, contactId: true },
  });
  let contractorAssigned = 0;
  for (const sj of subJobs) {
    if (sj.contactId) continue;
    const cid = findContractor(sj.name);
    if (cid) {
      await prisma.templateJob.update({
        where: { id: sj.id },
        data: { contactId: cid },
      });
      contractorAssigned += 1;
    }
  }
  console.log(`Contractors — assigned to ${contractorAssigned} sub-jobs.`);

  // ---------- 4. Suppliers + line items on every order ----------
  const orders = await prisma.templateOrder.findMany({
    where: {
      templateJob: { templateId: tpl.id, variantId: null },
    },
    include: { items: true },
  });
  let orderUpdates = 0;
  for (const o of orders) {
    const seed = findOrderSeed(o.itemsDescription ?? "");
    if (!seed) continue;
    const supplierId = supplierByName.get(seed.supplierName) ?? null;
    if (supplierId && !o.supplierId) {
      await prisma.templateOrder.update({
        where: { id: o.id },
        data: { supplierId },
      });
      orderUpdates += 1;
    }
    if (o.items.length === 0) {
      await prisma.templateOrderItem.createMany({
        data: seed.items.map((it) => ({
          templateOrderId: o.id,
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          unitCost: it.unitCost,
        })),
      });
    }
  }
  console.log(
    `Orders — supplier set on ${orderUpdates}, line items added where missing.`,
  );

  // ---------- 5. Materials (only if none exist) ----------
  const existingMaterials = await prisma.templateMaterial.count({
    where: { templateId: tpl.id, variantId: null },
  });
  if (existingMaterials === 0) {
    await prisma.templateMaterial.createMany({
      data: MATERIALS.map((m) => ({
        templateId: tpl.id,
        ...m,
      })),
    });
    console.log(`Materials — added ${MATERIALS.length} rows.`);
  } else {
    console.log(`Materials — ${existingMaterials} already exist, skipping.`);
  }

  // ---------- 6. Drawings (only if none) ----------
  const existingDocs = await prisma.templateDocument.count({
    where: { templateId: tpl.id, variantId: null },
  });
  if (existingDocs === 0) {
    await prisma.templateDocument.createMany({
      data: DRAWING_PLACEHOLDERS.map((d) => ({
        templateId: tpl.id,
        name: d.name,
        url: "",
        fileName: d.fileName,
        category: d.category,
        isPlaceholder: true,
      })),
    });
    console.log(
      `Drawings — added ${DRAWING_PLACEHOLDERS.length} placeholder rows (re-upload needed).`,
    );
  } else {
    console.log(`Drawings — ${existingDocs} already exist, skipping.`);
  }

  // ---------- 7. Resequence base ----------
  await prisma.$transaction(
    async (tx) => {
      await resequenceTopLevelStages(tx, tpl.id, null);
    },
    { timeout: 60_000 },
  );
  console.log(`Base — resequenced.`);

  // ---------- 8. Spawn variants ----------
  const baseStages = await prisma.templateJob.findMany({
    where: { templateId: tpl.id, variantId: null, parentId: null },
    orderBy: { sortOrder: "asc" },
    include: {
      orders: { include: { items: true } },
      children: {
        orderBy: { sortOrder: "asc" },
        include: { orders: { include: { items: true } } },
      },
    },
  });
  const baseMaterials = await prisma.templateMaterial.findMany({
    where: { templateId: tpl.id, variantId: null },
  });
  const baseDocs = await prisma.templateDocument.findMany({
    where: { templateId: tpl.id, variantId: null },
  });

  for (const v of VARIANT_SEEDS) {
    const existing = await prisma.templateVariant.findFirst({
      where: { templateId: tpl.id, name: v.name },
    });
    if (existing) {
      console.log(`Variant ${v.name} — already exists, skipping.`);
      continue;
    }
    const variant = await prisma.templateVariant.create({
      data: {
        templateId: tpl.id,
        name: v.name,
        description: v.description,
        sortOrder: VARIANT_SEEDS.indexOf(v),
      },
    });

    // Clone parent stages, with their children + orders + items.
    // multiplier scales leaf-job durationDays.
    const oldToNew = new Map<string, string>();
    for (const stage of baseStages) {
      const newStage = await prisma.templateJob.create({
        data: {
          templateId: tpl.id,
          variantId: variant.id,
          name: stage.name,
          description: stage.description,
          stageCode: stage.stageCode,
          sortOrder: stage.sortOrder,
          startWeek: stage.startWeek,
          endWeek: stage.endWeek,
          durationWeeks: stage.durationWeeks,
          durationDays: stage.children.length > 0 ? null : Math.max(1, Math.ceil((stage.durationDays ?? 0) * v.multiplier)),
          weatherAffected: stage.weatherAffected,
          weatherAffectedType: stage.weatherAffectedType,
          contactId: stage.contactId,
          parentId: null,
        },
      });
      oldToNew.set(stage.id, newStage.id);

      for (const child of stage.children) {
        const newDays = Math.max(1, Math.ceil((child.durationDays ?? 5) * v.multiplier));
        const newChild = await prisma.templateJob.create({
          data: {
            templateId: tpl.id,
            variantId: variant.id,
            name: child.name,
            description: child.description,
            stageCode: child.stageCode,
            sortOrder: child.sortOrder,
            startWeek: child.startWeek,
            endWeek: child.endWeek,
            durationWeeks: null,
            durationDays: newDays,
            weatherAffected: child.weatherAffected,
            weatherAffectedType: child.weatherAffectedType,
            contactId: child.contactId,
            parentId: newStage.id,
          },
        });
        oldToNew.set(child.id, newChild.id);

        // Clone child orders + items (anchorJobId remap)
        for (const o of child.orders) {
          const remappedAnchor = o.anchorJobId
            ? oldToNew.get(o.anchorJobId) ?? null
            : null;
          await prisma.templateOrder.create({
            data: {
              templateJobId: newChild.id,
              supplierId: o.supplierId,
              orderWeekOffset: o.orderWeekOffset,
              deliveryWeekOffset: o.deliveryWeekOffset,
              itemsDescription: o.itemsDescription,
              anchorType: o.anchorType,
              anchorAmount: o.anchorAmount,
              anchorUnit: o.anchorUnit,
              anchorDirection: o.anchorDirection,
              anchorJobId: remappedAnchor,
              leadTimeAmount: o.leadTimeAmount,
              leadTimeUnit: o.leadTimeUnit,
              items: {
                create: o.items.map((it) => ({
                  name: it.name,
                  // Order item quantities also scale with the variant
                  // (a bigger house needs more bricks etc.).
                  quantity: Math.ceil(it.quantity * v.multiplier),
                  unit: it.unit,
                  unitCost: it.unitCost,
                })),
              },
            },
          });
        }
      }
    }

    // Materials: scaled qty per variant.
    for (const m of baseMaterials) {
      await prisma.templateMaterial.create({
        data: {
          templateId: tpl.id,
          variantId: variant.id,
          name: m.name,
          quantity: Math.ceil(m.quantity * v.multiplier),
          unit: m.unit,
          unitCost: m.unitCost,
          category: m.category,
          notes: m.notes,
          linkedStageCode: m.linkedStageCode,
        },
      });
    }

    // Documents: same set, but flagged as placeholders so the user
    // re-uploads variant-specific drawings.
    for (const d of baseDocs) {
      await prisma.templateDocument.create({
        data: {
          templateId: tpl.id,
          variantId: variant.id,
          name: `${d.name} — ${v.name}`,
          url: "",
          fileName: d.fileName,
          fileSize: d.fileSize,
          mimeType: d.mimeType,
          category: d.category,
          isPlaceholder: true,
        },
      });
    }

    await prisma.templateAuditEvent.create({
      data: {
        templateId: tpl.id,
        action: "variant_added",
        detail: `Auto-seeded variant "${v.name}" with ${(v.multiplier * 100).toFixed(0)}% duration scaling.`,
      },
    });

    // Resequence the variant
    await prisma.$transaction(
      async (tx) => {
        await resequenceTopLevelStages(tx, tpl.id, variant.id);
      },
      { timeout: 60_000 },
    );

    console.log(
      `Variant ${v.name} — created + seeded with ${(v.multiplier * 100).toFixed(0)}% scaling.`,
    );
  }

  // Final summary
  const summary = await prisma.plotTemplate.findUnique({
    where: { id: tpl.id },
    include: {
      variants: { select: { id: true, name: true } },
      _count: {
        select: {
          jobs: true,
          materials: true,
          documents: true,
          variants: true,
        },
      },
    },
  });
  console.log("\n=== Final ===");
  console.log(`  Variants: ${summary?._count.variants ?? 0}`);
  console.log(`  Total job rows (across base + variants): ${summary?._count.jobs ?? 0}`);
  console.log(`  Total materials (across base + variants): ${summary?._count.materials ?? 0}`);
  console.log(`  Total documents (across base + variants): ${summary?._count.documents ?? 0}`);
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
