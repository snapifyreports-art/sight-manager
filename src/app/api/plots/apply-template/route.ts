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

  const plotStartDate = new Date(startDate);

  // Create everything in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create Plot
    const plot = await tx.plot.create({
      data: {
        name: plotName.trim(),
        description: plotDescription?.trim() || null,
        siteId,
        plotNumber: plotNumber?.toString().trim() || null,
        reservationType: reservationType || null,
        houseType: template.typeLabel || null,
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
  });

  return NextResponse.json({ ...result.plot, _warnings: result.warnings }, { status: 201 });
}
