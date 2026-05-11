# SSOT audit — May 2026

_The field is the field. Why did the same field have different values in
different places?_

This document captures every duplication-of-logic candidate found in
the codebase as of May 2026, with the resolution for each. Read top to
bottom; the live status is in the right-most column.

---

## Concept: "Is this job overdue?"

Five places used to compute the boolean. Numbers across views could
disagree because Tasks scoped narrower than Daily Brief etc.

| Where | Was | Now |
|---|---|---|
| `src/app/api/sites/[id]/daily-brief/route.ts` | inline `endDate < dayStart && status != COMPLETED` | `whereJobEndOverdue(dayStart)` |
| `src/app/api/tasks/route.ts` | inline `status: IN_PROGRESS, endDate < now` (narrower!) | `whereJobEndOverdue(now)` (broadened to match) |
| `src/app/(dashboard)/dashboard/page.tsx` | inline `endDate < new Date() && status != COMPLETED` | `whereJobEndOverdue(new Date())` |
| `src/app/api/sites/[id]/heatmap/route.ts` | inline JS filter | `isJobEndOverdue(j, today)` |
| `src/app/api/analytics/route.ts` | inline JS filter | `isJobEndOverdue(j, now)` |

**Canonical**: `src/lib/lateness.ts`
- `whereJobEndOverdue(today)` — Prisma where clause for the canonical "overdue at end"
- `isJobEndOverdue(job, today)` — boolean for already-fetched job shapes
- `workingDaysEndOverdue(job, today)` — number of working days overdue
- mirror trio for "overdue at start"
- `whereOrderOverdue` / `isOrderOverdue` for the order analog

**Status**: ✅ Fixed batch 98.

---

## Concept: "Working days vs calendar days"

The heatmap RAG was calibrated against `> 14 working days` for amber/red
thresholds, but the actual count used `differenceInDays` (calendar). On
a job spanning a weekend that's a 2-day silent skew. Result: the RAG
status could disagree with what Daily Brief / DelayReport reported for
the same plot.

| Where | Was | Now |
|---|---|---|
| `src/app/api/sites/[id]/heatmap/route.ts` line 62 | `differenceInDays(today, endDate)` | `workingDaysEndOverdue(j, today)` |

**Canonical**: working days everywhere in this domain. Use
`differenceInWorkingDays` from `src/lib/working-days.ts`. Calendar days
are only correct for human-readable durations (e.g. "X days ago" in a
timestamp).

**Status**: ✅ Fixed batch 98.

---

## Concept: "Plot completion percentage"

Two places — cached field + inline recalc — that were equivalent in
content but a recalc is fragile (it can drift the moment one query
adds a `where: { children: { none: {} } }` filter and another doesn't).

| Where | Was | Now |
|---|---|---|
| `src/app/api/sites/[id]/heatmap/route.ts` | inline `(completed / total) × 100` | reads `plot.buildCompletePercent` (cached) |
| `src/app/api/analytics/route.ts` | reads `plot.buildCompletePercent` | unchanged ✓ |

**Canonical**: `Plot.buildCompletePercent` (cached DB field, maintained
by `src/lib/plot-percent.ts::recomputePlotPercent` on every job
mutation). Every consumer reads the cache; nobody recalculates.

**Status**: ✅ Fixed batch 98.

---

## Concept: "ORDERED-order delivery date"

Pre-#176, the cascade engine silently shifted ORDERED orders' delivery
dates as part of a pull-forward. Result: Daily Brief showed orders as
overdue with dates the supplier had never agreed to, while the plot
view (which read the same field) showed the right date for OTHER orders
the manager had explicitly set via the override flow. SSOT was broken
at the DATA layer — the same field was getting different values
written depending on the code path.

| Where | Was | Now |
|---|---|---|
| `src/lib/cascade.ts` | shifted ORDERED orders' `expectedDeliveryDate` along with the job | locks ORDERED to supplier-committed date; only PENDING shifts |

**Canonical**: `expectedDeliveryDate` on a non-DELIVERED order is the
supplier's commitment. Only the supplier (via a manual update) can
change it. The cascade never touches it once status >= ORDERED.

**Status**: ✅ Fixed batch 97b. Existing skewed orders repaired via
`scripts/backfill-skewed-ordered-deliveries.ts`.

---

## Concept: "Plot current stage"

Was reinvented in 4 places. Each component decided "the stage" using
slightly different rules (some looked at first IN_PROGRESS, others at
last COMPLETED, etc.).

| Where | Status |
|---|---|
| `src/lib/plot-stage.ts::getCurrentStage` | canonical helper |
| every consumer | routes through it |

**Status**: ✅ Already converged in May 2026 (before this audit).

---

## Concept: "Job start/end date — which field?"

Three fields, three different semantics. The convention is:

| Field | Meaning | Mutable? |
|---|---|---|
| `startDate` / `endDate` | current plan | yes — cascade, delay, pull-forward |
| `originalStartDate` / `originalEndDate` | baseline at first move | only set ONCE (when the job first shifts) |
| `actualStartDate` / `actualEndDate` | factual record | only set on IN_PROGRESS/COMPLETED transition |

**Status**: ✅ No divergence found. Documented for newcomers.

---

## Concept: "Site access scope"

Every "what sites can this user see" check.

| Where | Goes through |
|---|---|
| Daily Brief, Tasks, Analytics, Dashboard, every site detail page | `getUserSiteIds()` / `canAccessSite()` from `src/lib/site-access.ts` |

**Status**: ✅ Already unified.

---

## Concept: "Aggregated job counts by status"

Counts on Dashboard / Analytics / Heatmap could diverge if one
included parent-stage rollups and another didn't.

**All three** use leaf-only counts (`children: { none: {} }`).

**Status**: ✅ Convention enforced. No divergence.

---

## The principle going forward

Two rules, learned from the cases above:

1. **No two places write the same field with different logic.** If
   the field needs computing, the helper lives in `src/lib/`.

2. **No two places read the same logical concept with inline
   expressions.** If two queries both ask "is this overdue", they
   share a where-clause builder. Component renders that decide "show
   the late pill" share a boolean helper.

The lateness helper (this audit's main artefact) is the canonical
template — boolean + workdays + Prisma where, all in one file, with
one rule documented.

When in doubt, grep for the field name. If it appears in 3+ places,
that's a smell.
