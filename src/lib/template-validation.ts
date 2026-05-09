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

/**
 * Quick-fix routing for an issue. The validation panel renders a small
 * button that, on click, dispatches a `template-action` window event
 * with this kind. The relevant components (TemplateEditor for orders,
 * TemplateExtras for materials/drawings) listen for the event and open
 * the appropriate dialog.
 */
export type TemplateIssueActionKind =
  | "open-orders-table"
  | "open-contractors-table"
  | "scroll-to-jobs"
  | "add-material"
  | "upload-drawing"
  | "edit-order"
  | "edit-job";

export interface TemplateIssueAction {
  kind: TemplateIssueActionKind;
  label: string;
}

/** A single affected row inside an aggregated warning. Surfaced as a
 *  drill-down list under the warning so the user can click straight
 *  into the per-item edit dialog. */
export interface TemplateIssueAffectedItem {
  /** Action fired when the user clicks the row. */
  kind: "edit-order" | "edit-job";
  /** Display text for the row (e.g. "Brickwork 1st lift — Lintels"). */
  label: string;
  /** Order id for "edit-order"; sub-job id for "edit-job". */
  itemId: string;
  /** For orders, the parent sub-job (needed by openEditOrder). */
  jobId?: string;
}

export interface TemplateIssue {
  severity: TemplateIssueSeverity;
  message: string;
  /** Job (parent or child) the issue is attached to, if any. */
  jobId?: string;
  /** Order the issue is attached to, if any. */
  orderId?: string;
  /** Quick-fix action surfaced on the panel as a small button. */
  action?: TemplateIssueAction;
  /** Affected items the warning applies to. When present, the panel
   *  renders a "show N items" toggle that expands the list inline so
   *  the user can drill into each one. */
  affectedItems?: TemplateIssueAffectedItem[];
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

/** Optional context for completeness checks that need data living
 *  outside `TemplateData` itself (materials + documents are fetched
 *  separately from the template payload). */
export interface ValidationContext {
  /** Number of TemplateMaterial rows for this template / variant. */
  materialCount?: number;
  /** Number of TemplateDocument rows for this template / variant. */
  documentCount?: number;
}

export function validateTemplate(
  template: TemplateData,
  ctx: ValidationContext = {},
): TemplateIssue[] {
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

  // --- Sub-job-level completeness checks (aggregated) ---------------------
  // Aggregated so a 30-sub-job template doesn't dump 30 individual rows
  // when contractors aren't assigned yet — that just drowns the panel.
  // affectedItems lets the panel expand to show the full list with
  // drill-down click-to-edit per row.
  const subJobsNoContractorLabels: string[] = [];
  const subJobsNoContractorItems: TemplateIssueAffectedItem[] = [];
  for (const stage of template.jobs) {
    for (const child of stage.children ?? []) {
      if (!child.contactId) {
        subJobsNoContractorLabels.push(`${stage.name} › ${child.name}`);
        subJobsNoContractorItems.push({
          kind: "edit-job",
          label: `${stage.name} › ${child.name}`,
          itemId: child.id,
        });
      }
    }
  }
  if (subJobsNoContractorLabels.length > 0) {
    issues.push({
      severity: "warning",
      message: `${subJobsNoContractorLabels.length} sub-job${subJobsNoContractorLabels.length === 1 ? "" : "s"} have no contractor assigned (e.g. ${truncateList(subJobsNoContractorLabels)}).`,
      action: { kind: "open-contractors-table", label: "Bulk assign" },
      affectedItems: subJobsNoContractorItems,
    });
  }

  // --- Order-level checks -------------------------------------------------

  // Build a set of valid job IDs so we can detect orphaned anchorJobId.
  const validJobIds = new Set<string>();
  for (const job of allJobs(template)) validJobIds.add(job.id);

  // Aggregated lists for completeness checks
  const ordersNoSupplier: string[] = [];
  const ordersNoSupplierItems: TemplateIssueAffectedItem[] = [];
  const ordersNoItems: string[] = [];
  const ordersNoItemsItems: TemplateIssueAffectedItem[] = [];

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

    // No supplier — order can't be auto-fired on apply or on job-start.
    if (!order.supplierId) {
      ordersNoSupplier.push(`${job.name} (${order.itemsDescription ?? "no description"})`);
      ordersNoSupplierItems.push({
        kind: "edit-order",
        label: `${job.name} — ${order.itemsDescription ?? "no description"}`,
        itemId: order.id,
        jobId: job.id,
      });
    }

    // No items at all — even if itemsDescription is set, no quantities/
    // line items means the supplier can't price or pack it. We split
    // this into two separate aggregated warnings (no items vs no items
    // AND no description) so the messaging is clearer.
    const hasItems = order.items && order.items.length > 0;
    const hasDescription =
      order.itemsDescription && order.itemsDescription.trim() !== "";
    if (!hasItems && hasDescription) {
      ordersNoItems.push(`${job.name} (${order.itemsDescription})`);
      ordersNoItemsItems.push({
        kind: "edit-order",
        label: `${job.name} — ${order.itemsDescription}`,
        itemId: order.id,
        jobId: job.id,
      });
    } else if (!hasItems && !hasDescription) {
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

  if (ordersNoSupplier.length > 0) {
    issues.push({
      severity: "warning",
      message: `${ordersNoSupplier.length} order${ordersNoSupplier.length === 1 ? "" : "s"} have no supplier assigned (e.g. ${truncateList(ordersNoSupplier)}).`,
      action: { kind: "open-orders-table", label: "Bulk assign" },
      affectedItems: ordersNoSupplierItems,
    });
  }
  if (ordersNoItems.length > 0) {
    issues.push({
      severity: "warning",
      message: `${ordersNoItems.length} order${ordersNoItems.length === 1 ? "" : "s"} have a description but no priced items (e.g. ${truncateList(ordersNoItems)}). Costs won't roll up.`,
      action: { kind: "open-orders-table", label: "Bulk edit" },
      affectedItems: ordersNoItemsItems,
    });
  }

  // --- Template-wide completeness checks ----------------------------------
  // Only flag these if we've actually been given the count via context
  // (the panel fetches them separately). If ctx is empty we just skip,
  // so the validation function stays useful in tests / non-UI contexts.
  if (template.jobs.length > 0) {
    if (ctx.materialCount === 0) {
      issues.push({
        severity: "warning",
        message:
          "No quants / materials added yet. Plots applied from this template won't have any tracked materials.",
        action: { kind: "add-material", label: "Add material" },
      });
    }
    if (ctx.documentCount === 0) {
      issues.push({
        severity: "warning",
        message:
          "No drawings uploaded yet. Plots applied from this template won't have any drawings linked.",
        action: { kind: "upload-drawing", label: "Upload drawing" },
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

/**
 * Truncate an aggregated list to keep messages readable. Shows the
 * first three names verbatim, then "+ N more".
 */
function truncateList(items: string[]): string {
  if (items.length <= 3) return items.join(", ");
  return `${items.slice(0, 3).join(", ")} + ${items.length - 3} more`;
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
