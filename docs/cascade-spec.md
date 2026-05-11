# Cascade Engine — Formal Specification

This document defines the **exact contract** for every action that moves job or
order dates on a plot. Every test in `scripts/test-cascade.ts` asserts against
this spec. Every endpoint implementation must match.

---

## Canonical model — Single Source of Truth (May 2026)

These are the SSOT rules. Every other field that represents the same concept
is a **derived cache** updated from these — never the other way round.

| Concept | Canonical field | Derived caches (write at save, never read for math) |
|---|---|---|
| Sub-job duration | `TemplateJob.durationDays` | `durationWeeks` (= `durationDays / 5`), `startWeek`/`endWeek` (positions on the editor grid, recomputed on layout) |
| Atomic stage duration | `TemplateJob.durationDays` | same as above |
| Sub-job ordering within a parent | `TemplateJob.sortOrder` | nothing — sortOrder is the single source |
| Stage span (parent w/ children) | derived = sum of children's `durationDays`, ceil to weeks | `startWeek`/`endWeek` on the parent row (cache only — recomputed on every save) |
| Order timing | `TemplateOrder.{anchorType, anchorAmount, anchorUnit, anchorDirection, anchorJobId, leadTimeAmount, leadTimeUnit}` | `orderWeekOffset`/`deliveryWeekOffset` (server derives via `lib/template-order-offsets.ts` on every POST/PUT) |
| Plot-job dates | `Job.startDate`/`Job.endDate` (concrete dates set at apply time, mutated by cascade) | `originalStartDate`/`originalEndDate` (snapshot at apply, never mutated) |
| Plot-order dates | `MaterialOrder.dateOfOrder`/`expectedDeliveryDate` (concrete dates) | none |

### Apply-time data flow

When a `PlotTemplate` is applied to a `Plot`:

1. `apply-template-helpers.computeTemplateDateMap(plotStart, jobs)` walks the
   template tree once and returns `Map<templateJobId, {start, end}>`. This map
   is the single source for "where each template job lands on this plot".
2. `createJobsFromTemplate` writes real `Job` rows using values from the map.
   Sub-job sequencing comes from `sortOrder + durationDays`. Parent dates are
   derived from children (min/max).
3. `resolveOrderDates(templateOrder, ownerStart, dateMap)` computes each
   order's `dateOfOrder` and `expectedDeliveryDate` from the anchor fields:
   - `anchorType="arrive"`: delivery = anchor's start ± offset (working days);
     order = delivery − leadTime working days.
   - `anchorType="order"`: order = anchor's start ± offset; delivery =
     order + leadTime.
   - Falls back to legacy `orderWeekOffset`/`deliveryWeekOffset` only if no
     anchor fields are set (for templates predating the rework).

### Auto-reorder on job-start

When a `Job` is started, the matching `TemplateOrder.leadTimeAmount /
leadTimeUnit` are read to compute `expectedDeliveryDate = today + leadTime`.
`dateOfOrder` is set to today (the order is being placed now — anchor offsets
don't apply retrospectively). Lead-time precedence matches apply-time: anchor-
era fields first, then `deliveryWeekOffset` legacy fallback.

### Editor display

`TemplateTimeline` renders sub-jobs at **day-level granularity** by walking
the parent's children in `sortOrder` and accumulating a day cursor:

  bar.left  = weekToLeft(parent.startWeek) + (dayCursor / 5) × weekPixels
  bar.width = (durationDays / 5) × weekPixels

This means a 3-day sub-job spans Mon-Wed in Days view (or 0.6 of a week
column in Weeks view). The stored `startWeek`/`endWeek` on a sub-job is no
longer consulted for layout — it's a legacy cache only.

### Recalculate endpoints

`/api/plot-templates/[id]/jobs/[jobId]/recalculate` and
`/api/plot-templates/[id]/recalculate-stages` only update the **parent stage's**
`endWeek` to span its children. They do NOT write per-child `startWeek`/
`endWeek` — that data is dead. The Timeline computes positions on the fly.

---

## Universal invariants (hold after every action)

These are the non-negotiable rules. Any action that violates them is a bug.

**I1 — Calendar-day shift per job**
When a job moves by Δ calendar days, its startDate and its endDate both move by
exactly Δ calendar days. Duration is preserved.

**I2 — Working-day alignment**
Every job's startDate and endDate lands on Mon-Fri. If a shift would land on
Sat/Sun, the start AND the end both snap forward by the same number of calendar
days so duration stays identical.

**I3 — PENDING orders ride with their job; ORDERED orders stay put**
For every PENDING order on a moved job, `dateOfOrder` and `expectedDeliveryDate`
each shift by the same Δ working days as the job. The lead time gap
(`expectedDeliveryDate − dateOfOrder`) is preserved.

**ORDERED orders are locked to the supplier's committed delivery date.**
Once an order has been placed, the supplier owns the date — the cascade
cannot time-travel them. If a pull-forward demands an earlier delivery,
the manager re-negotiates with the supplier and edits the order directly
(or uses the "Start anyway — send orders now" override path which marks
the order ORDERED with `dateOfOrder=today` and prompts for the new
delivery date inline). Pre-#176 the cascade silently shifted ORDERED
orders backwards, producing past `expectedDeliveryDate` values that
Daily Brief then reported as "overdue" with dates the supplier never
agreed to.

**I4 — Completed jobs and delivered orders are immovable**
A job with `status === "COMPLETED"` is never touched by a cascade.
An order with `status === "DELIVERED"` or `status === "CANCELLED"` is never
touched (its dates are historical fact).

**I5 — Downstream scope**
Only jobs on the SAME plot with `sortOrder > trigger.sortOrder` (or,
for pull-forward, `startDate >= trigger.startDate` — to include stage siblings)
are cascaded. Plot boundaries are hard.

**I6 — Parent-stage rollup**
After all children shift, every affected parent job recomputes:
  parent.startDate = min(children.startDate)
  parent.endDate   = max(children.endDate)
  parent.status    = derived from children's collective status

**I7 — No silent clamp to today**
If a proposed shift would put a job's startDate before today, the engine does
NOT silently snap to today. It returns a conflict (the caller decides: abort,
offer Expand instead, or allow and record as historical).

**I8 — Sort order preserved**
After cascade, sortOrder still matches start-date order on the plot (no job
overtakes its successor).

**I9 — originalStartDate / originalEndDate immutability**
These fields are set once — on the first time a job moves from its template
position. They never update again. They are the baseline the programme was
built against.

---

## Action contracts

### A1 — Pull Forward (from early-start dialog)

**Trigger:** user clicks "Pull Programme Forward" or "Pull to Next Event"
during pre-start of a job that's planned in the future.

**Input:** triggerJobId, targetStartDate (or equivalent delta)

**Behavior:**
- Compute Δ = `targetStartDate − triggerJob.startDate` (calendar days; negative = earlier).
- Apply Δ to the trigger job and every downstream (I5) job AND every order on
  those jobs.
- Enforce I1–I9.
- If Δ would push any order's `dateOfOrder` before today, that's NOT an auto-error:
  the caller may have already accepted "place the order today" in the dialog.
  But if Δ would push any JOB's startDate before today, return a conflict.

**After:** `triggerJob.startDate === targetStartDate` (subject to I2 weekend snap).

### A2 — Expand (from early-start dialog)

**Trigger:** user clicks "Expand This Job" when pre-starting an early job.

**Input:** triggerJobId

**Behavior:**
- Trigger job's startDate := today (snapped to working day).
- Trigger job's endDate := unchanged (keep original).
- Trigger job's duration increases (this is the point of Expand).
- Downstream jobs are NOT affected.
- Orders on the trigger job are NOT shifted (they were placed against the
  original plan; user is just stretching this job to start sooner).

**After:** `triggerJob.startDate === today_snapped`, `triggerJob.endDate` unchanged,
no other jobs moved.

### A3 — Late Start Push (from late-start dialog)

**Trigger:** user clicks "Start from Today, Push Programme" when the planned
start is in the past.

**Input:** triggerJobId, daysLate

**Behavior:**
- Δ = +daysLate (calendar days).
- Apply Δ to the trigger job (start becomes today, end becomes original end +
  daysLate) AND every downstream job + orders.
- Enforce I1–I9.

**After:** triggerJob.startDate === today_snapped, end pushed by daysLate,
all downstream also pushed by daysLate.

### A4 — Late Start Compress (from late-start dialog)

**Trigger:** user clicks "Start from Today, Compress Duration".

**Input:** triggerJobId

**Behavior:**
- Trigger job's startDate := today (snapped).
- Trigger job's endDate := unchanged.
- Downstream jobs NOT affected.
- Orders on trigger job NOT shifted.
- (Same as A2 effectively — the distinction is the reason for the shift.)

**After:** same as A2.

### A5 — Late Start Backdate (from late-start dialog)

**Trigger:** user clicks "Start from Original Date".

**Input:** triggerJobId, originalStartDate

**Behavior:**
- No date mutation on Job row.
- A `JobAction` with `actualStartDate = originalStartDate` is recorded for
  history.
- Downstream jobs NOT affected.

**After:** no date fields change; history records backdated start.

### A6 — Complete Early

**Trigger:** user signs off a job before its planned endDate.

**Input:** triggerJobId, actualEndDate (= today)

**Behavior:**
- Δ = `actualEndDate − triggerJob.endDate` (negative if early).
- Trigger job: endDate := actualEndDate (snapped); no start shift (start was
  the original start). If a cascade is explicitly opted into, apply Δ to all
  downstream jobs + orders too.
- If user declines cascade, trigger job's end changes but downstream stays.
- This action is followed by a user-decision dialog (post-completion) that
  drives whether cascade happens.

**After:** triggerJob.endDate === actualEndDate; downstream either unchanged
(no-cascade path) or shifted by Δ (cascade path).

### A7 — Complete Late

**Trigger:** user signs off a job after its planned endDate.

**Input:** triggerJobId, actualEndDate (= today)

**Behavior:**
- Δ = +positive (late).
- Same post-completion dialog: user chooses cascade or no-cascade.

**After:** same semantics as A6.

### A8 — Delay a Job (/api/jobs/[id]/delay)

**Trigger:** Daily Brief or Programme "Delay" button, user specifies days.

**Input:** triggerJobId, days (always positive)

**Behavior:**
- Δ = +days.
- Apply to trigger job (start + end both shift by Δ) AND downstream + orders.
- Enforce I1–I9.
- Record a reason (rainedOff, contractor, materials, etc.) on the JobAction.

**After:** programme pushed by `days`.

### A9 — Bulk Delay (/api/sites/[id]/bulk-delay)

**Trigger:** Programme bulk-select → delay button.

**Input:** plotIds[], days

**Behavior:**
- For each plot independently, find the currently-active-or-next job and apply
  A8 with +days.
- Plots with no active/next job are skipped (not an error).
- Enforce I1–I9 per plot.

**After:** every listed plot's programme pushed by `days`.

### A10 — Rained Off (/api/sites/[id]/rained-off)

**Trigger:** Daily Brief "mark rained off" for a date.

**Input:** siteId, date, delayJobs boolean

**Behavior:**
- Record the rained-off day as a site-level weather event.
- If delayJobs is true: for every IN_PROGRESS job on the site, apply A8 with
  +1 day (or N days if multi-day rain-off).

**After:** weather event recorded; optionally programme pushed by 1 day on
every active plot.

### A11 — Cascade Preview (/api/jobs/[id]/cascade POST)

**Trigger:** UI wants to preview what a cascade would do before confirming.

**Input:** triggerJobId, newEndDate

**Behavior:**
- Compute Δ from newEndDate; run the same logic as the apply path but DO NOT
  persist.
- Return the full list of job and order updates that WOULD happen, plus
  any conflicts (I7 violations).

**After:** nothing changes in the DB.

### A12 — Cascade Apply (/api/jobs/[id]/cascade PUT)

**Trigger:** UI confirms a cascade (from pull-forward, delay, or custom date
picker).

**Input:** triggerJobId, newEndDate, confirm: true

**Behavior:**
- Compute Δ = `newEndDate − triggerJob.endDate`.
- Apply to trigger job (start + end both shift by Δ) AND downstream jobs +
  orders.
- Enforce I1–I9.
- If any conflict (I7), return 409 with the conflict detail.

**After:** persisted shift.

### A13 — Manual Job Date Edit (/api/jobs/[id] PUT)

**Trigger:** user edits the startDate or endDate directly on a Job row.

**Input:** jobId, startDate and/or endDate

**Behavior:**
- If only endDate changed: treat as A12 with that newEndDate.
- If only startDate changed: Δ = `newStart − originalStart`. Trigger job
  shifts by Δ; this implicitly sets new end = old end + Δ. Cascade downstream
  with same Δ.
- If BOTH changed with non-matching Δ: duration is explicitly being changed
  by the user — trigger job gets the exact dates given, downstream shifts by
  `newEnd − originalEnd` (treating the end change as the cascade driver).

**After:** job dates updated; downstream shifted per the end-date delta.

### A14 — Apply Template to Plot (/api/plots/apply-template)

**Trigger:** user creates a plot from a template.

**Input:** siteId, templateId, startDate (plot start), suppliers, …

**Behavior:**
- For each template job, derive startDate and endDate from the plot startDate
  plus the template week offsets. Snap both to working days (consistent
  direction to preserve duration, per I2).
- For each template order, derive dateOfOrder (job start − order week offset)
  and expectedDeliveryDate (dateOfOrder + delivery week offset).
- Every created job has originalStartDate := startDate, originalEndDate :=
  endDate (I9).

**After:** fully-formed plot with jobs and orders aligned to working days.

---

## Conflict types (returned by the engine)

All conflict responses are HTTP 409 with `{ conflicts: [...] }`.

**C1 — Job would start in the past**
`{ kind: "job_in_past", jobId, jobName, proposedStart, today }`
Thrown by A1, A3, A8, A12, A13 when a cascade would push a not-started job's
startDate before today.

**C2 — Order would need to be placed in the past**
`{ kind: "order_in_past", orderId, supplierName, proposedOrderDate, today }`
Thrown by A1, A12, A13 when an order's `dateOfOrder` would be before today
AND the order is still PENDING. (ORDERED is historical, we don't touch.)

**C3 — Would overtake a completed job**
`{ kind: "overtakes_completed", jobId, completedJobId }`
Thrown when a pull-forward would move a NOT_STARTED job's start before a
COMPLETED predecessor's end.

Callers (UI + tests) may override C1 and C2 by passing `force: true`. C3 is
never overridable — completed jobs are immovable history.

---

## Test matrix (scripts/test-cascade.ts)

The test harness sets up a canonical plot via template, then runs each action
and asserts every invariant. Minimum coverage:

| # | Scenario | Action | Assert |
|---|---|---|---|
| 1 | Pull forward 2 days mid-week | A12 | I1, I3, I6 |
| 2 | Pull forward 3 days across weekend | A12 | I1, I2, I3 |
| 3 | Pull forward that puts job.start today | A1 | I1, I7 (no conflict) |
| 4 | Pull forward that would push past today | A1 | C1 returned |
| 5 | Pull forward with pending order becoming past | A1 | C2 returned unless force |
| 6 | Expand (start now, keep end) | A2 | only trigger shifts, downstream static |
| 7 | Late push 2 days | A3 | I1, I3 applied forward |
| 8 | Late compress | A4 | same as A2 |
| 9 | Late backdate | A5 | no date mutations |
| 10 | Delay 3 days | A8 | I1, I3, downstream all +3 |
| 11 | Bulk delay 2 days across 3 plots | A9 | each plot independently pushed |
| 12 | Rained off delaying jobs | A10 | only IN_PROGRESS affected |
| 13 | Cascade preview matches apply | A11 vs A12 | identical output, no DB write in A11 |
| 14 | Manual end-date edit | A13 | end-edit behaves like A12 |
| 15 | Manual both-dates edit (duration change) | A13 | trigger gets exact dates, downstream uses end delta |
| 16 | Parent stage rollup after child move | A12 | I6 |
| 17 | Cross-plot isolation | A12 on plot A | plot B unchanged |
| 18 | Completed job immovable | A12 | I4 holds |
| 19 | Delivered order immovable | A12 | I4 holds |
| 20 | Chain: delay A → B → C all shift | A8 | all three jobs shift by same Δ |
