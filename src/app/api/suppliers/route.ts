import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/suppliers — list all suppliers
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { orders: true, materials: true } },
    },
  });

  return NextResponse.json(suppliers);
}

// POST /api/suppliers — create a supplier
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const supplier = await prisma.supplier.create({
    data: {
      name: body.name.trim(),
      contactName: body.contactName || null,
      contactEmail: body.contactEmail || null,
      contactNumber: body.contactNumber || null,
      type: body.type || null,
      accountNumber: body.accountNumber || null,
    },
    include: {
      _count: { select: { orders: true, materials: true } },
    },
  });

  return NextResponse.json(supplier, { status: 201 });
}
