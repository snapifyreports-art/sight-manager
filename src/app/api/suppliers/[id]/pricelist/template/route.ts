import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const supplier = await prisma.supplier.findUnique({
    where: { id },
    select: { name: true },
  });

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const items = await prisma.supplierMaterial.findMany({
    where: { supplierId: id },
    orderBy: { name: "asc" },
    select: { name: true, unit: true, unitCost: true, category: true, sku: true },
  });

  const rows = items.length > 0
    ? items.map((i) => ({
        Name: i.name,
        Unit: i.unit,
        "Unit Cost": i.unitCost,
        Category: i.category || "",
        SKU: i.sku || "",
      }))
    : [{ Name: "", Unit: "each", "Unit Cost": 0, Category: "", SKU: "" }];

  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  ws["!cols"] = [
    { wch: 30 }, // Name
    { wch: 10 }, // Unit
    { wch: 12 }, // Unit Cost
    { wch: 20 }, // Category
    { wch: 15 }, // SKU
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Pricelist");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const safeName = supplier.name.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}-pricelist.xlsx"`,
    },
  });
}
