import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude } from "@/lib/template-includes";
import { createJobsFromTemplate } from "@/lib/apply-template-helpers";

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

  // Verify site exists
  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true, assignedToId: true } });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Fetch template with all nested data including children + materials + documents
  const template = await prisma.plotTemplate.findUnique({
    where: { id: templateId },
    include: {
      jobs: templateJobsInclude,
      materials: true,
      documents: true,
    },
  });

  if (!template) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  // Guard: an empty template would create an empty plot, which is almost
  // always a sign of a broken template or user error. Reject explicitly
  // rather than silently succeeding.
  if (template.jobs.length === 0) {
    return NextResponse.json(
      { error: `Template "${template.name}" has no jobs — nothing to apply. Add at least one stage to the template first.` },
      { status: 400 }
    );
  }

  // Variant overrides — if a variantId was passed, load its job +
  // material overrides and mutate the template payload BEFORE the apply
  // helper runs. createJobsFromTemplate reads `durationDays` directly,
  // so injecting the variant value here is the simplest splice point.
  let resolvedVariantId: string | null = null;
  if (variantId) {
    const variant = await prisma.templateVariant.findUnique({
      where: { id: variantId },
      include: { jobOverrides: true, materialOverrides: true },
    });
    if (!variant || variant.templateId !== templateId) {
      return NextResponse.json(
        { error: "Variant not found or doesn't belong to this template" },
        { status: 400 },
      );
    }
    resolvedVariantId = variant.id;
    const jobOverrides = new Map(
      variant.jobOverrides.map((o) => [o.templateJobId, o.durationDays]),
    );
    const materialOverrides = new Map(
      variant.materialOverrides.map((o) => [o.templateMaterialId, o]),
    );
    // Walk every job (and child) and replace durationDays where the
    // variant has an override. Loosely typed because the templateJobs
    // include is nested and the inferred Prisma type is awkward.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const applyJobOverride = (j: any) => {
      const v = jobOverrides.get(j.id);
      if (v != null) j.durationDays = v;
      if (Array.isArray(j.children)) j.children.forEach(applyJobOverride);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (template.jobs as any[]).forEach((j) => applyJobOverride(j));
    // Materials
    for (const m of template.materials) {
      const override = materialOverrides.get(m.id);
      if (!override) continue;
      if (override.quantity != null) m.quantity = override.quantity;
      if (override.unitCost != null) m.unitCost = override.unitCost;
    }
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

    // 2. Create Jobs from template (handles both hierarchical and flat)
    const warnings = await createJobsFromTemplate(
      tx,
      plot.id,
      plotStartDate,
      template.jobs,
      supplierMappings || null,
      site.assignedToId
    );

    // 2b. Copy TemplateMaterial rows → PlotMaterial (sourceType=TEMPLATE, snapshot)
    if (template.materials.length > 0) {
      await tx.plotMaterial.createMany({
        data: template.materials.map((m) => ({
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
    if (template.documents.length > 0) {
      await tx.siteDocument.createMany({
        data: template.documents.map((d) => ({
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
    // Surface the actual Prisma / transaction error so the UI can show something
    // useful instead of a generic 500. Includes the error code for Prisma errors.
    console.error("apply-template failed:", err);
    const message = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const code = (err as any)?.code;
    return NextResponse.json(
      { error: `Failed to create plot: ${message}${code ? ` (${code})` : ""}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ...result.plot, _warnings: result.warnings }, { status: 201 });
}
