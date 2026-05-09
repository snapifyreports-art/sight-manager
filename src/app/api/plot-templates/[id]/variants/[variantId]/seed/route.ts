import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/plot-templates/[id]/variants/[variantId]/seed
 * Body: { fromVariantId: string | null }
 *   - null  → seed from the base template's rows
 *   - id    → seed from another variant's rows
 *
 * Deep-clones every TemplateJob (with parent/child relations + orders +
 * order items), TemplateMaterial, and TemplateDocument from the source
 * scope to the target variant. Anchor references are remapped.
 *
 * Refuses if the target variant already has any rows — "seed" implies
 * starting from empty. To re-seed, delete the variant's content first.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: templateId, variantId } = await params;
  const body = await req.json().catch(() => ({}));
  const fromVariantId: string | null = body.fromVariantId ?? null;

  // Verify the target variant
  const variant = await prisma.templateVariant.findFirst({
    where: { id: variantId, templateId },
  });
  if (!variant) {
    return NextResponse.json(
      { error: "Variant not found" },
      { status: 404 },
    );
  }

  // Refuse re-seed
  const existing = await prisma.templateJob.count({
    where: { variantId },
  });
  if (existing > 0) {
    return NextResponse.json(
      {
        error: "Variant already has stages — clear it first if you want to re-seed.",
      },
      { status: 400 },
    );
  }

  // Source scope
  const sourceWhere = fromVariantId
    ? { templateId, variantId: fromVariantId }
    : { templateId, variantId: null };

  try {
    const jobs = await prisma.templateJob.findMany({
      where: sourceWhere,
      orderBy: { sortOrder: "asc" },
      include: { orders: { include: { items: true } } },
    });

    if (jobs.length === 0) {
      return NextResponse.json({
        success: true,
        seeded: { jobs: 0, orders: 0, materials: 0, documents: 0 },
      });
    }

    const oldToNew = new Map<string, string>();

    // Parents first
    for (const job of jobs.filter((j) => j.parentId === null)) {
      const created = await prisma.templateJob.create({
        data: {
          templateId,
          variantId,
          name: job.name,
          description: job.description,
          stageCode: job.stageCode,
          sortOrder: job.sortOrder,
          startWeek: job.startWeek,
          endWeek: job.endWeek,
          durationWeeks: job.durationWeeks,
          durationDays: job.durationDays,
          weatherAffected: job.weatherAffected,
          weatherAffectedType: job.weatherAffectedType,
          contactId: job.contactId,
          parentId: null,
        },
      });
      oldToNew.set(job.id, created.id);
    }
    // Children
    for (const job of jobs.filter((j) => j.parentId !== null)) {
      const newParentId = job.parentId ? oldToNew.get(job.parentId) : null;
      const created = await prisma.templateJob.create({
        data: {
          templateId,
          variantId,
          name: job.name,
          description: job.description,
          stageCode: job.stageCode,
          sortOrder: job.sortOrder,
          startWeek: job.startWeek,
          endWeek: job.endWeek,
          durationWeeks: job.durationWeeks,
          durationDays: job.durationDays,
          weatherAffected: job.weatherAffected,
          weatherAffectedType: job.weatherAffectedType,
          contactId: job.contactId,
          parentId: newParentId ?? null,
        },
      });
      oldToNew.set(job.id, created.id);
    }

    // Orders
    let orderCount = 0;
    for (const job of jobs) {
      for (const order of job.orders) {
        const newJobId = oldToNew.get(order.templateJobId);
        if (!newJobId) continue;
        const newAnchorJobId = order.anchorJobId
          ? oldToNew.get(order.anchorJobId) ?? null
          : null;
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
        orderCount += 1;
      }
    }

    // Materials
    const materials = await prisma.templateMaterial.findMany({
      where: sourceWhere,
    });
    for (const m of materials) {
      await prisma.templateMaterial.create({
        data: {
          templateId,
          variantId,
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          unitCost: m.unitCost,
          category: m.category,
          notes: m.notes,
          linkedStageCode: m.linkedStageCode,
        },
      });
    }

    // Documents
    const docs = await prisma.templateDocument.findMany({
      where: sourceWhere,
    });
    for (const d of docs) {
      await prisma.templateDocument.create({
        data: {
          templateId,
          variantId,
          name: d.name,
          url: d.url,
          fileName: d.fileName,
          fileSize: d.fileSize,
          mimeType: d.mimeType,
          category: d.category,
          isPlaceholder: d.isPlaceholder,
        },
      });
    }

    await prisma.templateAuditEvent.create({
      data: {
        templateId,
        userId: session.user?.id ?? null,
        userName: session.user?.name ?? session.user?.email ?? null,
        action: "variant_seeded",
        detail: fromVariantId
          ? `Seeded variant "${variant.name}" from another variant`
          : `Seeded variant "${variant.name}" from base template`,
      },
    });

    return NextResponse.json({
      success: true,
      seeded: {
        jobs: oldToNew.size,
        orders: orderCount,
        materials: materials.length,
        documents: docs.length,
      },
    });
  } catch (err) {
    return apiError(err, "Failed to seed variant");
  }
}
