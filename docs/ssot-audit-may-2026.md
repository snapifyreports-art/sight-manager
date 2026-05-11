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

## Concept: "Order date invariants"

Keith pushed back: _"these are basics, it's just maths"_. Asked: are
the other functional flows (start, expand, push back, deliver early)
clean too? They weren't. Four more silent-mutation bugs surfaced:

| Where | Was | Now |
|---|---|---|
| `/api/orders/[id]` PUT, PENDING → DELIVERED bridge | Set `dateOfOrder=today, deliveredDate=today` but left `expectedDeliveryDate` at whatever the cascade had pushed it to. Could be months in the future, producing "delivered 8 months early" artifacts in reports. | Invariant helper clamps `expectedDeliveryDate >= dateOfOrder`. |
| `/api/jobs/[id]/actions` start auto-progression | PENDING → ORDERED with `dateOfOrder=today`, `expectedDeliveryDate` unchanged. If job started late, `expectedDeliveryDate` could end up < `dateOfOrder` (impossible). | Per-order recompute via `enforceOrderInvariants` — pushes `expectedDeliveryDate` to `dateOfOrder + leadTimeDays` if it would otherwise violate. |
| `/api/jobs/[id]/actions` sign-off auto-progression | ORDERED → DELIVERED with `deliveredDate=today`, blind. If `dateOfOrder` was in the future (post-cascade), `deliveredDate < dateOfOrder`. | Per-order with invariants — clamps `deliveredDate` to `dateOfOrder` if needed. |
| Multiple flows using `updateMany` for status flips | One blanket UPDATE — can't enforce per-row invariants. | Per-row `findMany` + `Promise.all` with invariants applied to each. |

**Canonical**: `src/lib/order-invariants.ts` defines:

- **INV-1**: `dateOfOrder <= expectedDeliveryDate`
- **INV-2**: `dateOfOrder <= deliveredDate` (when DELIVERED)
- **INV-3** (helper): `recomputeExpectedDeliveryOnSend(today, leadTime)` — used on auto-progression to keep the math honest.

Every order-mutation flow now routes proposed changes through
`enforceOrderInvariants(current, patch, today)` which returns a
clamped patch. No mutation can save an impossible date ordering.

**Status**: ✅ Fixed batch 100.

---

## Concept: "Cache invalidation paths — does every mutation refresh derived caches?"

There are two derived caches: `Plot.buildCompletePercent` and the
parent-job date rollup (`startDate`/`endDate` re-derived from children).
A mutation that should refresh either but doesn't = silent
divergence — the cached number drifts from the live one.

| Endpoint | Recompute plot percent? | Recompute parent? | Status |
|---|---|---|---|
| `/api/jobs/[id]/actions` | ✓ | ✓ | OK |
| `/api/jobs/[id]/pull-forward` | ✓ | ✓ | OK |
| `/api/jobs/[id]/delay` | ✓ | ✓ | OK |
| `/api/jobs/[id]/cascade` | added (#180) | ✓ | Now OK; defensive matches delay's pattern |
| `/api/sites/[id]/bulk-status` | ✓ | ✓ | OK |
| `/api/sites/[id]/bulk-delay` | ✓ | ✓ | OK |
| `/api/cron/reconcile` | ✓ (its whole job) | ✓ | OK |

**Status**: ✅ Every mutation that changes a Job's status or dates
now triggers both cache refreshes.

---

## Concept: "Bulk order status flips — same invariants as single-job?"

The single-job action handler routes order flips through
`enforceOrderInvariants` (batch 100). The bulk version
(`/api/sites/[id]/bulk-status`) used `updateMany` for the same flips —
blanket UPDATE that can't enforce per-row invariants. Same bug
pattern, different endpoint.

| Where | Was | Now |
|---|---|---|
| `bulk-status.ts` start branch (PENDING → ORDERED) | `updateMany({ jobId, status: "PENDING" }, { status: "ORDERED", dateOfOrder: now })` | per-row via `enforceOrderInvariants` |
| `bulk-status.ts` complete branch (ORDERED → DELIVERED) | `updateMany({ jobId, status: "ORDERED" }, { status: "DELIVERED", deliveredDate: now })` | per-row via `enforceOrderInvariants` |

**Status**: ✅ Fixed batch 100b. Same invariants enforced everywhere
status flips.

---

## Concept: "Snag resolvedAt — set on every 'done' state?"

A snag could go `OPEN → CLOSED` directly (manager dismisses without
formal resolve). The status flip wrote `status = "CLOSED"` but left
`resolvedAt` null. Reports that compute "snag age at close" or "time
to resolve" filter on `resolvedAt IS NOT NULL` — these direct-close
snags were silently excluded.

| Status path | Sets resolvedAt? | Was | Now |
|---|---|---|---|
| OPEN → IN_PROGRESS → RESOLVED | ✓ | ✓ | ✓ |
| OPEN → RESOLVED | ✓ | ✓ | ✓ |
| RESOLVED → CLOSED | preserve (don't overwrite) | ✓ | ✓ |
| OPEN → CLOSED (direct dismiss) | ✓ | ✗ left as null | ✓ set to now |

Backfill script (`scripts/backfill-closed-snag-resolved-at.ts`)
surfaces and repairs any existing rows where `status=CLOSED` and
`resolvedAt=null`. Ran against prod-equiv: none found, so this is a
preventative fix.

**Status**: ✅ Fixed batch 100b.

---

## Concept: "Stored date fields and what writes them"

Every persisted date, with its writer(s). Anything not listed here is
either immutable (`createdAt @default(now())`) or a write that goes
through one of the helpers above.

| Model.field | Writer | Notes |
|---|---|---|
| `Job.startDate` / `endDate` | cascade, pull-forward, delay, bulk-delay, manual edit | All routes coalesce through `calculateCascade` for any multi-job shift. |
| `Job.originalStartDate` / `originalEndDate` | first-shift only (cascade, pull-forward, delay, bulk-delay) | Set ONCE; never updated again. Baseline for variance reports. |
| `Job.actualStartDate` | start action | Set on first IN_PROGRESS flip. Backdating supported via `actualStartDate` body param. |
| `Job.actualEndDate` | complete action | Set on COMPLETED flip. |
| `Job.signedOffAt` / `signedOffById` | signoff action | Always written together. |
| `Site.completedAt` | site-status PUT to COMPLETED | Cleared on re-open. |
| `MaterialOrder.dateOfOrder` | start action (auto-flip), orders PUT, bulk-status, cascade (PENDING shift) | All paths post-process through `enforceOrderInvariants`. |
| `MaterialOrder.expectedDeliveryDate` | orders PUT, cascade (PENDING shift), invariants clamp | NEVER mutated by cascade for ORDERED orders (post-#176). |
| `MaterialOrder.deliveredDate` | signoff (auto-flip), orders PUT, bulk-status | Through invariants helper. |
| `Snag.resolvedAt` | snag PUT (RESOLVED or first CLOSED) | Same field carries both "resolved" and "closed without resolve" semantics post-#180. |
| `Snag.resolvedById` | coupled with resolvedAt | Always written together. |
| `Plot.buildCompletePercent` (cached) | `recomputePlotPercent` only | Every mutation that changes a job's status calls this. |

**Status**: ✅ Clean — every date is written from one of a small set
of named locations, and the locations are listed.

---

## Concept: "Derived dates — calculated, not stored. Who owns the calc?"

Things that aren't stored but get computed from stored fields. Each
has ONE canonical owner.

| Derived value | Owner | Consumers |
|---|---|---|
| "Working days between two dates" | `src/lib/working-days.ts::differenceInWorkingDays` | every duration / lateness calc |
| "Job duration" | `src/lib/job-timeline.ts::buildJobTimeline` | Programme, Plot Detail Gantt, Critical Path, Handover ZIP |
| "Is overdue / is late-start" | `src/lib/lateness.ts` | Daily Brief, Tasks, Dashboard, Heatmap, Analytics |
| "Working days overdue" | `src/lib/lateness.ts::workingDaysEndOverdue` | Heatmap RAG, Delay Report |
| "Plot completion %" | `src/lib/plot-percent.ts::recomputePlotPercent` (writes the cache) | Heatmap, Analytics, dashboard widgets read the cached field |
| "Parent job dates" | `src/lib/parent-job.ts::recomputeParentFromChildren` (writes the parent's `startDate`/`endDate`) | Programme parent rows, Critical Path |
| "Plot current stage" | `src/lib/plot-stage.ts::getCurrentStage` | PlotDetailClient, SiteProgramme, MobileProgramme |
| "Order invariants" | `src/lib/order-invariants.ts::enforceOrderInvariants` | Every order mutation |
| "Snag median resolve time" | `src/lib/site-story.ts` (computed inline in the story aggregator) | Site Story tab |

**Things deliberately NOT extracted into helpers** (one consumer each,
or trivial inline):
- "Snag age" — `formatDistanceToNow(snag.createdAt)`, single readable
  line, only used in 2 places.
- "Site age" — same.
- "Plot age" — same.

If any of these grows to a third consumer, extract.

---

## Things audited and found OK (don't touch)

- Site-access scope (`getUserSiteIds` / `canAccessSite`) — one helper, every consumer routes through it.
- Working-day vs calendar-day arithmetic — `working-days.ts` is the only working-day source; calendar days come from `date-fns` and are correctly used only for visual day-counts where weekends matter (e.g. "today is Friday 15 May" in display).
- Auto-progression of orders on job start — flows through `enforceOrderInvariants` (batch 100).
- `originalStart/End` once-only capture — by design; the move history lives in EventLog `SCHEDULE_CASCADED` rows, not by mutating originals.

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
