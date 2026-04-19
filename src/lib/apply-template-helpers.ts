import { addWeeks, addDays } from "date-fns";
import { snapToWorkingDay, addWorkingDays } from "@/lib/working-days";

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
  // durationDays, when set, overrides the week-based endWeek at apply
  // time — lets a sub-job span fewer than 5 working days.
  durationDays?: number | null;
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
    durationDays?: number | null;
    weatherAffected?: boolean;
    weatherAffectedType?: string | null;
    contactId?: string | null;
    orders: TemplateOrderWithItems[];
  }>;
}

/**
 * Compute a job's end date from its template fields.
 *
 * If `durationDays` is set, it wins — the job spans that many working
 * days starting at `startWeek`. Otherwise fall back to the classic
 * week-based calculation (endWeek inclusive = startWeek + durationWeeks - 1).
 *
 * Days-precedence makes the "add days option" (Q2 Apr 2026) a pure
 * addition — existing weeks-only templates are unchanged.
 */
function computeJobEndDate(
  plotStartDate: Date,
  startWeek: number,
  endWeek: number,
  durationDays: number | null | undefined,
): Date {
  const startDate = snapToWorkingDay(addWeeks(plotStartDate, startWeek - 1), "forward");
  if (durationDays && durationDays > 0) {
    // -1 because day 1 IS the start day, so a 3-day job ends on start+2WD.
    return snapToWorkingDay(addWorkingDays(startDate, durationDays - 1), "forward");
  }
  // Legacy weeks path — endWeek is inclusive, so the week runs from
  // startWeek Monday to endWeek Sunday. Add 6 calendar days then snap.
  return snapToWorkingDay(addDays(addWeeks(plotStartDate, endWeek - 1), 6), "forward");
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
export interface TemplateApplyWarning {
  kind: "order_skipped_no_supplier";
  templateJobName: string;
  itemsDescription: string | null;
}

export async function createJobsFromTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  plotId: string,
  plotStartDate: Date,
  templateJobs: TemplateJobWithChildren[],
  supplierMappings: Record<string, string> | null,
  assignedToId?: string | null
): Promise<TemplateApplyWarning[]> {
  const warnings: TemplateApplyWarning[] = [];
  for (const templateJob of templateJobs) {
    if (templateJob.children && templateJob.children.length > 0) {
      // HIERARCHICAL: create a REAL parent Job row, then children with parentId set.
      // Parent's dates span from the earliest child start to the latest child end.
      const childWindows = templateJob.children.map((c) => ({
        start: snapToWorkingDay(addWeeks(plotStartDate, c.startWeek - 1), "forward"),
        end: computeJobEndDate(plotStartDate, c.startWeek, c.endWeek, c.durationDays ?? null),
      }));
      const parentStart = new Date(Math.min(...childWindows.map((w) => w.start.getTime())));
      const parentEnd = new Date(Math.max(...childWindows.map((w) => w.end.getTime())));

      const parentJob = await tx.job.create({
        data: {
          name: templateJob.name,
          description: templateJob.description,
          plotId,
          startDate: parentStart,
          endDate: parentEnd,
          originalStartDate: parentStart,
          originalEndDate: parentEnd,
          status: "NOT_STARTED",
          stageCode: templateJob.stageCode || null,
          weatherAffected: templateJob.weatherAffected ?? false,
          weatherAffectedType: templateJob.weatherAffectedType ?? null,
          // parentId is null — this IS the parent
          parentStage: null,
          sortOrder: templateJob.sortOrder * 100,
          ...(assignedToId ? { assignedToId } : {}),
        },
      });

      // Parent-stage contractor assignment (if template specified one on the parent)
      if (templateJob.contactId) {
        await tx.jobContractor.create({
          data: { jobId: parentJob.id, contactId: templateJob.contactId },
        });
      }

      // Parent-stage orders attach to the parent Job directly (clean, no hacky first-child routing)
      if (templateJob.orders.length > 0) {
        await createOrdersFromTemplate(
          tx,
          parentJob.id,
          parentStart,
          templateJob.orders,
          supplierMappings,
          templateJob.name,
          warnings
        );
      }

      // Create child Jobs with parentId pointing at the real parent
      for (let i = 0; i < templateJob.children.length; i++) {
        const child = templateJob.children[i];
        const { start: jobStartDate, end: jobEndDate } = childWindows[i];

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
            parentId: parentJob.id,
            parentStage: templateJob.name,
            sortOrder: templateJob.sortOrder * 100 + child.sortOrder + 1,
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
          supplierMappings,
          `${templateJob.name} / ${child.name}`,
          warnings
        );
      }
    } else {
      // FLAT (legacy): create Job directly from template job
      const jobStartDate = snapToWorkingDay(
        addWeeks(plotStartDate, templateJob.startWeek - 1),
        "forward"
      );
      const jobEndDate = computeJobEndDate(
        plotStartDate,
        templateJob.startWeek,
        templateJob.endWeek,
        templateJob.durationDays ?? null,
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
        supplierMappings,
        templateJob.name,
        warnings
      );
    }
  }
  return warnings;
}

async function createOrdersFromTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  jobId: string,
  jobStartDate: Date,
  orders: TemplateOrderWithItems[],
  supplierMappings: Record<string, string> | null,
  templateJobName: string,
  warnings: TemplateApplyWarning[]
) {
  for (const templateOrder of orders) {
    // Use explicit mapping if provided, otherwise fall back to template's supplier
    const supplierId =
      supplierMappings?.[templateOrder.id] ||
      templateOrder.supplierId ||
      null;
    if (!supplierId) {
      // Surface to caller so user knows something was silently dropped
      warnings.push({
        kind: "order_skipped_no_supplier",
        templateJobName,
        itemsDescription: templateOrder.itemsDescription,
      });
      continue;
    }

    // Snap dates to working days — prevents weekend orderDate/deliveryDate that confuse cascade
    const rawDateOfOrder = addWeeks(jobStartDate, templateOrder.orderWeekOffset);
    const dateOfOrder = snapToWorkingDay(rawDateOfOrder, "back");

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

    const rawExpectedDelivery = leadTimeDays
      ? addDays(dateOfOrder, leadTimeDays)
      : addWeeks(dateOfOrder, templateOrder.deliveryWeekOffset);
    const expectedDeliveryDate = snapToWorkingDay(rawExpectedDelivery, "forward");

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
