/**
 * One-off (May 2026) — speed up a test:
 *  1. Fill the missing data on the live "2 Story House" base template
 *     (stageCode, description, contractor on jobs; supplier on orders).
 *  2. Create 4 variants: "1 day" (base build, every job 1 working day)
 *     plus "765" / "923" / "1047" (house types — copies of fixed base).
 *
 * Safe to re-run: it skips work that's already done where it can, but
 * intended as a single pass. Wrapped in one transaction.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import { resequenceTopLevelStages } from "../src/lib/template-pack-children";

const prisma = new PrismaClient();

// ── Per-job data: keyed by job name within its stage. Some names repeat
//    across stages (Joiners/Sparks/Plumber) so we key by "Stage › Job".
const JOB_DATA: Record<string, { code: string; desc: string; contractor: string | null }> = {
  // Foundation
  "Foundation": { code: "GW", desc: "Groundworks — footings through to floor slab and scaffold access", contractor: "Steve Baker" },
  "Foundation › Dig & pour": { code: "FND", desc: "Excavate footings and pour foundation concrete", contractor: "Steve Baker" },
  "Foundation › Brickwork": { code: "FBW", desc: "Build foundation brickwork up to DPC level", contractor: "Tom Bradley" },
  "Foundation › Drainage": { code: "DRN", desc: "Lay below-ground foul and surface-water drainage", contractor: "Steve Baker" },
  "Foundation › Spantherm": { code: "SPT", desc: "Install Spantherm insulated ground-floor system", contractor: "Steve Baker" },
  "Foundation › Concrete slab": { code: "SLB", desc: "Pour and power-float the ground-floor slab", contractor: "Steve Baker" },
  "Foundation › Scaff matt": { code: "SCM", desc: "Lay scaffold matting and access track", contractor: "Steve Baker" },
  // Superstructure
  "Superstructure": { code: "SUP", desc: "Superstructure — brickwork lifts, joists, trusses and roof", contractor: "Tom Bradley" },
  "Superstructure › Brickwork 1st lift": { code: "B1", desc: "Build external and internal walls — first lift", contractor: "Tom Bradley" },
  "Superstructure › Scaff 1st": { code: "SC1", desc: "Erect first-lift working scaffold", contractor: "Tom Bradley" },
  "Superstructure › Brickwork 2nd lift": { code: "B2", desc: "Build walls — second lift", contractor: "Tom Bradley" },
  "Superstructure › Scaff 2nd lift": { code: "SC2", desc: "Erect second-lift scaffold", contractor: "Tom Bradley" },
  "Superstructure › Joist (joiners)": { code: "JST", desc: "Install first-floor joists and decking", contractor: "Alan Cooper" },
  "Superstructure › Brickwork 3rd": { code: "B3", desc: "Build walls — third lift", contractor: "Tom Bradley" },
  "Superstructure › Scaff 3rd": { code: "SC3", desc: "Erect third-lift scaffold", contractor: "Tom Bradley" },
  "Superstructure › Brickwork 4th": { code: "B4", desc: "Build walls and gables — fourth lift", contractor: "Tom Bradley" },
  "Superstructure › Scaff 4th": { code: "SC4", desc: "Erect fourth-lift scaffold", contractor: "Tom Bradley" },
  "Superstructure › Truss": { code: "TRS", desc: "Install roof trusses and bracing", contractor: "Alan Cooper" },
  "Superstructure › Brick pikes": { code: "BPK", desc: "Build brick pikes and gable finishes", contractor: "Tom Bradley" },
  "Superstructure › Roofers felt batten tile": { code: "RF", desc: "Felt, batten and tile the roof", contractor: "Dan Matthews" },
  // 1st Fix
  "1st Fix": { code: "1F", desc: "First fix — carpentry, electrical and plumbing carcassing", contractor: "Alan Cooper" },
  "1st Fix › Joiners": { code: "1FJ", desc: "First-fix carpentry — frames, noggins, floor decking", contractor: "Alan Cooper" },
  "1st Fix › Sparks": { code: "1FE", desc: "First-fix electrical — cabling and back boxes", contractor: "Chris Walker" },
  "1st Fix › Plumber": { code: "1FP", desc: "First-fix plumbing — pipework and carcassing", contractor: "James Patel" },
  // Windows & Doors
  "Windows & Doors": { code: "WD", desc: "Install windows and external doors", contractor: "Alan Cooper" },
  "Windows & Doors › Window fitters": { code: "WDF", desc: "Fit windows and external doors, seal and make weathertight", contractor: "Alan Cooper" },
  // Plasterers
  "Plasterers": { code: "PL", desc: "Board, skim and bead all internal walls and ceilings", contractor: "Sean Murphy" },
  "Plasterers › Plaster": { code: "PLS", desc: "Board, skim and bead throughout", contractor: "Sean Murphy" },
  // 2nd Fix
  "2nd Fix": { code: "2F", desc: "Second fix — carpentry, electrical and plumbing finals", contractor: "Alan Cooper" },
  "2nd Fix › Joiners": { code: "2FJ", desc: "Second-fix carpentry — doors, skirting, architrave", contractor: "Alan Cooper" },
  "2nd Fix › Sparks": { code: "2FE", desc: "Second-fix electrical — fittings, sockets, consumer unit", contractor: "Chris Walker" },
  "2nd Fix › Plumber": { code: "2FP", desc: "Second-fix plumbing — sanitaryware and boiler commissioning", contractor: "James Patel" },
  // Paint
  "Paint": { code: "DEC", desc: "Decoration — mist coat, undercoat and finish throughout", contractor: "Mark Roberts" },
  "Paint › Painters": { code: "DECP", desc: "Mist coat, undercoat and finish all internal surfaces", contractor: "Mark Roberts" },
  // Final (site-team led — no external contractor)
  "Final": { code: "SH", desc: "Final clean, snagging and handover preparation", contractor: null },
  // Externals
  "Externals": { code: "EXT", desc: "External works — driveway, paths and hard landscaping", contractor: "Wayne Fisher" },
  "Externals › Driveway, edgings & paths": { code: "EXTD", desc: "Lay driveway sub-base, edgings and paths", contractor: "Wayne Fisher" },
  "Externals › Tarmac": { code: "EXTT", desc: "Surface the driveway with tarmac", contractor: "Wayne Fisher" },
  "Externals › Flagging": { code: "EXTF", desc: "Lay patio and path flagging", contractor: "Wayne Fisher" },
  // Fencer
  "Fencer": { code: "FEN", desc: "Boundary fencing and gates", contractor: "Wayne Fisher" },
  "Fencer › Boundary fence & gate": { code: "FENB", desc: "Install boundary fencing and gates", contractor: "Wayne Fisher" },
};

// ── Order supplier: keyed by the order's itemsDescription text.
const ORDER_SUPPLIER: Record<string, string> = {
  "Lintels / formers / meter boxes": "Forterra Building Products",
  "Joists": "Jewson",
  "Trusses": "Jewson",
  "Felt, batten, tile": "Marley Roof Tiles",
  "Scant timber, internal door frames": "Jewson",
  "Boards, skim & beads": "British Gypsum",
  "Internal doors, skirts, architrave": "Howdens Joinery",
  "Post, feather edge and postmix": "Travis Perkins",
};

async function main() {
  const template = await prisma.plotTemplate.findFirst({
    where: { name: { startsWith: "2 Story House" }, archivedAt: null },
  });
  if (!template) throw new Error("Live '2 Story House' template not found");
  const templateId = template.id;
  console.log(`Template: ${template.name}  (${templateId})\n`);

  // Resolve contractor + supplier names → ids up front.
  const contacts = await prisma.contact.findMany({ where: { archivedAt: null }, select: { id: true, name: true } });
  const suppliers = await prisma.supplier.findMany({ where: { archivedAt: null }, select: { id: true, name: true } });
  const contactId = (name: string | null) => {
    if (!name) return null;
    const c = contacts.find((x) => x.name === name);
    if (!c) throw new Error(`Contact not found: ${name}`);
    return c.id;
  };
  const supplierId = (name: string) => {
    const s = suppliers.find((x) => x.name === name);
    if (!s) throw new Error(`Supplier not found: ${name}`);
    return s.id;
  };

  await prisma.$transaction(async (tx) => {
    // ── 1. FIX BASE TEMPLATE ────────────────────────────────────────
    const baseJobs = await tx.templateJob.findMany({
      where: { templateId, variantId: null },
      include: { orders: true },
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
    });
    const parentName = (pid: string | null) =>
      pid ? baseJobs.find((j) => j.id === pid)?.name ?? "?" : null;

    let jobsFixed = 0, ordersFixed = 0, unmapped = 0;
    for (const job of baseJobs) {
      const key = job.parentId ? `${parentName(job.parentId)} › ${job.name}` : job.name;
      const data = JOB_DATA[key];
      if (!data) {
        console.log(`  ⚠ no mapping for "${key}" — left as-is`);
        unmapped++;
        continue;
      }
      await tx.templateJob.update({
        where: { id: job.id },
        data: {
          stageCode: data.code,
          description: data.desc,
          contactId: contactId(data.contractor),
        },
      });
      jobsFixed++;
      for (const order of job.orders) {
        const supName = order.itemsDescription ? ORDER_SUPPLIER[order.itemsDescription] : undefined;
        if (supName) {
          await tx.templateOrder.update({
            where: { id: order.id },
            data: { supplierId: supplierId(supName) },
          });
          ordersFixed++;
        }
      }
    }
    console.log(`✓ Base fixed: ${jobsFixed} jobs, ${ordersFixed} order suppliers wired${unmapped ? `, ${unmapped} unmapped` : ""}\n`);

    // ── helper: deep-clone every base job + order into a variant ─────
    async function cloneBaseInto(variantId: string, oneDay: boolean) {
      const src = await tx.templateJob.findMany({
        where: { templateId, variantId: null },
        orderBy: { sortOrder: "asc" },
        include: { orders: { include: { items: true } } },
      });
      const oldToNew = new Map<string, string>();
      // parents first
      for (const j of src.filter((x) => x.parentId === null)) {
        const created = await tx.templateJob.create({
          data: {
            templateId, variantId,
            name: j.name, description: j.description, stageCode: j.stageCode,
            sortOrder: j.sortOrder, startWeek: j.startWeek, endWeek: j.endWeek,
            durationWeeks: oneDay ? null : j.durationWeeks,
            // parent stages keep null duration (span derives from children);
            // leaf-only durationDays is overridden below for the 1-day variant.
            durationDays: oneDay ? null : j.durationDays,
            weatherAffected: j.weatherAffected, weatherAffectedType: j.weatherAffectedType,
            contactId: j.contactId, parentId: null,
          },
        });
        oldToNew.set(j.id, created.id);
      }
      // children
      for (const j of src.filter((x) => x.parentId !== null)) {
        const isLeaf = !src.some((c) => c.parentId === j.id);
        const created = await tx.templateJob.create({
          data: {
            templateId, variantId,
            name: j.name, description: j.description, stageCode: j.stageCode,
            sortOrder: j.sortOrder, startWeek: j.startWeek, endWeek: j.endWeek,
            // "1 day" variant: every LEAF job becomes exactly 1 working day.
            durationWeeks: oneDay ? null : j.durationWeeks,
            durationDays: oneDay ? (isLeaf ? 1 : null) : j.durationDays,
            weatherAffected: j.weatherAffected, weatherAffectedType: j.weatherAffectedType,
            contactId: j.contactId,
            parentId: j.parentId ? oldToNew.get(j.parentId) ?? null : null,
          },
        });
        oldToNew.set(j.id, created.id);
      }
      // a top-level atomic stage (no children, e.g. "Final") is itself a leaf
      if (oneDay) {
        for (const j of src.filter((x) => x.parentId === null)) {
          const hasChildren = src.some((c) => c.parentId === j.id);
          if (!hasChildren) {
            await tx.templateJob.update({
              where: { id: oldToNew.get(j.id)! },
              data: { durationDays: 1, durationWeeks: null },
            });
          }
        }
      }
      // orders (remap templateJobId + anchorJobId)
      let orderCount = 0;
      for (const j of src) {
        for (const o of j.orders) {
          const newJobId = oldToNew.get(j.id);
          if (!newJobId) continue;
          await tx.templateOrder.create({
            data: {
              templateJobId: newJobId,
              supplierId: o.supplierId,
              itemsDescription: o.itemsDescription,
              orderWeekOffset: o.orderWeekOffset,
              deliveryWeekOffset: o.deliveryWeekOffset,
              anchorType: o.anchorType, anchorAmount: o.anchorAmount,
              anchorUnit: o.anchorUnit, anchorDirection: o.anchorDirection,
              anchorJobId: o.anchorJobId ? oldToNew.get(o.anchorJobId) ?? null : null,
              leadTimeAmount: o.leadTimeAmount, leadTimeUnit: o.leadTimeUnit,
              items: { create: o.items.map((it) => ({ name: it.name, quantity: it.quantity, unit: it.unit, unitCost: it.unitCost })) },
            },
          });
          orderCount++;
        }
      }
      // Only the "1 day" variant needs its week cache recomputed —
      // its durations changed. The house-type variants are faithful
      // copies of base, so we keep base's startWeek/endWeek verbatim.
      if (oneDay) {
        await resequenceTopLevelStages(tx, templateId, variantId);
      }
      return { jobs: oldToNew.size, orders: orderCount };
    }

    // ── 2. + 3. CREATE THE 4 VARIANTS ───────────────────────────────
    const variantSpecs = [
      { name: "1 day", desc: "Same build as base — every job compressed to one working day (fast-forward testing).", oneDay: true },
      { name: "765", desc: "House type 765.", oneDay: false },
      { name: "923", desc: "House type 923.", oneDay: false },
      { name: "1047", desc: "House type 1047.", oneDay: false },
    ];
    let sortOrder = 0;
    for (const spec of variantSpecs) {
      const existing = await tx.templateVariant.findFirst({
        where: { templateId, name: spec.name },
      });
      if (existing) {
        console.log(`  ⚠ variant "${spec.name}" already exists — skipped`);
        continue;
      }
      const variant = await tx.templateVariant.create({
        data: { templateId, name: spec.name, description: spec.desc, sortOrder: sortOrder++ },
      });
      const result = await cloneBaseInto(variant.id, spec.oneDay);
      await tx.templateAuditEvent.create({
        data: {
          templateId,
          action: "variant_added",
          detail: `Added variant "${spec.name}" (${result.jobs} jobs, ${result.orders} orders)${spec.oneDay ? " — all jobs 1 working day" : ""}`,
        },
      });
      console.log(`✓ Variant "${spec.name}": ${result.jobs} jobs, ${result.orders} orders`);
    }
  }, { timeout: 120_000 });

  console.log(`\nDone.`);
}

main()
  .catch((e) => { console.error("FAILED:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
