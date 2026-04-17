import { addWeeks, addDays } from "date-fns";

// Types matching what Prisma returns for template jobs with children
interface TemplateOrderItem {
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
}

interface TemplateOrderWithItems {
  id: string;
  supplierId: string | null;
  itemsDescription: string | null;
  orderWeekOffset: number;
  deliveryWeekOffset: number;
  leadTimeAmount?: number | null;
  leadTimeUnit?: string | null;
  items: TemplateOrderItem[];
}

interface TemplateJobWithChildren {
  name: string;
  description: string | null;
  stageCode: string | null;
  sortOrder: number;
  startWeek: number;
  endWeek: number;
  weatherAffected?: boolean;
  weatherAffectedType?: string | null;
  parentId: string | null;
  contactId?: string | null;
  orders: TemplateOrderWithItems[];
  children: Array<{
    name: string;
    description: string | null;
    stageCode: string | null;
    sortOrder: number;
    startWeek: number;
    endWeek: number;
    durationWeeks: number | null;
    weatherAffected?: boolean;
    weatherAffectedType?: string | null;
    contactId?: string | null;
    orders: TemplateOrderWithItems[];
  }>;
}

/**
 * Creates jobs and orders for a plot from template jobs.
 * Handles both hierarchical (sub-jobs) and flat (legacy) templates.
 *
 * @param tx - Prisma transaction client
 * @param plotId - The plot to create jobs for
 * @param plotStartDate - The plot's start date
 * @param templateJobs - Top-level template jobs (parentId === null)
 * @param supplierMappings - Map of templateOrderId → supplierId
 */
export async function createJobsFromTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  plotId: string,
  plotStartDate: Date,
  templateJobs: TemplateJobWithChildren[],
  supplierMappings: Record<string, string> | null,
  assignedToId?: string | null
) {
  for (const templateJob of templateJobs) {
    if (templateJob.children && templateJob.children.length > 0) {
      // HIERARCHICAL: create individual Job records for each sub-job
      for (const child of templateJob.children) {
        const jobStartDate = addWeeks(plotStartDate, child.startWeek - 1);
        const jobEndDate = addDays(
          addWeeks(plotStartDate, child.endWeek - 1),
          6
        );

        const job = await tx.job.create({
          data: {
            name: child.name,
            description: child.description,
            plotId,
            startDate: jobStartDate,
            endDate: jobEndDate,
            originalStartDate: jobStartDate,
            originalEndDate: jobEndDate,
            status: "NOT_STARTED",
            stageCode: child.stageCode || null,
            weatherAffected: child.weatherAffected ?? false,
            weatherAffectedType: child.weatherAffectedType ?? null,
            parentStage: templateJob.name,
            sortOrder: templateJob.sortOrder * 100 + child.sortOrder,
            ...(assignedToId ? { assignedToId } : {}),
          },
        });

        // Create contractor assignment from template
        if (child.contactId) {
          await tx.jobContractor.create({
            data: { jobId: job.id, contactId: child.contactId },
          });
        }

        // Create orders from child's template orders
        await createOrdersFromTemplate(
          tx,
          job.id,
          jobStartDate,
          child.orders,
          supplierMappings
        );
      }

      // Also create orders from the PARENT stage's template orders
      // Attach them to the first child job
      if (templateJob.orders.length > 0) {
        // Find the first child job we just created
        const firstChildJob = await tx.job.findFirst({
          where: {
            plotId,
            parentStage: templateJob.name,
          },
          orderBy: { sortOrder: "asc" },
        });

        if (firstChildJob) {
          const firstChildStartDate = addWeeks(
            plotStartDate,
            templateJob.children[0].startWeek - 1
          );
          await createOrdersFromTemplate(
            tx,
            firstChildJob.id,
            firstChildStartDate,
            templateJob.orders,
            supplierMappings
          );
        }
      }
    } else {
      // FLAT (legacy): create Job directly from template job
      const jobStartDate = addWeeks(plotStartDate, templateJob.startWeek - 1);
      const jobEndDate = addDays(
        addWeeks(plotStartDate, templateJob.endWeek - 1),
        6
      );

      const job = await tx.job.create({
        data: {
          name: templateJob.name,
          description: templateJob.description,
          plotId,
          startDate: jobStartDate,
          endDate: jobEndDate,
          originalStartDate: jobStartDate,
          originalEndDate: jobEndDate,
          status: "NOT_STARTED",
          stageCode: templateJob.stageCode || null,
          weatherAffected: templateJob.weatherAffected ?? false,
          weatherAffectedType: templateJob.weatherAffectedType ?? null,
          sortOrder: templateJob.sortOrder,
          ...(assignedToId ? { assignedToId } : {}),
        },
      });

      // Create contractor assignment from template
      if (templateJob.contactId) {
        await tx.jobContractor.create({
          data: { jobId: job.id, contactId: templateJob.contactId },
        });
      }

      await createOrdersFromTemplate(
        tx,
        job.id,
        jobStartDate,
        templateJob.orders,
        supplierMappings
      );
    }
  }
}

async function createOrdersFromTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  jobId: string,
  jobStartDate: Date,
  orders: TemplateOrderWithItems[],
  supplierMappings: Record<string, string> | null
) {
  for (const templateOrder of orders) {
    // Use explicit mapping if provided, otherwise fall back to template's supplier
    const supplierId =
      supplierMappings?.[templateOrder.id] ||
      templateOrder.supplierId ||
      null;
    if (!supplierId) continue; // skip only if no supplier anywhere

    const dateOfOrder = addWeeks(jobStartDate, templateOrder.orderWeekOffset);

    // Calculate lead time in days from template fields
    let leadTimeDays: number | null = null;
    if (templateOrder.leadTimeAmount && templateOrder.leadTimeUnit) {
      leadTimeDays =
        templateOrder.leadTimeUnit === "weeks"
          ? templateOrder.leadTimeAmount * 7
          : templateOrder.leadTimeAmount;
    } else if (templateOrder.deliveryWeekOffset > 0) {
      // Fall back to deliveryWeekOffset (legacy: stored in weeks)
      leadTimeDays = templateOrder.deliveryWeekOffset * 7;
    }

    const expectedDeliveryDate = leadTimeDays
      ? addDays(dateOfOrder, leadTimeDays)
      : addWeeks(dateOfOrder, templateOrder.deliveryWeekOffset);

    await tx.materialOrder.create({
      data: {
        supplierId,
        jobId,
        itemsDescription: templateOrder.itemsDescription,
        dateOfOrder,
        expectedDeliveryDate,
        leadTimeDays,
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
