import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const types = await p.contact.groupBy({ by: ["type"], _count: { _all: true } });
  console.log("Contact types:");
  console.log(JSON.stringify(types, null, 2));
  const supplierContacts = await p.contact.findMany({
    where: { type: "SUPPLIER" },
    select: { id: true, name: true, company: true, email: true },
  });
  const supplierTable = await p.supplier.count();
  console.log(`\nSupplier TABLE rows: ${supplierTable}`);
  console.log(`Contact rows with type=SUPPLIER (${supplierContacts.length}):`);
  console.log(JSON.stringify(supplierContacts, null, 2));
  await p.$disconnect();
}
main();
