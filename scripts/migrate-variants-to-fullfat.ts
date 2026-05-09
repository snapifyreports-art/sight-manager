/**
 * One-off migration: existing TemplateVariant rows held only override
 * data (jobOverrides + materialOverrides). The new full-fat model has
 * each variant owning its own complete set of jobs / orders / materials
 * / documents.
 *
 * For every existing variant:
 *   1. Find its base template's jobs (variantId IS NULL) + orders.
 *   2. Deep-clone the job tree under the variant, mapping old job IDs
 *      → new variant-scoped job IDs.
 *   3. For every cloned sub-job that has a jobOverride, apply the
 *      override's durationDays to the cloned row.
 *   4. Clone every TemplateOrder onto the new variant-scoped jobs,
 *      remapping anchorJobId via the same map.
 *   5. Clone every TemplateMaterial onto the variant. Apply
 *      materialOverrides where present (qty + unitCost).
 *   6. Clone every TemplateDocument onto the variant.
 *
 * After this runs, the old override tables are deprecated. Their data
 * has been baked into the variant-scoped rows. We don't drop the
 * tables yet — keeping them as a safety net in case a re-run is
 * needed.
 *
 * Idempotent guard: if a variant already has any variant-scoped jobs,
 * it's been migrated already and we skip it.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const variants = await prisma.templateVariant.findMany({
    include: {
      jobOverrides: true,
      materialOverrides: true,
    },
  });

  if (variants.length === 0) {
    console.log("No variants to migrate.");
    return;
  }

  console.log(`Found ${variants.length} variant(s) to migrate.\n`);

  for (const variant of variants) {
    const existingScoped = await prisma.templateJob.count({
      where: { variantId: variant.id },
    });
    if (existingScoped > 0) {
      console.log(
        `  ↺ "${variant.name}" already has ${existingScoped} variant-scoped jobs — skipping.`,
      );
      continue;
    }

    console.log(`  → Migrating variant "${variant.name}" …`);

    // Pull base-scoped jobs (variantId IS NULL), with their orders + items
    const baseJobs = await prisma.templateJob.findMany({
      where: { templateId: variant.templateId, variantId: null },
      orderBy: { sortOrder: "asc" },
      include: {
        orders: { include: { items: true } },
      },
    });

    if (baseJobs.length === 0) {
      console.log(
        `      base template has no jobs — nothing to clone, skipping`,
      );
      continue;
    }

    const overrideMap = new Map(
      variant.jobOverrides.map((o) => [o.templateJobId, o.durationDays]),
    );

    // Two-pass clone: parents first, then children, so parent IDs are
    // known when assigning to children. Mirrors the clone route logic.
    const oldToNewJobId = new Map<string, string>();

    for (const job of baseJobs.filter((j) => j.parentId === null)) {
      const overrideDays = overrideMap.get(job.id);
      const created = await prisma.templateJob.create({
        data: {
          templateId: variant.templateId,
          variantId: variant.id,
          name: job.name,
          description: job.description,
          stageCode: job.stageCode,
          sortOrder: job.sortOrder,
          startWeek: job.startWeek,
          endWeek: job.endWeek,
          durationWeeks: job.durationWeeks,
          durationDays:
            overrideDays != null && overrideDays > 0
              ? overrideDays
              : job.durationDays,
          weatherAffected: job.weatherAffected,
          weatherAffectedType: job.weatherAffectedType,
          contactId: job.contactId,
          parentId: null,
        },
      });
      oldToNewJobId.set(job.id, created.id);
    }
    for (const job of baseJobs.filter((j) => j.parentId !== null)) {
      const newParentId = job.parentId
        ? oldToNewJobId.get(job.parentId)
        : null;
      const overrideDays = overrideMap.get(job.id);
      const created = await prisma.templateJob.create({
        data: {
          templateId: variant.templateId,
          variantId: variant.id,
          name: job.name,
          description: job.description,
          stageCode: job.stageCode,
          sortOrder: job.sortOrder,
          startWeek: job.startWeek,
          endWeek: job.endWeek,
          durationWeeks: job.durationWeeks,
          durationDays:
            overrideDays != null && overrideDays > 0
              ? overrideDays
              : job.durationDays,
          weatherAffected: job.weatherAffected,
          weatherAffectedType: job.weatherAffectedType,
          contactId: job.contactId,
          parentId: newParentId ?? null,
        },
      });
      oldToNewJobId.set(job.id, created.id);
    }

    let orderCount = 0;
    for (const job of baseJobs) {
      for (const order of job.orders) {
        const newJobId = oldToNewJobId.get(order.templateJobId);
        if (!newJobId) continue;
        const newAnchorJobId = order.anchorJobId
          ? oldToNewJobId.get(order.anchorJobId) ?? null
          : null;
        await prisma.templateOrder.create({
          data: {
            templateJobId: newJobId,
            supplierId: order.supplierId,
            orderWeekOffset: order.orderWeekOffset,
            deliveryWeekOffset: order.deliveryWeekOffset,
            itemsDescription: order.itemsDescription,
            anchorType: order.anchorType,
            anchorAmount: order.anchorAmount,
            anchorUnit: order.anchorUnit,
            anchorDirection: order.anchorDirection,
            anchorJobId: newAnchorJobId,
            leadTimeAmount: order.leadTimeAmount,
            leadTimeUnit: order.leadTimeUnit,
            items: {
              create: order.items.map((it) => ({
                name: it.name,
                quantity: it.quantity,
                unit: it.unit,
                unitCost: it.unitCost,
              })),
            },
          },
        });
        orderCount += 1;
      }
    }

    // Materials — clone with overrides applied
    const baseMaterials = await prisma.templateMaterial.findMany({
      where: { templateId: variant.templateId, variantId: null },
    });
    const matOverrideMap = new Map(
      variant.materialOverrides.map((o) => [
        o.templateMaterialId,
        { qty: o.quantity, unitCost: o.unitCost },
      ]),
    );
    let matCount = 0;
    for (const m of baseMaterials) {
      const ov = matOverrideMap.get(m.id);
      await prisma.templateMaterial.create({
        data: {
          templateId: variant.templateId,
          variantId: variant.id,
          name: m.name,
          quantity: ov?.qty ?? m.quantity,
          unit: m.unit,
          unitCost: ov?.unitCost ?? m.unitCost,
          category: m.category,
          notes: m.notes,
          linkedStageCode: m.linkedStageCode,
        },
      });
      matCount += 1;
    }

    // Documents — clone (placeholders handled the same way as the clone
    // route — actually we DO duplicate the storage URL here because the
    // user expects to see the variant's drawings. Per-variant uploads
    // can replace these via the new variant editor.
    const baseDocs = await prisma.templateDocument.findMany({
      where: { templateId: variant.templateId, variantId: null },
    });
    let docCount = 0;
    for (const d of baseDocs) {
      await prisma.templateDocument.create({
        data: {
          templateId: variant.templateId,
          variantId: variant.id,
          name: d.name,
          url: d.url,
          fileName: d.fileName,
          fileSize: d.fileSize,
          mimeType: d.mimeType,
          category: d.category,
          isPlaceholder: d.isPlaceholder,
        },
      });
      docCount += 1;
    }

    console.log(
      `      ✓ cloned ${oldToNewJobId.size} jobs, ${orderCount} orders, ${matCount} materials, ${docCount} documents`,
    );
  }

  console.log("\nDone.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
