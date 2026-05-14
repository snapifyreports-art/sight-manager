/**
 * Verification — order-lateness reasons + decision schema landed.
 *
 * Confirms the columns, FK and seed data the order-sent-late popup +
 * late-delivery reason picker depend on are actually in the DB. Run
 * after apply-order-lateness-reasons-schema.ts. Read-only.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // 1. DelayReason.scope column + the two seeded scoped lists.
  const sendReasons = await prisma.delayReason.findMany({
    where: { scope: "ORDER_SEND" },
    orderBy: { label: "asc" },
    select: { label: true, isSystem: true },
  });
  const deliveryReasons = await prisma.delayReason.findMany({
    where: { scope: "ORDER_DELIVERY" },
    orderBy: { label: "asc" },
    select: { label: true, isSystem: true },
  });
  const generalReasons = await prisma.delayReason.count({ where: { scope: null } });

  console.log(`DelayReason.scope:`);
  console.log(`  ORDER_SEND     (${sendReasons.length}): ${sendReasons.map((r) => r.label).join(", ")}`);
  console.log(`  ORDER_DELIVERY (${deliveryReasons.length}): ${deliveryReasons.map((r) => r.label).join(", ")}`);
  console.log(`  scope=null / general job reasons untouched: ${generalReasons}`);

  // 2. LatenessEvent.delayReasonId + excused columns — a findFirst that
  //    selects them proves the columns exist (Prisma would throw if not).
  const sample = await prisma.latenessEvent.findFirst({
    select: { id: true, delayReasonId: true, excused: true, kind: true },
  });
  console.log(
    `\nLatenessEvent columns: delayReasonId + excused readable ✓` +
      (sample ? ` (sample ${sample.id.slice(0, 8)}: excused=${sample.excused})` : " (table empty)"),
  );

  // 3. FK delayReasonId → DelayReason — a relational query proves the
  //    relation is wired (Prisma client would reject an unknown relation).
  const withReason = await prisma.latenessEvent.findMany({
    where: { delayReasonId: { not: null } },
    select: { id: true, delayReason: { select: { label: true } } },
    take: 3,
  });
  console.log(
    `LatenessEvent.delayReason relation: queryable ✓ (${withReason.length} event(s) currently carry a specific reason)`,
  );

  const ok =
    sendReasons.length >= 6 &&
    deliveryReasons.length >= 6 &&
    sendReasons.every((r) => r.isSystem) &&
    deliveryReasons.every((r) => r.isSystem);
  console.log(`\n${ok ? "✓ Schema + seed verified." : "✗ Something is missing — check the apply script ran."}`);
  if (!ok) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
