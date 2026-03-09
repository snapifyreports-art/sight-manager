import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/workflows — list all workflows with job counts and creator
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workflows = await prisma.workflow.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { jobs: true },
      },
    },
  });

  return NextResponse.json(workflows);
}

// POST /api/workflows — create a new workflow
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "Workflow name is required" },
      { status: 400 }
    );
  }

  const workflow = await prisma.workflow.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      createdById: session.user.id,
    },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      _count: {
        select: { jobs: true },
      },
    },
  });

  // Log the event
  await prisma.eventLog.create({
    data: {
      type: "WORKFLOW_CREATED",
      description: `Workflow "${workflow.name}" was created`,
      workflowId: workflow.id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(workflow, { status: 201 });
}
