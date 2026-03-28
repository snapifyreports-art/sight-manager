import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

interface PricelistRow {
  Name?: string;
  Unit?: string;
  "Unit Cost"?: number;
  Category?: string;
  SKU?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const supplier = await prisma.supplier.findUnique({ where: { id } });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const workbook = XLSX.read(buffer);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    return NextResponse.json({ error: "No worksheet found" }, { status: 400 });
  }

  const rows = XLSX.utils.sheet_to_json<PricelistRow>(sheet);
  const validRows = rows.filter((r) => r.Name && String(r.Name).trim());

  if (validRows.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found. Ensure the 'Name' column is filled." },
      { status: 400 }
    );
  }

  let created = 0;
  let updated = 0;

  // Process sequentially in a transaction (Supabase pool limit)
  await prisma.$transaction(async (tx) => {
    for (const row of validRows) {
      const name = String(row.Name).trim();
      const unit = row.Unit ? String(row.Unit).trim() : "each";
      const unitCost = typeof row["Unit Cost"] === "number" ? row["Unit Cost"] : parseFloat(String(row["Unit Cost"])) || 0;
      const category = row.Category ? String(row.Category).trim() : null;
      const sku = row.SKU ? String(row.SKU).trim() : null;

      const existing = await tx.supplierMaterial.findUnique({
        where: { supplierId_name: { supplierId: id, name } },
      });

      if (existing) {
        await tx.supplierMaterial.update({
          where: { id: existing.id },
          data: { unit, unitCost, category, sku },
        });
        updated++;
      } else {
        await tx.supplierMaterial.create({
          data: { supplierId: id, name, unit, unitCost, category, sku },
        });
        created++;
      }
    }
  });

  return NextResponse.json({ imported: validRows.length, created, updated });
}
