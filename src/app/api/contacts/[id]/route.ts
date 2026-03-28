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

  const contact = await prisma.contact.findUnique({
    where: { id },
    include: {
      jobContractors: {
        include: {
          job: {
            select: {
              id: true,
              name: true,
              status: true,
              startDate: true,
              endDate: true,
              plot: {
                select: {
                  id: true,
                  name: true,
                  site: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
      snags: {
        select: {
          id: true,
          description: true,
          status: true,
          priority: true,
          createdAt: true,
          plot: { select: { id: true, name: true, siteId: true } },
          job: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      orders: {
        select: {
          id: true,
          orderDetails: true,
          status: true,
          dateOfOrder: true,
          supplier: { select: { id: true, name: true } },
          job: {
            select: {
              id: true,
              name: true,
              plot: { select: { name: true } },
            },
          },
        },
        orderBy: { dateOfOrder: "desc" },
      },
    },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  return NextResponse.json(contact);
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

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  if (body.type && body.type !== "SUPPLIER" && body.type !== "CONTRACTOR") {
    return NextResponse.json(
      { error: "type must be SUPPLIER or CONTRACTOR" },
      { status: 400 }
    );
  }

  const contact = await prisma.contact.update({
    where: { id },
    data: {
      name: body.name ?? existing.name,
      email: body.email !== undefined ? body.email || null : existing.email,
      phone: body.phone !== undefined ? body.phone || null : existing.phone,
      type: body.type ?? existing.type,
      company: body.company !== undefined ? body.company || null : existing.company,
      notes: body.notes !== undefined ? body.notes || null : existing.notes,
    },
  });

  return NextResponse.json(contact);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.contact.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  await prisma.contact.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
