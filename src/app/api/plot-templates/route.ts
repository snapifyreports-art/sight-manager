import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude, normaliseTemplateParentDates } from "@/lib/template-includes";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// GET /api/plot-templates — list all templates
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await prisma.plotTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      jobs: templateJobsInclude,
    },
  });

  return NextResponse.json(templates.map(normaliseTemplateParentDates));
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

  try {
    const template = await prisma.plotTemplate.create({
      data: {
        name: name.trim(),
        description: description?.trim() || null,
        typeLabel: typeLabel?.trim() || null,
      },
      include: {
        jobs: templateJobsInclude,
      },
    });

    return NextResponse.json(normaliseTemplateParentDates(template), { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create template");
  }
}
