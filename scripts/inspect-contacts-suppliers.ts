/**
 * One-off — list available contractors (Contact, type CONTRACTOR-ish)
 * and suppliers so we can wire real ones into the 2 Story template.
 */
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const contacts = await prisma.contact.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, company: true, type: true },
    orderBy: { name: "asc" },
  });
  console.log(`=== CONTACTS (${contacts.length}) ===`);
  for (const c of contacts) {
    console.log(`  ${c.name}  | company=${c.company ?? "∅"}  | type=${c.type ?? "∅"}`);
  }

  const suppliers = await prisma.supplier.findMany({
    where: { archivedAt: null },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });
  console.log(`\n=== SUPPLIERS (${suppliers.length}) ===`);
  for (const s of suppliers) {
    console.log(`  ${s.name}  | type=${s.type ?? "∅"}`);
  }

  // Stage library for stageCode mapping
  const { UK_HOUSEBUILDING_STAGES } = await import("../src/lib/stage-library");
  console.log(`\n=== STAGE LIBRARY (${UK_HOUSEBUILDING_STAGES.length}) ===`);
  for (const s of UK_HOUSEBUILDING_STAGES) {
    console.log(`  ${s.code}  → ${s.name}  (subs: ${s.subJobs.map((sj) => sj.code).join(", ")})`);
  }
}
main().finally(() => prisma.$disconnect());
