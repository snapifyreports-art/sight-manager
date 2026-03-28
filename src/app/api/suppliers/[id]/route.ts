import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    include: {
      materials: { orderBy: { name: "asc" } },
      _count: { select: { orders: true } },
    },
  });

  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  return NextResponse.json(supplier);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  const supplier = await prisma.supplier.update({
    where: { id },
    data: {
      name: body.name ?? existing.name,
      contactName: body.contactName !== undefined ? body.contactName : existing.contactName,
      contactEmail: body.contactEmail !== undefined ? body.contactEmail : existing.contactEmail,
      contactNumber: body.contactNumber !== undefined ? body.contactNumber : existing.contactNumber,
      type: body.type !== undefined ? body.type : existing.type,
      emailTemplate: body.emailTemplate !== undefined ? body.emailTemplate : existing.emailTemplate,
      accountNumber: body.accountNumber !== undefined ? body.accountNumber : existing.accountNumber,
    },
  });

  return NextResponse.json(supplier);
}
