import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addWeeks, addDays } from "date-fns";

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

    // 2. Create Jobs from template
    for (const templateJob of template.jobs) {
      const jobStartDate = addWeeks(plotStartDate, templateJob.startWeek - 1);
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

        if (!supplierId) continue; // Skip orders without supplier mapping

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
        description: `Plot "${plot.name}" created from template "${template.name}"`,
        siteId,
        plotId: plot.id,
        userId: session.user.id,
      },
    });

    // Return the created plot with all its data
    return tx.plot.findUnique({
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
  });

  return NextResponse.json(result, { status: 201 });
}
