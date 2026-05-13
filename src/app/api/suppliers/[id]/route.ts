import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

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

  try {
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
        // (May 2026 audit S-P0) Accept archivedAt for soft-delete / restore.
        ...(body.archivedAt === null ? { archivedAt: null } : {}),
        ...(typeof body.archivedAt === "string"
          ? { archivedAt: new Date(body.archivedAt) }
          : {}),
      },
    });

    return NextResponse.json(supplier);
  } catch (err) {
    return apiError(err, "Failed to update supplier");
  }
}

// (May 2026 audit S-P0) DELETE = soft-archive. Suppliers with
// historical orders / lateness events / template-order references
// can't be hard-deleted (FK Restrict would block anyway). Archive
// stamps `archivedAt` so the supplier drops out of pickers but every
// historical order keeps its supplier name + accountNumber.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }
  try {
    await prisma.supplier.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    return NextResponse.json({ success: true, archived: true });
  } catch (err) {
    return apiError(err, "Failed to archive supplier");
  }
}
