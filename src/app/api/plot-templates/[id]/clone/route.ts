import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/plot-templates/[id]/clone
 * Body: { name?: string }  — default: "<Original> (copy)"
 *
 * Deep-clones a template: all jobs (with parent/child relationships),
 * all orders + order items, and anchor references rebased to the new
 * job IDs. Does NOT clone sourcedPlots — the copy starts with zero
 * usage, as a fresh starter.
 *
 * Keith Apr 2026 UX audit — "if you have a similar house type, cloning
 * is one click vs. rebuilding from scratch".
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const newName = (body.name as string | undefined)?.trim();

    const source = await prisma.plotTemplate.findUnique({
      where: { id },
      include: {
        jobs: {
          orderBy: { sortOrder: "asc" },
          include: {
            orders: { include: { items: true } },
          },
        },
        materials: true,
        documents: true,
      },
    });
    if (!source) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    // Create the new template shell.
    const clone = await prisma.plotTemplate.create({
      data: {
        name: newName || `${source.name} (copy)`,
        description: source.description,
        typeLabel: source.typeLabel,
      },
    });

    // Map old-job-id → new-job-id so we can remap parentId + anchorJobId.
    const jobIdMap = new Map<string, string>();

    // First pass: create parents (jobs with parentId === null).
    for (const job of source.jobs.filter((j) => j.parentId === null)) {
      const created = await prisma.templateJob.create({
        data: {
          templateId: clone.id,
          name: job.name,
          description: job.description,
          stageCode: job.stageCode,
          startWeek: job.startWeek,
          endWeek: job.endWeek,
          durationWeeks: job.durationWeeks,
          durationDays: job.durationDays,
          sortOrder: job.sortOrder,
          contactId: job.contactId,
          parentId: null,
        },
      });
      jobIdMap.set(job.id, created.id);
    }

    // Second pass: children, now that parent IDs are known.
    for (const job of source.jobs.filter((j) => j.parentId !== null)) {
      const newParentId = job.parentId ? jobIdMap.get(job.parentId) : null;
      const created = await prisma.templateJob.create({
        data: {
          templateId: clone.id,
          name: job.name,
          description: job.description,
          stageCode: job.stageCode,
          startWeek: job.startWeek,
          endWeek: job.endWeek,
          durationWeeks: job.durationWeeks,
          durationDays: job.durationDays,
          sortOrder: job.sortOrder,
          contactId: job.contactId,
          parentId: newParentId ?? null,
        },
      });
      jobIdMap.set(job.id, created.id);
    }

    // Third pass: orders (remap templateJobId + anchorJobId).
    for (const job of source.jobs) {
      for (const order of job.orders) {
        const newJobId = jobIdMap.get(order.templateJobId);
        if (!newJobId) continue;
        const newAnchorJobId = order.anchorJobId ? jobIdMap.get(order.anchorJobId) ?? null : null;
        await prisma.templateOrder.create({
          data: {
            templateJobId: newJobId,
            supplierId: order.supplierId,
            orderWeekOffset: order.orderWeekOffset,
            deliveryWeekOffset: order.deliveryWeekOffset,
            itemsDescription: order.itemsDescription,
            anchorType: order.anchorType,
            anchorAmount: order.anchorAmount,
            anchorUnit: order.anchorUnit,
            anchorDirection: order.anchorDirection,
            anchorJobId: newAnchorJobId,
            items: {
              create: order.items.map((it) => ({
                name: it.name,
                quantity: it.quantity,
                unit: it.unit,
                unitCost: it.unitCost,
              })),
            },
          },
        });
      }
    }

    // Fourth pass: materials (quants) — flat, no remap needed.
    if (source.materials.length > 0) {
      await prisma.templateMaterial.createMany({
        data: source.materials.map((m) => ({
          templateId: clone.id,
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          unitCost: m.unitCost,
          linkedStageCode: m.linkedStageCode,
          category: m.category,
          notes: m.notes,
        })),
      });
    }

    // Documents stay with the original template — cloning docs would
    // duplicate Supabase storage for no benefit. If the user wants them
    // on the copy, they can re-upload.

    return NextResponse.json({ id: clone.id, name: clone.name }, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to clone template");
  }
}
