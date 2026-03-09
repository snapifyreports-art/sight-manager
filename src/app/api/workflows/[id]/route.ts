import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/workflows/[id] — single workflow with all jobs
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const workflow = await prisma.workflow.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      jobs: {
        orderBy: { createdAt: "asc" },
        include: {
          assignedTo: {
            select: { id: true, name: true },
          },
        },
      },
      _count: {
        select: { jobs: true },
      },
    },
  });

  if (!workflow) {
    return NextResponse.json(
      { error: "Workflow not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(workflow);
}

// PUT /api/workflows/[id] — update workflow
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { name, description, status } = body;

  const existing = await prisma.workflow.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Workflow not found" },
      { status: 404 }
    );
  }

  const workflow = await prisma.workflow.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && {
        description: description?.trim() || null,
      }),
      ...(status !== undefined && { status }),
    },
    include: {
      createdBy: {
        select: { id: true, name: true, email: true },
      },
      jobs: {
        orderBy: { createdAt: "asc" },
        include: {
          assignedTo: {
            select: { id: true, name: true },
          },
        },
      },
      _count: {
        select: { jobs: true },
      },
    },
  });

  await prisma.eventLog.create({
    data: {
      type: "WORKFLOW_UPDATED",
      description: `Workflow "${workflow.name}" was updated`,
      workflowId: workflow.id,
      userId: session.user.id,
    },
  });

  return NextResponse.json(workflow);
}

// DELETE /api/workflows/[id] — delete workflow (cascades to jobs)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const existing = await prisma.workflow.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json(
      { error: "Workflow not found" },
      { status: 404 }
    );
  }

  await prisma.workflow.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
