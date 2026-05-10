import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude } from "@/lib/template-includes";
import { createJobsFromTemplate } from "@/lib/apply-template-helpers";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// POST /api/plots/apply-template — create a plot from a template
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    siteId,
    plotName,
    plotDescription,
    templateId,
    variantId,
    startDate,
    supplierMappings,
    plotNumber,
    reservationType,
  } = body;

  if (!siteId || !plotName || !templateId || !startDate) {
    return NextResponse.json(
      { error: "siteId, plotName, templateId, and startDate are required" },
      { status: 400 }
    );
  }

  // Verify site exists + caller has access (May 2026 audit #1).
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true, assignedToId: true } });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      siteId,
    ))
  ) {
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 },
    );
  }

  // Fetch template metadata. Jobs / materials / documents are fetched
  // separately below so we can scope by variant cleanly (May 2026
  // full-fat variants rework — variants own their full data, not
  // overlay overrides).
  const template = await prisma.plotTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  let resolvedVariantId: string | null = null;
  if (variantId) {
    const variant = await prisma.templateVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || variant.templateId !== templateId) {
      return NextResponse.json(
        { error: "Variant not found or doesn't belong to this template" },
        { status: 400 },
      );
    }
    resolvedVariantId = variant.id;
  }

  // Pull the rows scoped to whichever flavour we're applying — base
  // when no variant, the variant's own rows when one was picked.
  const [scopedJobs, scopedMaterials, scopedDocuments] = await Promise.all([
    prisma.templateJob.findMany({
      where: { templateId, variantId: resolvedVariantId, parentId: null },
      orderBy: { sortOrder: "asc" },
      include: {
        contact: { select: { id: true, name: true, company: true } },
        orders: {
          include: {
            items: true,
            supplier: true,
            anchorJob: {
              select: { id: true, name: true, startWeek: true, stageCode: true },
            },
          },
        },
        children: {
          orderBy: { sortOrder: "asc" },
          include: {
            contact: { select: { id: true, name: true, company: true } },
            orders: {
              include: {
                items: true,
                supplier: true,
                anchorJob: {
                  select: { id: true, name: true, startWeek: true, stageCode: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.templateMaterial.findMany({
      where: { templateId, variantId: resolvedVariantId },
    }),
    prisma.templateDocument.findMany({
      where: { templateId, variantId: resolvedVariantId },
    }),
  ]);

  // Guard: empty templates / variants produce empty plots.
  if (scopedJobs.length === 0) {
    const what = resolvedVariantId
      ? `Variant of "${template.name}"`
      : `Template "${template.name}"`;
    return NextResponse.json(
      { error: `${what} has no jobs — nothing to apply. Add at least one stage first.` },
      { status: 400 }
    );
  }

  const plotStartDate = new Date(startDate);

  // Create everything in a transaction — complex templates can have 20+ jobs + many orders,
  // so extend the default 5s timeout to 60s to match apply-template-batch
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
    // 1. Create Plot
    const plot = await tx.plot.create({
      data: {
        name: plotName.trim(),
        description: plotDescription?.trim() || null,
        siteId,
        plotNumber: plotNumber?.toString().trim() || null,
        reservationType: reservationType || null,
        houseType: template.typeLabel || null,
        // Snapshot link back to the template — informational, no auto-sync.
        sourceTemplateId: template.id,
        sourceVariantId: resolvedVariantId,
      },
    });

    // 2. Create Jobs from template/variant (handles both hierarchical and flat)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const warnings = await createJobsFromTemplate(
      tx,
      plot.id,
      plotStartDate,
      scopedJobs as any,
      supplierMappings || null,
      site.assignedToId
    );

    // 2b. Copy TemplateMaterial rows → PlotMaterial (sourceType=TEMPLATE, snapshot)
    if (scopedMaterials.length > 0) {
      await tx.plotMaterial.createMany({
        data: scopedMaterials.map((m) => ({
          plotId: plot.id,
          sourceType: "TEMPLATE",
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          unitCost: m.unitCost,
          category: m.category,
          notes: m.notes,
          linkedStageCode: m.linkedStageCode,
        })),
      });
    }

    // 2c. Copy TemplateDocument rows → SiteDocument (plot-scoped snapshot)
    if (scopedDocuments.length > 0) {
      await tx.siteDocument.createMany({
        data: scopedDocuments.map((d) => ({
          name: d.name,
          url: d.url,
          fileName: d.fileName,
          fileSize: d.fileSize,
          mimeType: d.mimeType,
          category: d.category || "DRAWING",
          siteId,
          plotId: plot.id,
          uploadedById: session.user.id,
        })),
      });
    }

    // 3. Log event
    await tx.eventLog.create({
      data: {
        type: "PLOT_CREATED",
        description: `Plot "${plot.name}" created from template "${template.name}"`,
        siteId,
        plotId: plot.id,
        userId: session.user.id,
      },
    });

    // Return the created plot with all its data
    const created = await tx.plot.findUnique({
      where: { id: plot.id },
      include: {
        jobs: {
          orderBy: { createdAt: "asc" },
          include: {
            assignedTo: { select: { id: true, name: true } },
            orders: {
              include: {
                supplier: true,
                orderItems: true,
              },
            },
          },
        },
      },
    });
      return { plot: created, warnings };
    }, { timeout: 60_000 }); // complex templates can have 20+ jobs + 10+ orders each
  } catch (err) {
    // (May 2026 audit #70 + #93) Route through the canonical apiError
    // helper — friendly Prisma-code mapping, hides raw messages in
    // production, and removes the local (err as any).code access.
    return apiError(err, "Failed to create plot");
  }

  return NextResponse.json({ ...result.plot, _warnings: result.warnings }, { status: 201 });
}
