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

    // Create the new template shell. Clones start as drafts so the user
    // has a chance to review (re-upload placeholder docs, tweak names,
    // adjust durations) before exposing the copy in the apply-picker.
    const clone = await prisma.plotTemplate.create({
      data: {
        name: newName || `${source.name} (copy)`,
        description: source.description,
        typeLabel: source.typeLabel,
        isDraft: true,
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
    // SSOT note: anchor fields + lead-time fields are canonical for order
    // timing — copy them all. Earlier this loop forgot leadTimeAmount /
    // leadTimeUnit which meant cloned orders silently lost their lead
    // time and apply-template fell back to the legacy deliveryWeekOffset
    // fallback. Caught during the May 2026 SSOT-audit re-review.
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
            leadTimeAmount: order.leadTimeAmount,
            leadTimeUnit: order.leadTimeUnit,
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

    // Documents — Supabase storage objects aren't duplicated (storage
    // costs add up across clones). Instead we create placeholder rows
    // carrying the original metadata so the user can see what was on
    // the source template and re-upload deliberately. UI flags
    // isPlaceholder=true rows with a "re-upload" affordance.
    if (source.documents.length > 0) {
      await prisma.templateDocument.createMany({
        data: source.documents.map((d) => ({
          templateId: clone.id,
          name: d.name,
          url: "", // empty for placeholders — UI uses isPlaceholder check
          fileName: d.fileName,
          fileSize: d.fileSize,
          mimeType: d.mimeType,
          category: d.category,
          isPlaceholder: true,
        })),
      });
    }

    // Audit log: capture the clone-from event so the change log on the
    // new template starts with a clear origin point.
    await prisma.templateAuditEvent.create({
      data: {
        templateId: clone.id,
        userId: session.user?.id ?? null,
        userName: session.user?.name ?? session.user?.email ?? null,
        action: "cloned_from",
        detail: `Cloned from "${source.name}"`,
      },
    });

    return NextResponse.json({ id: clone.id, name: clone.name }, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to clone template");
  }
}
