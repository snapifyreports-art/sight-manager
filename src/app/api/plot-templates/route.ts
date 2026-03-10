import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/plot-templates — list all templates
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await prisma.plotTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      jobs: {
        orderBy: { sortOrder: "asc" },
        include: {
          orders: {
            include: { items: true, supplier: true },
          },
        },
      },
    },
  });

  return NextResponse.json(templates);
}

// POST /api/plot-templates — create a template
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description, typeLabel } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Template name is required" },
      { status: 400 }
    );
  }

  const template = await prisma.plotTemplate.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      typeLabel: typeLabel?.trim() || null,
    },
    include: {
      jobs: {
        orderBy: { sortOrder: "asc" },
        include: {
          orders: {
            include: { items: true, supplier: true },
          },
        },
      },
    },
  });

  return NextResponse.json(template, { status: 201 });
}
