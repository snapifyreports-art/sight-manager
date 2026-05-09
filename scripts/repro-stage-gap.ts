/**
 * Reproduction test for the stage-gap bug Keith reported May 2026.
 *
 * Reads the 2-storey template's current state, then runs the
 * resequenceTopLevelStages helper directly to see if it updates the
 * cached startWeek/endWeek correctly. Doesn't touch the API — pure
 * DB-level test of the helper.
 */

import { PrismaClient } from "@prisma/client";
import { resequenceTopLevelStages } from "../src/lib/template-pack-children";

const prisma = new PrismaClient();

async function dump(label: string, templateId: string, variantId: string | null) {
  console.log(`\n=== ${label} ===`);
  const stages = await prisma.templateJob.findMany({
    where: { templateId, variantId, parentId: null },
    orderBy: { sortOrder: "asc" },
    include: {
      children: { orderBy: { sortOrder: "asc" } },
    },
  });
  for (const s of stages) {
    const days = s.children.reduce((a, c) => {
      if (c.durationDays && c.durationDays > 0) return a + c.durationDays;
      if (c.durationWeeks && c.durationWeeks > 0) return a + c.durationWeeks * 5;
      return a + 5;
    }, 0);
    console.log(
      `  ${s.name.padEnd(20)} cached w${s.startWeek}-${s.endWeek}  | children total=${days}d (${Math.ceil(days / 5)}w)`,
    );
    for (const c of s.children) {
      const cd =
        c.durationDays && c.durationDays > 0
          ? c.durationDays
          : c.durationWeeks && c.durationWeeks > 0
            ? c.durationWeeks * 5
            : 5;
      console.log(
        `      └─ ${c.name.padEnd(28)} cached w${c.startWeek}-${c.endWeek}  | ${cd}d`,
      );
    }
  }
}

async function main() {
  const tpl = await prisma.plotTemplate.findFirst({
    where: { name: { contains: "2 Story House" } },
  });
  if (!tpl) throw new Error("template not found");
  console.log(`Template: ${tpl.name} (id=${tpl.id})`);

  await dump("BEFORE", tpl.id, null);

  // Run resequence and dump
  await prisma.$transaction(async (tx) => {
    await resequenceTopLevelStages(tx, tpl.id, null);
  });

  await dump("AFTER resequence", tpl.id, null);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
