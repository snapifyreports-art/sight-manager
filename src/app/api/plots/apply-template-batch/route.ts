import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addWeeks, addDays } from "date-fns";

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

  // Fetch template with all nested data
  const template = await prisma.plotTemplate.findUnique({
    where: { id: templateId },
    include: {
      jobs: {
        orderBy: { sortOrder: "asc" },
        include: {
          orders: {
            include: { items: true },
          },
        },
      },
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

      // 2. Create Jobs from template
      for (const templateJob of template.jobs) {
        const jobStartDate = addWeeks(
          plotStartDate,
          templateJob.startWeek - 1
        );
        const jobEndDate = addDays(
          addWeeks(plotStartDate, templateJob.endWeek - 1),
          6
        );

        const job = await tx.job.create({
          data: {
            name: templateJob.name,
            description: templateJob.description,
            plotId: plot.id,
            startDate: jobStartDate,
            endDate: jobEndDate,
            status: "NOT_STARTED",
            stageCode: templateJob.stageCode || null,
            sortOrder: templateJob.sortOrder,
          },
        });

        // 3. Create Orders from template
        for (const templateOrder of templateJob.orders) {
          const supplierId =
            supplierMappings?.[templateOrder.id] || null;

          if (!supplierId) continue;

          const dateOfOrder = addWeeks(
            jobStartDate,
            templateOrder.orderWeekOffset
          );
          const expectedDeliveryDate = addWeeks(
            dateOfOrder,
            templateOrder.deliveryWeekOffset
          );

          await tx.materialOrder.create({
            data: {
              supplierId,
              jobId: job.id,
              itemsDescription: templateOrder.itemsDescription,
              dateOfOrder,
              expectedDeliveryDate,
              status: "PENDING",
              automated: true,
              orderItems: templateOrder.items.length
                ? {
                    create: templateOrder.items.map((item) => ({
                      name: item.name,
                      quantity: item.quantity,
                      unit: item.unit,
                      unitCost: item.unitCost,
                      totalCost: item.quantity * item.unitCost,
                    })),
                  }
                : undefined,
            },
          });
        }
      }

      // 4. Log event
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
