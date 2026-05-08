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
  // Legacy offset fields — kept for backward compat with templates created
  // before the anchor-fields rework. New templates write anchor fields
  // exclusively; apply-time prefers them when present.
  orderWeekOffset: number;
  deliveryWeekOffset: number;
  leadTimeAmount?: number | null;
  leadTimeUnit?: string | null;
  // Anchor fields — canonical source of truth post-May-2026 rework.
  // When set, apply-time computes order dates from these (anchor job's
  // start + offset, then add lead time for delivery). Legacy offsets
  // are ignored when these are populated.
  anchorType?: string | null;
  anchorAmount?: number | null;
  anchorUnit?: string | null;
  anchorDirection?: string | null;
  anchorJobId?: string | null;
  items: TemplateOrderItem[];
}

interface TemplateJobWithChildren {
  id: string;
  name: string;
  description: string | null;
  stageCode: string | null;
  sortOrder: number;
  startWeek: number;
  endWeek: number;
  durationDays?: number | null;
  weatherAffected?: boolean;
  weatherAffectedType?: string | null;
  parentId: string | null;
  contactId?: string | null;
  orders: TemplateOrderWithItems[];
  children: Array<{
    id: string;
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
 * Compute a job's end date from its template fields. durationDays wins
 * if set (days-granularity override). Otherwise falls back to the
 * week-based calculation that's been in place since v1.
 */
function computeJobEndDate(
  plotStartDate: Date,
  startWeek: number,
  endWeek: number,
  durationDays: number | null | undefined,
): Date {
  const startDate = snapToWorkingDay(addWeeks(plotStartDate, startWeek - 1), "forward");
  if (durationDays && durationDays > 0) {
    return snapToWorkingDay(addWorkingDays(startDate, durationDays - 1), "forward");
  }
  return snapToWorkingDay(addDays(addWeeks(plotStartDate, endWeek - 1), 6), "forward");
}

/**
 * Pre-pass: walk the template tree and compute the start/end date that
 * each templateJob will have on the new plot. Used so that anchor-based
 * orders can resolve their anchor job's date even if the anchor lives in
 * a sibling stage that hasn't been created yet at order-creation time.
 *
 * Mirrors the cascade logic inside createJobsFromTemplate: hierarchical
 * stages anchor at parent.startWeek and stack children sequentially by
 * sortOrder; flat (legacy) jobs use their stored startWeek/endWeek.
 */
function computeTemplateDateMap(
  plotStartDate: Date,
  templateJobs: TemplateJobWithChildren[],
): Map<string, { start: Date; end: Date }> {
  const map = new Map<string, { start: Date; end: Date }>();

  for (const job of templateJobs) {
    if (job.children && job.children.length > 0) {
      const parentAnchor = snapToWorkingDay(
        addWeeks(plotStartDate, job.startWeek - 1),
        "forward",
      );
      const sortedChildren = [...job.children].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      let cursor = parentAnchor;
      let firstChildStart: Date | null = null;
      let lastChildEnd: Date | null = null;
      for (const c of sortedChildren) {
        const days =
          c.durationDays && c.durationDays > 0
            ? c.durationDays
            : c.durationWeeks && c.durationWeeks > 0
              ? c.durationWeeks * 5
              : 5;
        const cStart = snapToWorkingDay(cursor, "forward");
        const cEnd = addWorkingDays(cStart, days - 1);
        map.set(c.id, { start: cStart, end: cEnd });
        firstChildStart ??= cStart;
        lastChildEnd = cEnd;
        cursor = addWorkingDays(cEnd, 1);
      }
      map.set(job.id, {
        start: firstChildStart ?? parentAnchor,
        end: lastChildEnd ?? parentAnchor,
      });
    } else {
      const start = snapToWorkingDay(
        addWeeks(plotStartDate, job.startWeek - 1),
        "forward",
      );
      const end = computeJobEndDate(
        plotStartDate,
        job.startWeek,
        job.endWeek,
        job.durationDays ?? null,
      );
      map.set(job.id, { start, end });
    }
  }

  return map;
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
  // Pre-compute every templateJob's start/end on this plot so that
  // anchor-based orders can resolve their anchor job's date even if it
  // lives in a different stage that hasn't been written to the DB yet.
  // Single source of truth for "when does template job X land on this
  // plot" — both the apply loop below and the order date-resolver read
  // from this map.
  const templateDateMap = computeTemplateDateMap(plotStartDate, templateJobs);

  for (const templateJob of templateJobs) {
    if (templateJob.children && templateJob.children.length > 0) {
      // HIERARCHICAL: create a REAL parent Job row, then children with parentId set.
      //
      // Keith Apr 2026 model: children cascade SEQUENTIALLY in sortOrder.
      // Previously each child's startWeek/endWeek on the template dictated
      // its position, which let templates author overlapping or gapped
      // children — confusing and not what users want. Now:
      //   - Anchor point = plot-start + parent.startWeek-1 (parent offset)
      //   - First child starts at the anchor (snapped to working day)
      //   - Each subsequent child starts the working day after the prev
      //     child ends
      //   - Child duration = durationDays (or durationWeeks × 5 fallback)
      //   - Parent span = first child start → last child end
      const parentAnchor = snapToWorkingDay(
        addWeeks(plotStartDate, templateJob.startWeek - 1),
        "forward",
      );
      const sortedChildren = [...templateJob.children].sort(
        (a, b) => a.sortOrder - b.sortOrder
      );
      const childWindows: Array<{ start: Date; end: Date }> = [];
      let cursor = parentAnchor;
      for (const c of sortedChildren) {
        const durationDays =
          c.durationDays && c.durationDays > 0
            ? c.durationDays
            : c.durationWeeks && c.durationWeeks > 0
              ? c.durationWeeks * 5
              : 5; // fallback: one working week
        const jobStart = snapToWorkingDay(cursor, "forward");
        const jobEnd = addWorkingDays(jobStart, durationDays - 1);
        childWindows.push({ start: jobStart, end: jobEnd });
        // Next child starts one working day after this one ends.
        cursor = addWorkingDays(jobEnd, 1);
      }
      const parentStart = childWindows[0].start;
      const parentEnd = childWindows[childWindows.length - 1].end;

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
          warnings,
          templateDateMap,
        );
      }

      // Create child Jobs with parentId pointing at the real parent.
      // Iterate sortedChildren so the childWindows array lines up with
      // each child 1:1 (sortedChildren[i] ↔ childWindows[i]).
      for (let i = 0; i < sortedChildren.length; i++) {
        const child = sortedChildren[i];
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
          warnings,
          templateDateMap,
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
        warnings,
        templateDateMap,
      );
    }
  }
  return warnings;
}

/**
 * Convert a (amount, unit) pair into working days. Used by the
 * anchor-fields path to translate "2 weeks before Brickwork" →
 * 10 working days.
 */
function unitsToDays(
  amount: number | null | undefined,
  unit: string | null | undefined,
): number {
  const a = amount && amount > 0 ? amount : 0;
  if (a === 0) return 0;
  return unit === "weeks" ? a * 5 : a;
}

/**
 * Resolve an order's `dateOfOrder` and `expectedDeliveryDate` from a
 * TemplateOrder + the date map computed earlier. Anchor fields take
 * precedence (canonical post-May-2026 SSOT rework). Legacy offset
 * fields are honoured only when anchor fields are missing — keeps
 * pre-rework templates working without a migration.
 */
function resolveOrderDates(
  templateOrder: TemplateOrderWithItems,
  ownerJobStartDate: Date,
  templateDateMap: Map<string, { start: Date; end: Date }>,
): { dateOfOrder: Date; expectedDeliveryDate: Date; leadTimeDays: number | null } {
  // ── ANCHOR PATH (canonical) ──────────────────────────────────────
  // anchorType = "order"  → user is anchoring the ORDER date directly
  // anchorType = "arrive" → user is anchoring the DELIVERY date
  // anchorJobId points at the template job whose start anchors the
  // order. Falls back to the order's owning job if the anchor job
  // isn't in the map (shouldn't happen, defensive).
  if (templateOrder.anchorType) {
    const anchorEntry = templateOrder.anchorJobId
      ? templateDateMap.get(templateOrder.anchorJobId)
      : null;
    const anchorStart = anchorEntry?.start ?? ownerJobStartDate;
    const offsetDays = unitsToDays(templateOrder.anchorAmount, templateOrder.anchorUnit);
    const sign = templateOrder.anchorDirection === "after" ? 1 : -1;
    const leadTimeDays = unitsToDays(templateOrder.leadTimeAmount, templateOrder.leadTimeUnit);

    let orderDate: Date;
    let deliveryDate: Date;
    if (templateOrder.anchorType === "order") {
      orderDate = addWorkingDays(anchorStart, sign * offsetDays);
      deliveryDate = addWorkingDays(orderDate, leadTimeDays);
    } else {
      // "arrive" — work backwards from delivery
      deliveryDate = addWorkingDays(anchorStart, sign * offsetDays);
      orderDate = addWorkingDays(deliveryDate, -leadTimeDays);
    }
    return {
      dateOfOrder: snapToWorkingDay(orderDate, "back"),
      expectedDeliveryDate: snapToWorkingDay(deliveryDate, "forward"),
      leadTimeDays: leadTimeDays > 0 ? leadTimeDays : null,
    };
  }

  // ── LEGACY OFFSET PATH (fallback only) ───────────────────────────
  const rawDateOfOrder = addWeeks(ownerJobStartDate, templateOrder.orderWeekOffset);
  const dateOfOrder = snapToWorkingDay(rawDateOfOrder, "back");

  let leadTimeDays: number | null = null;
  if (templateOrder.leadTimeAmount && templateOrder.leadTimeUnit) {
    leadTimeDays =
      templateOrder.leadTimeUnit === "weeks"
        ? templateOrder.leadTimeAmount * 7
        : templateOrder.leadTimeAmount;
  } else if (templateOrder.deliveryWeekOffset > 0) {
    leadTimeDays = templateOrder.deliveryWeekOffset * 7;
  }

  const rawExpectedDelivery = leadTimeDays
    ? addDays(dateOfOrder, leadTimeDays)
    : addWeeks(dateOfOrder, templateOrder.deliveryWeekOffset);
  const expectedDeliveryDate = snapToWorkingDay(rawExpectedDelivery, "forward");

  return { dateOfOrder, expectedDeliveryDate, leadTimeDays };
}

async function createOrdersFromTemplate(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  jobId: string,
  jobStartDate: Date,
  orders: TemplateOrderWithItems[],
  supplierMappings: Record<string, string> | null,
  templateJobName: string,
  warnings: TemplateApplyWarning[],
  templateDateMap: Map<string, { start: Date; end: Date }>,
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

    const { dateOfOrder, expectedDeliveryDate, leadTimeDays } = resolveOrderDates(
      templateOrder,
      jobStartDate,
      templateDateMap,
    );

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
