import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.plotTemplate.findMany({
    include: {
      jobs: {
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        include: {
          children: { orderBy: { sortOrder: "asc" }, include: { orders: { include: { items: true } } } },
          orders: { include: { items: true } },
        },
      },
    },
  });
  for (const t of templates) {
    const totalChildren = t.jobs.reduce((n, j) => n + j.children.length, 0);
    const totalOrders =
      t.jobs.reduce((n, j) => n + j.orders.length, 0) +
      t.jobs.reduce((n, j) => n + j.children.reduce((cn, c) => cn + c.orders.length, 0), 0);
    console.log(`\n${t.name} (${t.typeLabel || "—"}) — ${t.jobs.length} parent-stages, ${totalChildren} children, ${totalOrders} orders`);
    for (const j of t.jobs.slice(0, 3)) {
      console.log(`  • ${j.name} [week ${j.startWeek}-${j.endWeek}] ${j.children.length > 0 ? `(${j.children.length} sub)` : ""} ${j.orders.length > 0 ? `${j.orders.length} orders` : ""}`);
      for (const c of j.children.slice(0, 3)) {
        console.log(`      └─ ${c.name} [w${c.startWeek}-${c.endWeek}] ${c.orders.length > 0 ? `${c.orders.length} orders` : ""}`);
      }
    }
  }
  await prisma.$disconnect();
}
main();
