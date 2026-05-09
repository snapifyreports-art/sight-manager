/**
 * Pure (no DB, no fetch) computation of "what will happen if I apply
 * this template to a plot starting on date X". Used by the apply-preview
 * modal so the user can sanity-check before committing 30+ jobs to 26
 * plots.
 *
 * Mirrors the apply-template helper's arithmetic at a high level —
 * weeks counted from canonical durationDays + sortOrder, calendar dates
 * derived via working-day arithmetic.
 */

import { addWorkingDays, snapToWorkingDay } from "@/lib/working-days";
import type {
  TemplateData,
  TemplateJobData,
  TemplateOrderData,
} from "@/components/settings/types";

export interface OrderPreviewRow {
  id: string;
  jobName: string;
  itemsDescription: string;
  orderWeek: number;
  deliveryWeek: number;
  /** Calendar Date you'd place the order, snapped to a working day. */
  orderDate: Date;
  /** Calendar Date you'd expect arrival on site, snapped to a working day. */
  deliveryDate: Date;
  totalCost: number;
}

export interface TemplatePreview {
  totalWorkingDays: number;
  totalWeeks: number;
  stageCount: number;
  subJobCount: number;
  startDate: Date;
  endDate: Date;
  orders: OrderPreviewRow[];
  /** Sum of every TemplateOrderItem qty × unitCost. */
  ordersTotalCost: number;
  /** Order weeks bucketed for "is anything piling up?" heuristic. */
  collisionWeeks: Array<{ week: number; orderCount: number }>;
}

function jobDurationDays(job: TemplateJobData): number {
  if (job.durationDays && job.durationDays > 0) return job.durationDays;
  if (job.durationWeeks && job.durationWeeks > 0) return job.durationWeeks * 5;
  return 0;
}

function unitsToWeeks(
  amount: number | null | undefined,
  unit: string | null | undefined,
): number {
  const a = amount && amount > 0 ? amount : 0;
  if (a === 0) return 0;
  const u = (unit ?? "").toString().toLowerCase();
  return u === "days" || u === "day" ? Math.round(a / 5) : a;
}

function* allJobs(template: TemplateData): Generator<TemplateJobData> {
  for (const stage of template.jobs) {
    yield stage;
    for (const child of stage.children ?? []) {
      yield child;
      for (const grand of child.children ?? []) yield grand;
    }
  }
}

export function previewTemplateApply(
  template: TemplateData,
  startDate: Date,
): TemplatePreview {
  // Snap to a working day so weekend starts behave as the apply path will.
  const start = snapToWorkingDay(startDate, "forward");

  // Total working-day length is sum of every leaf's durationDays.
  // Stages that are atomic (no children) contribute their own durationDays.
  let totalDays = 0;
  let stageCount = 0;
  let subJobCount = 0;
  for (const stage of template.jobs) {
    stageCount += 1;
    if (!stage.children || stage.children.length === 0) {
      totalDays += jobDurationDays(stage);
    } else {
      for (const child of stage.children) {
        subJobCount += 1;
        if (!child.children || child.children.length === 0) {
          totalDays += jobDurationDays(child);
        } else {
          for (const g of child.children) {
            subJobCount += 1;
            totalDays += jobDurationDays(g);
          }
        }
      }
    }
  }
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 5));
  const endDate = totalDays > 0 ? addWorkingDays(start, totalDays - 1) : start;

  // Build a CANONICAL week map for every job (May 2026 — same fix as
  // apply-template-helpers: stages cascade sequentially from week 1
  // by their canonical durationDays, NOT by the cached startWeek
  // which can drift when resequence didn't run after an edit).
  // Order anchor lookups read from this map instead of the cached
  // startWeek field, so order delivery dates stay accurate even when
  // the template's cache is stale.
  const canonicalWeek = computeCanonicalWeekMap(template);

  const allJobMap = new Map<string, TemplateJobData>();
  for (const j of allJobs(template)) allJobMap.set(j.id, j);

  const orderRows: OrderPreviewRow[] = [];
  for (const job of allJobs(template)) {
    for (const order of job.orders ?? []) {
      const { orderWeek, deliveryWeek } = computeOrderWeek(
        order,
        job,
        allJobMap,
        canonicalWeek,
      );
      // Convert week → working-day cursor → calendar date.
      const orderDay = (orderWeek - 1) * 5;
      const deliveryDay = (deliveryWeek - 1) * 5;
      const orderDate = addWorkingDays(start, Math.max(0, orderDay));
      const deliveryDate = addWorkingDays(start, Math.max(0, deliveryDay));
      const cost =
        order.items?.reduce(
          (sum, it) => sum + (it.quantity || 0) * (it.unitCost || 0),
          0,
        ) ?? 0;
      orderRows.push({
        id: order.id,
        jobName: job.name,
        itemsDescription: order.itemsDescription ?? "(no description)",
        orderWeek,
        deliveryWeek,
        orderDate,
        deliveryDate,
        totalCost: cost,
      });
    }
  }
  orderRows.sort((a, b) => a.orderWeek - b.orderWeek);

  const ordersTotalCost = orderRows.reduce((sum, o) => sum + o.totalCost, 0);

  // Collision detection: any week with ≥3 deliveries flagged.
  const deliveryCounts = new Map<number, number>();
  for (const o of orderRows) {
    deliveryCounts.set(
      o.deliveryWeek,
      (deliveryCounts.get(o.deliveryWeek) ?? 0) + 1,
    );
  }
  const collisionWeeks: Array<{ week: number; orderCount: number }> = [];
  for (const [week, count] of deliveryCounts) {
    if (count >= 3) collisionWeeks.push({ week, orderCount: count });
  }
  collisionWeeks.sort((a, b) => a.week - b.week);

  return {
    totalWorkingDays: totalDays,
    totalWeeks,
    stageCount,
    subJobCount,
    startDate: start,
    endDate,
    orders: orderRows,
    ordersTotalCost,
    collisionWeeks,
  };
}

function computeOrderWeek(
  order: TemplateOrderData,
  ownerJob: TemplateJobData,
  allJobMap: Map<string, TemplateJobData>,
  canonicalWeek: Map<string, { startWeek: number; endWeek: number }>,
): { orderWeek: number; deliveryWeek: number } {
  const refJob = order.anchorJobId
    ? allJobMap.get(order.anchorJobId) ?? ownerJob
    : ownerJob;
  // Prefer the canonical cascade week — falls back to the cached
  // value only if the canonical map didn't include this job (very
  // defensive; should never happen for normal templates).
  const refStart =
    canonicalWeek.get(refJob.id)?.startWeek ?? refJob.startWeek;
  const ownerStart =
    canonicalWeek.get(ownerJob.id)?.startWeek ?? ownerJob.startWeek;
  const amountWeeks = unitsToWeeks(order.anchorAmount, order.anchorUnit);
  const leadWeeks = unitsToWeeks(order.leadTimeAmount, order.leadTimeUnit);
  const sign = order.anchorDirection === "after" ? 1 : -1;

  let orderWeek: number;
  let deliveryWeek: number;
  if (!order.anchorType) {
    orderWeek = ownerStart + (order.orderWeekOffset ?? -2);
    deliveryWeek = orderWeek + (order.deliveryWeekOffset ?? 0);
  } else if (
    order.anchorType === "order" ||
    order.anchorType === "JOB_START" ||
    order.anchorType === "STAGE_START"
  ) {
    orderWeek = refStart + sign * amountWeeks;
    deliveryWeek = orderWeek + leadWeeks;
  } else {
    deliveryWeek = refStart + sign * amountWeeks;
    orderWeek = deliveryWeek - leadWeeks;
  }
  return {
    orderWeek: Math.max(1, orderWeek),
    deliveryWeek: Math.max(1, deliveryWeek),
  };
}

/**
 * Build a canonical (templateJob.id → { startWeek, endWeek }) map by
 * cascading stages and their children sequentially from week 1.
 * Mirrors the apply-template stage cascade so the preview shows what
 * apply will actually produce, ignoring cached startWeek/endWeek
 * fields that could be stale.
 */
function computeCanonicalWeekMap(
  template: TemplateData,
): Map<string, { startWeek: number; endWeek: number }> {
  const map = new Map<string, { startWeek: number; endWeek: number }>();
  // Working-day cursor — week 1 starts at day 0.
  let dayCursor = 0;
  const sortedStages = [...template.jobs].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  for (const stage of sortedStages) {
    const stageStartDay = dayCursor;
    if (stage.children && stage.children.length > 0) {
      const sortedChildren = [...stage.children].sort(
        (a, b) => a.sortOrder - b.sortOrder,
      );
      let childCursor = dayCursor;
      for (const c of sortedChildren) {
        const days =
          c.durationDays && c.durationDays > 0
            ? c.durationDays
            : c.durationWeeks && c.durationWeeks > 0
              ? c.durationWeeks * 5
              : 5;
        const cStartWeek = Math.floor(childCursor / 5) + 1;
        const cEndWeek = Math.floor((childCursor + days - 1) / 5) + 1;
        map.set(c.id, { startWeek: cStartWeek, endWeek: cEndWeek });
        childCursor += days;
      }
      dayCursor = childCursor;
    } else {
      const days =
        stage.durationDays && stage.durationDays > 0
          ? stage.durationDays
          : stage.durationWeeks && stage.durationWeeks > 0
            ? stage.durationWeeks * 5
            : 5;
      dayCursor += days;
    }
    const stageStartWeek = Math.floor(stageStartDay / 5) + 1;
    const stageEndWeek = Math.max(
      stageStartWeek,
      Math.floor((dayCursor - 1) / 5) + 1,
    );
    map.set(stage.id, { startWeek: stageStartWeek, endWeek: stageEndWeek });
  }
  return map;
}

/** Format a cost as £-prefixed string. */
export function formatGBP(amount: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}
