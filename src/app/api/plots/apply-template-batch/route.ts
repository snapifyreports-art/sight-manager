import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude } from "@/lib/template-includes";
import { createJobsFromTemplate } from "@/lib/apply-template-helpers";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

// POST /api/plots/apply-template-batch — create multiple plots from a template
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { siteId, templateId, variantId, startDate, supplierMappings, plots } = body as {
    siteId: string;
    templateId: string;
    variantId?: string | null;
    /** Batch-level fallback date — used when a plot row has no own
     *  startDate. Required so existing legacy callers without per-plot
     *  dates keep working. */
    startDate: string;
    supplierMappings: Record<string, string>;
    /** Per-plot rows. `startDate` is optional; falls back to body.startDate. */
    plots: Array<{ plotNumber: string; plotName: string; startDate?: string }>;
  };

  if (!siteId || !templateId || !startDate || !plots || plots.length === 0) {
    return NextResponse.json(
      {
        error:
          "siteId, templateId, startDate, and at least one plot are required",
      },
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

  // Fetch template metadata; variant-scoped fetch happens below.
  const template = await prisma.plotTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  // Variant resolution (May 2026 full-fat variants rework). Same flow
  // as apply-template (single): variants own full data; null = base.
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

  if (scopedJobs.length === 0) {
    const what = resolvedVariantId
      ? `Variant of "${template.name}"`
      : `Template "${template.name}"`;
    return NextResponse.json(
      { error: `${what} has no jobs — nothing to apply.` },
      { status: 400 }
    );
  }

  // Validate all plot numbers are unique within the batch
  const plotNumbers = plots
    .map((p) => p.plotNumber?.trim())
    .filter(Boolean);
  const uniqueNumbers = new Set(plotNumbers);
  if (uniqueNumbers.size < plotNumbers.length) {
    return NextResponse.json(
      { error: "Duplicate plot numbers in batch" },
      { status: 400 }
    );
  }

  // Check for existing plot numbers on this site
  if (plotNumbers.length > 0) {
    const existing = await prisma.plot.findMany({
      where: {
        siteId,
        plotNumber: { in: plotNumbers },
      },
      select: { plotNumber: true },
    });
    if (existing.length > 0) {
      const dupes = existing.map((p) => p.plotNumber).join(", ");
      return NextResponse.json(
        { error: `Plot numbers already exist on this site: ${dupes}` },
        { status: 400 }
      );
    }
  }

  const fallbackStartDate = new Date(startDate);

  // Create each plot in its own transaction to avoid timeout on large batches
  const createdPlots: string[] = [];
  const errors: Array<{ plotNumber: string; error: string }> = [];
  const warningsByPlot: Record<string, { templateJobName: string; itemsDescription: string | null }[]> = {};

  for (const plotInput of plots) {
    // Per-plot start date (May 2026): each plot row may carry its own
    // startDate from the wizard's stagger / per-plot override flow. Fall
    // back to the batch-level date for legacy callers that don't pass
    // per-row dates.
    const perPlotStart = plotInput.startDate
      ? new Date(plotInput.startDate)
      : fallbackStartDate;
    try {
      const { plotId, warnings } = await prisma.$transaction(async (tx) => {
        const plot = await tx.plot.create({
          data: {
            name: plotInput.plotName.trim(),
            siteId,
            plotNumber: plotInput.plotNumber?.trim() || null,
            houseType: template.typeLabel || null,
            sourceTemplateId: template.id,
            sourceVariantId: resolvedVariantId,
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = await createJobsFromTemplate(
          tx,
          plot.id,
          perPlotStart,
          scopedJobs as any,
          supplierMappings || null,
          site.assignedToId
        );

        // Copy TemplateMaterial rows → PlotMaterial snapshot
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

        // Copy TemplateDocument rows → SiteDocument (plot-scoped) snapshot
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

        await tx.eventLog.create({
          data: {
            type: "PLOT_CREATED",
            description: `Plot "${plot.name}" (${plotInput.plotNumber || "no number"}) created from template "${template.name}" (batch)`,
            siteId,
            plotId: plot.id,
            userId: session.user.id,
          },
        });

        return { plotId: plot.id, warnings: w };
      }, { timeout: 60_000 }); // complex templates can have 20+ jobs + 10+ orders each
      createdPlots.push(plotId);
      if (warnings.length > 0) {
        warningsByPlot[plotInput.plotNumber || plotInput.plotName] = warnings.map(
          ({ templateJobName, itemsDescription }) => ({ templateJobName, itemsDescription })
        );
      }
    } catch (err) {
      errors.push({
        plotNumber: plotInput.plotNumber || plotInput.plotName,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (createdPlots.length === 0 && errors.length > 0) {
    // Include the first error's message in the top-level `error` so the UI
    // can show something useful without having to parse the errors[] array.
    const firstError = errors[0]?.error ?? "unknown error";
    return NextResponse.json(
      {
        error: `All ${plots.length} plot${plots.length === 1 ? "" : "s"} failed to create — first error: ${firstError}`,
        errors,
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { created: createdPlots.length, plotIds: createdPlots, errors, warnings: warningsByPlot },
    { status: 201 }
  );
}
