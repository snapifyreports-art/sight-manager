import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ContactType } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");

  const where: { type?: ContactType } = {};
  if (type === "SUPPLIER" || type === "CONTRACTOR") {
    where.type = type;
  }

  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { name, email, phone, type, company, notes } = body;

  if (!name || !type) {
    return NextResponse.json(
      { error: "name and type are required" },
      { status: 400 }
    );
  }

  if (type !== "SUPPLIER" && type !== "CONTRACTOR") {
    return NextResponse.json(
      { error: "type must be SUPPLIER or CONTRACTOR" },
      { status: 400 }
    );
  }

  const contact = await prisma.contact.create({
    data: {
      name,
      email: email || null,
      phone: phone || null,
      type,
      company: company || null,
      notes: notes || null,
    },
  });

  return NextResponse.json(contact, { status: 201 });
}
