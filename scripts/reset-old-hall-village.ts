/**
 * One-shot: delete the 21 (broken-from-deleted-template) plots in
 * Old Hall Village and re-apply 21 fresh ones from the 2-Story House
 * (copy) template. Distribute across the 4 variants for visual
 * variety, stagger starts by 5 working days for a realistic phasing
 * pattern.
 */

import { PrismaClient } from "@prisma/client";
import { createJobsFromTemplate } from "../src/lib/apply-template-helpers";
import { addWorkingDays, snapToWorkingDay } from "../src/lib/working-days";

const prisma = new PrismaClient();

const SITE_NAME = "Old Hall Village";
const TEMPLATE_NAME = "2 Story House (765 / 775 / 923 / 990 / 1047) (copy)";
const VARIANT_NAMES = ["765", "775", "923", "990"];
const STAGGER_WORKING_DAYS = 5;

async function main() {
  // 1. Locate the site + template + variants
  const site = await prisma.site.findFirst({
    where: { name: SITE_NAME },
    include: {
      plots: { select: { id: true, plotNumber: true } },
    },
  });
  if (!site) throw new Error(`Site "${SITE_NAME}" not found`);

  const template = await prisma.plotTemplate.findFirst({
    where: { name: TEMPLATE_NAME },
    include: {
      variants: true,
      jobs: {
        where: { variantId: null, parentId: null },
        select: { id: true },
      },
    },
  });
  if (!template) throw new Error(`Template "${TEMPLATE_NAME}" not found`);
  console.log(
    `Site: ${site.name} (id=${site.id})\n` +
      `Template: ${template.name} (id=${template.id})\n` +
      `Variants available: ${template.variants.map((v) => v.name).join(", ")}\n`,
  );

  // Map variant name → id, in the order specified.
  const variants = VARIANT_NAMES.map((name) => {
    const v = template.variants.find((vv) => vv.name === name);
    if (!v) throw new Error(`Variant "${name}" not found on template`);
    return { id: v.id, name: v.name };
  });

  // 2. Delete existing plots (cascades to jobs / orders / events / snags)
  const oldPlotIds = site.plots.map((p) => p.id);
  if (oldPlotIds.length > 0) {
    console.log(`Deleting ${oldPlotIds.length} existing plots…`);
    const result = await prisma.plot.deleteMany({
      where: { id: { in: oldPlotIds } },
    });
    console.log(`  ✓ deleted ${result.count} plots\n`);
  }

  // 3. Plan the re-apply: 21 plots, distributed across 4 variants.
  // 6 + 5 + 5 + 5 = 21 (765 gets one extra). Stagger starts in 5d
  // chunks so phase visualises. Plot 1 starts on the next working
  // Monday from now.
  const baseStart = snapToWorkingDay(new Date(), "forward");
  const distribution: Array<{ plotNumber: string; variantId: string; variantName: string; startDate: Date }> = [];
  let plotNum = 1;
  for (let i = 0; i < 21; i++) {
    const variant = variants[i % variants.length];
    const startDate = addWorkingDays(baseStart, i * STAGGER_WORKING_DAYS);
    distribution.push({
      plotNumber: String(plotNum++),
      variantId: variant.id,
      variantName: variant.name,
      startDate,
    });
  }

  // 4. Re-apply each plot. Same shape as apply-template-batch but
  // direct via Prisma to avoid HTTP overhead. Per-plot transactions
  // so a failure on one doesn't roll the rest back.
  console.log(`Creating ${distribution.length} plots…`);
  let created = 0;
  let failed = 0;
  for (const plan of distribution) {
    try {
      // Pull variant-scoped data fresh per plot — same call shape the
      // API uses post the May 2026 full-fat variants rework.
      const [jobs, materials, documents] = await Promise.all([
        prisma.templateJob.findMany({
          where: {
            templateId: template.id,
            variantId: plan.variantId,
            parentId: null,
          },
          orderBy: { sortOrder: "asc" },
          include: {
            contact: { select: { id: true, name: true, company: true } },
            orders: {
              include: {
                items: true,
                supplier: true,
                anchorJob: {
                  select: { id: true, name: true, startWeek: true, stageCode: true },
                },
              },
            },
            children: {
              orderBy: { sortOrder: "asc" },
              include: {
                contact: { select: { id: true, name: true, company: true } },
                orders: {
                  include: {
                    items: true,
                    supplier: true,
                    anchorJob: {
                      select: { id: true, name: true, startWeek: true, stageCode: true },
                    },
                  },
                },
              },
            },
          },
        }),
        prisma.templateMaterial.findMany({
          where: { templateId: template.id, variantId: plan.variantId },
        }),
        prisma.templateDocument.findMany({
          where: { templateId: template.id, variantId: plan.variantId },
        }),
      ]);

      await prisma.$transaction(
        async (tx) => {
          const plot = await tx.plot.create({
            data: {
              name: `Plot ${plan.plotNumber}`,
              siteId: site.id,
              plotNumber: plan.plotNumber,
              houseType: "2 STOREY",
              sourceTemplateId: template.id,
              sourceVariantId: plan.variantId,
            },
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await createJobsFromTemplate(
            tx,
            plot.id,
            plan.startDate,
            jobs as any,
            null,
            site.assignedToId ?? null,
          );

          if (materials.length > 0) {
            await tx.plotMaterial.createMany({
              data: materials.map((m) => ({
                plotId: plot.id,
                sourceType: "TEMPLATE" as const,
                name: m.name,
                quantity: m.quantity,
                unit: m.unit,
                unitCost: m.unitCost,
                category: m.category,
                notes: m.notes,
                linkedStageCode: m.linkedStageCode,
              })),
            });
          }

          if (documents.length > 0) {
            // Documents reset to placeholder rows (consistent with
            // the variant docs which were placeholders themselves).
            // SiteDocument requires uploadedById — find any user.
            const someUser = await tx.user.findFirst({ select: { id: true } });
            if (someUser) {
              await tx.siteDocument.createMany({
                data: documents.map((d) => ({
                  name: d.name,
                  url: d.url,
                  fileName: d.fileName,
                  fileSize: d.fileSize,
                  mimeType: d.mimeType,
                  category: d.category || "DRAWING",
                  siteId: site.id,
                  plotId: plot.id,
                  uploadedById: someUser.id,
                })),
              });
            }
          }
        },
        { timeout: 60_000 },
      );
      console.log(
        `  ✓ Plot ${plan.plotNumber.padStart(2, " ")} — ${plan.variantName} — start ${plan.startDate.toISOString().slice(0, 10)}`,
      );
      created += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `  ✗ Plot ${plan.plotNumber} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  console.log(`\nDone. ${created} created, ${failed} failed.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
