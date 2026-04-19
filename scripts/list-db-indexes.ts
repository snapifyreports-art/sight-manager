import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any = await prisma.$queryRawUnsafe(`
    SELECT
      t.relname AS table_name,
      i.relname AS index_name,
      array_to_string(array_agg(a.attname), ',') AS columns
    FROM pg_class t
    JOIN pg_index ix ON t.oid = ix.indrelid
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
    WHERE t.relkind = 'r'
      AND t.relname IN ('Plot','Job','MaterialOrder','OrderItem','Snag','SnagPhoto','EventLog','JobAction','JobContractor','SiteDocument')
    GROUP BY t.relname, i.relname
    ORDER BY t.relname, i.relname;
  `);
  for (const r of rows) {
    console.log(`${r.table_name.padEnd(16)} ${r.index_name.padEnd(50)} (${r.columns})`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
