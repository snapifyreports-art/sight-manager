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
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  // Fetch template with all nested data including children
  const template = await prisma.plotTemplate.findUnique({
    where: { id: templateId },
    include: {
      jobs: templateJobsInclude,
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

  // Create everything in a single transaction
  const result = await prisma.$transaction(async (tx) => {
    const createdPlots: string[] = [];

    for (const plotInput of plots) {
      // 1. Create Plot
      const plot = await tx.plot.create({
        data: {
          name: plotInput.plotName.trim(),
          siteId,
          plotNumber: plotInput.plotNumber?.trim() || null,
          houseType: template.typeLabel || null,
        },
      });
      createdPlots.push(plot.id);

      // 2. Create Jobs from template (handles both hierarchical and flat)
      await createJobsFromTemplate(
        tx,
        plot.id,
        plotStartDate,
        template.jobs,
        supplierMappings || null
      );

      // 3. Log event
      await tx.eventLog.create({
        data: {
          type: "PLOT_CREATED",
          description: `Plot "${plot.name}" (${plotInput.plotNumber || "no number"}) created from template "${template.name}" (batch)`,
          siteId,
          plotId: plot.id,
          userId: session.user.id,
        },
      });
    }

    return createdPlots;
  });

  return NextResponse.json(
    { created: result.length, plotIds: result },
    { status: 201 }
  );
}
