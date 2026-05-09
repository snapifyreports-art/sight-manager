/**
 * One-shot: rerun resequence on the 2-storey template (and any variants).
 * This persists the fixed cached startWeek/endWeek values so the Gantt
 * renders correctly until the editor's recalculate flow can be repaired.
 */
import { PrismaClient } from "@prisma/client";
import { resequenceTopLevelStages } from "../src/lib/template-pack-children";

const prisma = new PrismaClient();

async function main() {
  const tpls = await prisma.plotTemplate.findMany({
    where: { name: { contains: "2 Story House" } },
    include: { variants: true },
  });
  for (const tpl of tpls) {
    console.log(`\nResequencing ${tpl.name} (id=${tpl.id})`);
    // One transaction per scope — keeps each well under the timeout.
    await prisma.$transaction(
      async (tx) => {
        await resequenceTopLevelStages(tx, tpl.id, null);
      },
      { timeout: 30_000 },
    );
    for (const v of tpl.variants) {
      console.log(`  → variant: ${v.name}`);
      await prisma.$transaction(
        async (tx) => {
          await resequenceTopLevelStages(tx, tpl.id, v.id);
        },
        { timeout: 30_000 },
      );
    }
  }
  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
