/**
 * Launch-day seed — Keith's request 20 Apr 2026.
 *
 * - Nukes ALL existing sites (cascades plots/jobs/orders/snags/photos/docs).
 * - Creates 3 sites: Ryan's, Keith's, Paul's.
 * - Grants Paul UserSite to his site only (Keith + Ryan are CEO → see all by role).
 * - Seeds 20 plots per site from the 4 Meadowbrook templates (Briarwood,
 *   Oakwood, Riverside, Willow). 4 plots per week starting Mon 11 May 2026,
 *   for 5 weeks. Each weekly batch has one of each template for variety.
 *
 * Idempotent-ish: it deletes by name match before creating, so re-running
 * the script won't dupe. Users are NOT touched.
 */

import { PrismaClient } from "@prisma/client";
import { templateJobsInclude } from "../src/lib/template-includes";
import { createJobsFromTemplate } from "../src/lib/apply-template-helpers";

const prisma = new PrismaClient();

// ── Config ────────────────────────────────────────────────────────────────
const FIRST_MONDAY = new Date("2026-05-11T00:00:00Z"); // Mon 11 May 2026
const WEEKS = 5;
const PLOTS_PER_WEEK = 4;
const TEMPLATE_NAMES = [
  "The Briarwood", // Detached 4-Bed
  "The Oakwood",   // Semi-Detached 3-Bed
  "The Riverside", // Apartment 2-Bed
  "The Willow",    // 2-Bed Starter Home
];
const SITE_OWNERS = [
  { siteName: "Ryan's Site", ownerName: "Ryan" },
  { siteName: "Keith's Site", ownerName: "Keith" },
  { siteName: "Paul's Site", ownerName: "Paul" },
];

function addDaysUTC(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

async function main() {
  console.log("━━━ LAUNCH SEED ━━━\n");

  // ── 1. Fetch users ─────────────────────────────────────────────────────
  const users = await prisma.user.findMany({
    where: { name: { in: ["Keith", "Ryan", "Paul"] } },
    select: { id: true, name: true, role: true },
  });
  const usersByName = new Map(users.map((u) => [u.name, u]));
  for (const { ownerName } of SITE_OWNERS) {
    if (!usersByName.has(ownerName)) throw new Error(`User "${ownerName}" not found`);
  }
  console.log(`✓ Found ${users.length} users: ${users.map((u) => `${u.name} (${u.role})`).join(", ")}`);

  // ── 2. Fetch templates ─────────────────────────────────────────────────
  const templates = await prisma.plotTemplate.findMany({
    where: { name: { in: TEMPLATE_NAMES } },
    include: {
      jobs: templateJobsInclude,
      materials: true,
      documents: true,
    },
  });
  if (templates.length !== TEMPLATE_NAMES.length) {
    throw new Error(`Expected ${TEMPLATE_NAMES.length} templates, found ${templates.length}`);
  }
  const templatesByName = new Map(templates.map((t) => [t.name, t]));
  console.log(`✓ Found ${templates.length} templates`);

  // ── 3. NUKE all existing sites ─────────────────────────────────────────
  console.log("\n━━━ NUKING EXISTING SITES ━━━");
  const existing = await prisma.site.findMany({ select: { id: true, name: true } });
  console.log(`Found ${existing.length} existing sites — deleting all…`);
  for (const s of existing) {
    await prisma.site.delete({ where: { id: s.id } });
    console.log(`  ✗ Deleted: ${s.name}`);
  }

  // ── 4. Create sites ────────────────────────────────────────────────────
  console.log("\n━━━ CREATING NEW SITES ━━━");
  const siteIdByOwner = new Map<string, string>();
  for (const { siteName, ownerName } of SITE_OWNERS) {
    const owner = usersByName.get(ownerName)!;
    const site = await prisma.site.create({
      data: {
        name: siteName,
        description: `Primary site for ${ownerName}`,
        status: "ACTIVE",
        assignedToId: owner.id,
        createdById: owner.id,
      },
    });
    siteIdByOwner.set(ownerName, site.id);
    console.log(`  ✓ Created: ${siteName} (owner=${ownerName})`);
  }

  // ── 5. Grant Paul UserSite to his site only ────────────────────────────
  //     Keith + Ryan are CEO — role-based bypass means they see all already.
  console.log("\n━━━ SITE ACCESS ━━━");
  const paul = usersByName.get("Paul")!;
  const paulSiteId = siteIdByOwner.get("Paul")!;
  await prisma.userSite.upsert({
    where: { userId_siteId: { userId: paul.id, siteId: paulSiteId } },
    create: { userId: paul.id, siteId: paulSiteId },
    update: {},
  });
  console.log(`  ✓ Paul → Paul's Site (UserSite grant)`);
  console.log(`  ✓ Keith + Ryan → all sites (CEO role bypass)`);

  // ── 6. Seed 20 plots per site ──────────────────────────────────────────
  console.log("\n━━━ SEEDING PLOTS ━━━");
  const keith = usersByName.get("Keith")!;

  for (const { siteName, ownerName } of SITE_OWNERS) {
    const siteId = siteIdByOwner.get(ownerName)!;
    const ownerId = usersByName.get(ownerName)!.id;
    console.log(`\n📍 ${siteName}`);

    let plotNum = 1;
    for (let w = 0; w < WEEKS; w++) {
      const batchStart = addDaysUTC(FIRST_MONDAY, w * 7);
      const isoDate = batchStart.toISOString().split("T")[0];
      console.log(`  Week ${w + 1} (start ${isoDate}):`);

      for (let i = 0; i < PLOTS_PER_WEEK; i++) {
        const templateName = TEMPLATE_NAMES[i % TEMPLATE_NAMES.length];
        const template = templatesByName.get(templateName)!;
        const plotNumber = String(plotNum).padStart(2, "0");
        const plotName = `Plot ${plotNumber} — ${template.typeLabel || templateName}`;

        await prisma.$transaction(async (tx) => {
          const plot = await tx.plot.create({
            data: {
              name: plotName,
              siteId,
              plotNumber,
              houseType: template.typeLabel || null,
              sourceTemplateId: template.id,
            },
          });

          await createJobsFromTemplate(
            tx,
            plot.id,
            batchStart,
            template.jobs as any,
            null,
            ownerId
          );

          // Copy template materials if any (these templates have none, but
          // be future-proof).
          if (template.materials.length > 0) {
            await tx.plotMaterial.createMany({
              data: template.materials.map((m) => ({
                plotId: plot.id,
                sourceType: "TEMPLATE",
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

          await tx.eventLog.create({
            data: {
              type: "PLOT_CREATED",
              description: `Plot "${plot.name}" created from template "${template.name}" (launch seed)`,
              siteId,
              plotId: plot.id,
              userId: keith.id,
            },
          });
        }, { timeout: 30_000 });

        console.log(`    ✓ Plot ${plotNumber} — ${template.name}`);
        plotNum++;
      }
    }
  }

  // ── 7. Summary ──────────────────────────────────────────────────────────
  console.log("\n━━━ SUMMARY ━━━");
  const summary = await prisma.site.findMany({
    select: {
      name: true,
      assignedTo: { select: { name: true } },
      _count: { select: { plots: true } },
      plots: { select: { _count: { select: { jobs: true } } } },
    },
  });
  for (const s of summary) {
    const totalJobs = s.plots.reduce((sum, p) => sum + p._count.jobs, 0);
    console.log(`  ${s.name} (${s.assignedTo?.name}): ${s._count.plots} plots, ${totalJobs} jobs`);
  }
  console.log("\n✓ Done.");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
