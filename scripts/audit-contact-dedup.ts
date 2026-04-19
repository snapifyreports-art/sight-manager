/**
 * Read-only audit — checks for Contact records that might be duplicates
 * or that could represent the same real-world entity across SUPPLIER /
 * CONTRACTOR types.
 *
 * Runs via: npx tsx scripts/audit-contact-dedup.ts
 *
 * Reports:
 *   1. Duplicate emails across the Contact table
 *   2. Duplicate phone numbers
 *   3. Same name but different type (Jane Smith — once as SUPPLIER, once as CONTRACTOR)
 *   4. Total counts per type
 *
 * DOES NOT MUTATE — just prints a report.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("\n=== Contact dedup audit ===\n");

  const all = await prisma.contact.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      type: true,
      company: true,
    },
    orderBy: { name: "asc" },
  });

  console.log(`Total contacts: ${all.length}`);
  const byType = { SUPPLIER: 0, CONTRACTOR: 0 } as Record<string, number>;
  for (const c of all) byType[c.type] = (byType[c.type] || 0) + 1;
  console.log(`  SUPPLIER:   ${byType.SUPPLIER ?? 0}`);
  console.log(`  CONTRACTOR: ${byType.CONTRACTOR ?? 0}`);

  // 1. Duplicate emails
  const emailMap = new Map<string, typeof all>();
  for (const c of all) {
    if (!c.email) continue;
    const key = c.email.trim().toLowerCase();
    const bucket = emailMap.get(key) ?? [];
    bucket.push(c);
    emailMap.set(key, bucket);
  }
  const dupEmails = [...emailMap.entries()].filter(([, v]) => v.length > 1);
  console.log(`\n--- Duplicate emails (${dupEmails.length}) ---`);
  if (dupEmails.length === 0) {
    console.log("  (none — email uniqueness is clean)");
  } else {
    for (const [email, rows] of dupEmails) {
      console.log(`  ${email}`);
      for (const r of rows) {
        console.log(`    · ${r.type.padEnd(11)} ${r.name}${r.company ? ` (${r.company})` : ""}  id=${r.id}`);
      }
    }
  }

  // 2. Duplicate phones
  const phoneMap = new Map<string, typeof all>();
  for (const c of all) {
    if (!c.phone) continue;
    const key = c.phone.replace(/\s+/g, "");
    const bucket = phoneMap.get(key) ?? [];
    bucket.push(c);
    phoneMap.set(key, bucket);
  }
  const dupPhones = [...phoneMap.entries()].filter(([, v]) => v.length > 1);
  console.log(`\n--- Duplicate phones (${dupPhones.length}) ---`);
  if (dupPhones.length === 0) {
    console.log("  (none)");
  } else {
    for (const [phone, rows] of dupPhones) {
      console.log(`  ${phone}`);
      for (const r of rows) {
        console.log(`    · ${r.type.padEnd(11)} ${r.name}  id=${r.id}`);
      }
    }
  }

  // 3. Same name across types
  const nameTypes = new Map<string, Set<string>>();
  const nameRows = new Map<string, typeof all>();
  for (const c of all) {
    const key = c.name.trim().toLowerCase();
    const set = nameTypes.get(key) ?? new Set<string>();
    set.add(c.type);
    nameTypes.set(key, set);
    const bucket = nameRows.get(key) ?? [];
    bucket.push(c);
    nameRows.set(key, bucket);
  }
  const crossType = [...nameTypes.entries()].filter(([, s]) => s.size > 1);
  console.log(`\n--- Same name across SUPPLIER/CONTRACTOR types (${crossType.length}) ---`);
  if (crossType.length === 0) {
    console.log("  (none)");
  } else {
    for (const [name] of crossType) {
      const rows = nameRows.get(name)!;
      console.log(`  ${rows[0].name}`);
      for (const r of rows) {
        console.log(`    · ${r.type.padEnd(11)} id=${r.id}${r.email ? ` ${r.email}` : ""}`);
      }
    }
  }

  // 4. Summary
  const hasDrift = dupEmails.length > 0 || dupPhones.length > 0 || crossType.length > 0;
  console.log("\n=== Summary ===");
  if (hasDrift) {
    console.log("⚠️  Found potential dedup issues above. Review manually before de-duping —");
    console.log("    the same email can legitimately belong to two types (person uses one email");
    console.log("    for their company-as-supplier AND their sole-trader contractor work).");
    console.log("    Decide per-case: merge, tolerate, or enforce uniqueness.");
  } else {
    console.log("✅  Contact table is clean — no duplicate emails, phones, or cross-type names.");
  }
  console.log();

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
