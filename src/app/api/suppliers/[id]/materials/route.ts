import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/suppliers/[id]/materials — get unique materials historically ordered from this supplier
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Get unique order items from MaterialOrders for this supplier
  const orderItems = await prisma.orderItem.findMany({
    where: {
      order: { supplierId: id },
    },
    select: {
      name: true,
      unit: true,
      unitCost: true,
    },
    orderBy: { name: "asc" },
  });

  // Also get items from TemplateOrders for this supplier
  const templateItems = await prisma.templateOrderItem.findMany({
    where: {
      templateOrder: { supplierId: id },
    },
    select: {
      name: true,
      unit: true,
      unitCost: true,
    },
    orderBy: { name: "asc" },
  });

  // Deduplicate by name (prefer the one with a cost if available)
  const seen = new Map<string, { name: string; unit: string; unitCost: number }>();
  for (const item of [...orderItems, ...templateItems]) {
    const key = item.name.toLowerCase().trim();
    if (!seen.has(key) || (item.unitCost > 0 && (seen.get(key)?.unitCost ?? 0) === 0)) {
      seen.set(key, {
        name: item.name,
        unit: item.unit,
        unitCost: item.unitCost,
      });
    }
  }

  return NextResponse.json(Array.from(seen.values()));
}
