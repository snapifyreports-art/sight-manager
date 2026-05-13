/**
 * (May 2026 Keith bug report) One-off: flip any existing draft
 * templates that have at least one job to Live, so they appear in
 * the create-site wizard immediately.
 *
 * Rationale: pre-fix every new template defaulted to Draft. Users
 * created templates expecting them to work, but the wizard filtered
 * them out via `liveOnly=true`. Going forward new templates default
 * to Live (batch fix in /api/plot-templates/route.ts POST). For
 * existing data, promote drafts that have content; leave empty
 * drafts alone (they're genuinely half-built).
 *
 * Idempotent — re-running is a no-op once promoted.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const drafts = await prisma.plotTemplate.findMany({
    where: { isDraft: true, archivedAt: null },
    include: { _count: { select: { jobs: true } } },
  });
  let promoted = 0;
  let skipped = 0;
  for (const t of drafts) {
    if (t._count.jobs === 0) {
      console.log(`  · skip "${t.name}" — no jobs (genuine draft)`);
      skipped++;
      continue;
    }
    await prisma.plotTemplate.update({
      where: { id: t.id },
      data: { isDraft: false },
    });
    console.log(`  · "${t.name}" → Live (${t._count.jobs} jobs)`);
    promoted++;
  }
  console.log(`\nPromoted ${promoted} draft templates; skipped ${skipped} empty drafts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
