/**
 * One-off migration — convert template sub-jobs' durationWeeks → durationDays.
 *
 * Keith's model: sub-jobs are always measured in working days. Existing
 * templates store durationWeeks because weeks used to be the only option.
 * After this migration, any sub-job with durationWeeks set and durationDays
 * still null gets durationDays = durationWeeks × 5 (Mon-Fri working week).
 *
 * Parent jobs (parentId null) are left untouched — they don't need
 * durationDays; their span is derived from children at apply time.
 *
 * Idempotent: re-running does nothing. Non-destructive: durationWeeks is
 * preserved so older code paths still read something valid.
 */

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const WORKING_DAYS_PER_WEEK = 5;

async function main() {
  console.log("━━━ Migrating template sub-jobs: durationWeeks → durationDays ━━━\n");

  // Only sub-jobs (parentId set) with weeks > 0 and no days value yet.
  const candidates = await prisma.templateJob.findMany({
    where: {
      parentId: { not: null },
      durationWeeks: { gt: 0 },
      durationDays: null,
    },
    select: {
      id: true,
      name: true,
      durationWeeks: true,
      template: { select: { name: true } },
    },
  });

  if (candidates.length === 0) {
    console.log("Nothing to migrate — all sub-jobs already have durationDays.");
    return;
  }

  console.log(`Found ${candidates.length} sub-jobs to migrate:`);
  for (const c of candidates) {
    const days = (c.durationWeeks ?? 0) * WORKING_DAYS_PER_WEEK;
    console.log(`  • "${c.name}" (${c.template.name}): ${c.durationWeeks}w → ${days}d`);
  }

  console.log("\nApplying…");
  let updated = 0;
  for (const c of candidates) {
    const days = (c.durationWeeks ?? 0) * WORKING_DAYS_PER_WEEK;
    await prisma.templateJob.update({
      where: { id: c.id },
      data: { durationDays: days },
    });
    updated++;
  }
  console.log(`\n✓ Migrated ${updated} sub-jobs.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error(e); process.exit(1); });
