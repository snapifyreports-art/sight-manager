/**
 * (#172) Backfill customer share-link tokens on existing plots so the
 * auto-generated state is true for every plot, old and new.
 *
 * Runs in a single transaction-y loop — generates a 24-byte base64url
 * token per plot, sets shareEnabled=true. Skips plots that already have
 * a token (idempotent).
 */

import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plots = await prisma.plot.findMany({
    where: { shareToken: null },
    select: { id: true },
  });
  console.log(`Found ${plots.length} plots without a customer share token.`);
  let done = 0;
  for (const p of plots) {
    await prisma.plot.update({
      where: { id: p.id },
      data: {
        shareToken: randomBytes(24).toString("base64url"),
        shareEnabled: true,
      },
    });
    done++;
    if (done % 25 === 0) console.log(`  …${done}/${plots.length}`);
  }
  console.log(`Backfilled ${done} plots.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
