/**
 * Template validation — scans a PlotTemplate for things that will trip
 * up apply-template, the Timeline, or the cascade engine. Returns a flat
 * list of issues sorted by severity.
 *
 * Two severities:
 *   - "error"   — apply-template will reject this template, OR it will
 *                 silently produce broken data on a real plot.
 *   - "warning" — works but probably not what the user intended.
 *
 * Run on the editor every render — it's cheap (single pass over jobs +
 * orders) and pure. NO server round-trips required.
 */

import type {
  TemplateData,
  TemplateJobData,
  TemplateOrderData,
} from "@/components/settings/types";

export type TemplateIssueSeverity = "error" | "warning";

export interface TemplateIssue {
  severity: TemplateIssueSeverity;
  message: string;
  /** Job (parent or child) the issue is attached to, if any. */
  jobId?: string;
  /** Order the issue is attached to, if any. */
  orderId?: string;
}

/**
 * Working-day duration of a sub-job (or atomic stage). Mirrors
 * `childDurationDays` on the server so reader and writer agree.
 */
function jobDurationDays(job: TemplateJobData): number {
  if (job.durationDays && job.durationDays > 0) return job.durationDays;
  if (job.durationWeeks && job.durationWeeks > 0) return job.durationWeeks * 5;
  return 0;
}

/** Walk every job in the template (parents + children) once. */
function* allJobs(template: TemplateData): Generator<TemplateJobData> {
  for (const stage of template.jobs) {
    yield stage;
    for (const child of stage.children ?? []) {
      yield child;
      // Three levels deep occurs in some templates per the editor —
      // walk grandchildren too.
      for (const grand of child.children ?? []) {
        yield grand;
      }
    }
  }
}

/** Walk every order on every job. */
function* allOrders(
  template: TemplateData,
): Generator<{ order: TemplateOrderData; job: TemplateJobData }> {
  for (const job of allJobs(template)) {
    for (const order of job.orders ?? []) {
      yield { order, job };
    }
  }
}

export function validateTemplate(template: TemplateData): TemplateIssue[] {
  const issues: TemplateIssue[] = [];

  // --- Stage-level checks -------------------------------------------------

  if (template.jobs.length === 0) {
    issues.push({
      severity: "error",
      message:
        "Template has no stages. Apply-template will reject it — add at least one stage.",
    });
  }

  // Duplicate stage codes — useful as labels but not a hard constraint;
  // duplicates make the bulk-stages "is X already added" check fire
  // false positives.
  const stageCodeCounts = new Map<string, number>();
  for (const stage of template.jobs) {
    if (!stage.stageCode) continue;
    stageCodeCounts.set(
      stage.stageCode,
      (stageCodeCounts.get(stage.stageCode) ?? 0) + 1,
    );
  }
  for (const [code, count] of stageCodeCounts) {
    if (count > 1) {
      issues.push({
        severity: "warning",
        message: `Stage code "${code}" appears ${count} times. The library can't tell them apart.`,
      });
    }
  }

  for (const stage of template.jobs) {
    const childCount = stage.children?.length ?? 0;
    const ownDays = jobDurationDays(stage);

    // Atomic stage with no children AND no duration — saves fine but
    // applies as zero days, which the cascade silently rounds up.
    if (childCount === 0 && ownDays === 0) {
      issues.push({
        severity: "error",
        message: `Stage "${stage.name}" has no sub-jobs and no duration set — apply-template will treat it as 0 days.`,
        jobId: stage.id,
      });
    }

    // Sub-jobs with zero duration. Any 0-day sub-job effectively vanishes
    // from the Gantt and breaks order anchors that reference it.
    for (const child of stage.children ?? []) {
      if (jobDurationDays(child) === 0) {
        issues.push({
          severity: "error",
          message: `Sub-job "${child.name}" (in ${stage.name}) has no duration. It will collapse to 0 days on apply.`,
          jobId: child.id,
        });
      }
    }
  }

  // --- Order-level checks -------------------------------------------------

  // Build a set of valid job IDs so we can detect orphaned anchorJobId.
  const validJobIds = new Set<string>();
  for (const job of allJobs(template)) validJobIds.add(job.id);

  for (const { order, job } of allOrders(template)) {
    // Anchor points at a job that no longer exists (was deleted).
    if (order.anchorJobId && !validJobIds.has(order.anchorJobId)) {
      issues.push({
        severity: "error",
        message: `Order on "${job.name}" anchors to a job that no longer exists. The delivery date will fall back to a default.`,
        orderId: order.id,
        jobId: job.id,
      });
    }

    // Order has anchor type/amount/unit/direction half-set — without
    // all four the server-side derivation can't compute offsets.
    const anchorPartiallySet =
      Boolean(order.anchorType) ||
      order.anchorAmount != null ||
      Boolean(order.anchorUnit) ||
      Boolean(order.anchorDirection);
    const anchorFullySet =
      Boolean(order.anchorType) &&
      order.anchorAmount != null &&
      Boolean(order.anchorUnit) &&
      Boolean(order.anchorDirection);
    if (anchorPartiallySet && !anchorFullySet) {
      issues.push({
        severity: "warning",
        message: `Order on "${job.name}" has incomplete anchor settings. Set type, amount, unit AND direction or clear them all.`,
        orderId: order.id,
        jobId: job.id,
      });
    }

    // No items and no description — order will arrive on site with no
    // detail of what's expected. Not fatal, but easily fixed.
    if (
      (!order.items || order.items.length === 0) &&
      (!order.itemsDescription || order.itemsDescription.trim() === "")
    ) {
      issues.push({
        severity: "warning",
        message: `Order on "${job.name}" has no items or description. The supplier won't know what to send.`,
        orderId: order.id,
        jobId: job.id,
      });
    }

    // Lead time half-set
    if ((order.leadTimeAmount != null) !== Boolean(order.leadTimeUnit)) {
      issues.push({
        severity: "warning",
        message: `Order on "${job.name}" has lead time amount or unit set but not both.`,
        orderId: order.id,
        jobId: job.id,
      });
    }
  }

  // Sort errors first, warnings second. Stable order within each
  // severity so the panel doesn't reshuffle on every render.
  return issues.sort((a, b) => {
    if (a.severity === b.severity) return 0;
    return a.severity === "error" ? -1 : 1;
  });
}

export function summariseIssues(issues: TemplateIssue[]): {
  errorCount: number;
  warningCount: number;
} {
  let errorCount = 0;
  let warningCount = 0;
  for (const i of issues) {
    if (i.severity === "error") errorCount++;
    else warningCount++;
  }
  return { errorCount, warningCount };
}
