import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { templateJobsInclude } from "@/lib/template-includes";
import { createJobsFromTemplate } from "@/lib/apply-template-helpers";

export const dynamic = "force-dynamic";

// POST /api/plots/apply-template-batch — create multiple plots from a template
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { siteId, templateId, startDate, supplierMappings, plots } = body as {
    siteId: string;
    templateId: string;
    startDate: string;
    supplierMappings: Record<string, string>;
    plots: Array<{ plotNumber: string; plotName: string }>;
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

  const plotStartDate = new Date(startDate);

  // Create each plot in its own transaction to avoid timeout on large batches
  const createdPlots: string[] = [];
  const errors: Array<{ plotNumber: string; error: string }> = [];
  const warningsByPlot: Record<string, { templateJobName: string; itemsDescription: string | null }[]> = {};

  for (const plotInput of plots) {
    try {
      const { plotId, warnings } = await prisma.$transaction(async (tx) => {
        const plot = await tx.plot.create({
          data: {
            name: plotInput.plotName.trim(),
            siteId,
            plotNumber: plotInput.plotNumber?.trim() || null,
            houseType: template.typeLabel || null,
          },
        });

        const w = await createJobsFromTemplate(
          tx,
          plot.id,
          plotStartDate,
          template.jobs,
          supplierMappings || null,
          site.assignedToId
        );

        // Copy TemplateMaterial rows → PlotMaterial snapshot
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

        // Copy TemplateDocument rows → SiteDocument (plot-scoped) snapshot
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
