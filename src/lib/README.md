# `src/lib/` — canonical helpers

Every concept that more than one view needs to compute lives here. The
rule is non-negotiable: **if you're about to write a `differenceInDays`
or a `Math.min(...startDates)` or a `jobs.filter(j => j.status === ...)`
inside a route or component, stop and check if a helper already does
this.**

If a helper for what you need doesn't exist, **add one here** and route
your code through it. Don't write it inline. The May 2026 audit found
50+ stale-data bugs because every view re-derived the same concepts
locally — this file is the antidote.

## The helpers, by concept

### Timeline / bar positions / Gantt

**`job-timeline.ts` — `buildJobTimeline(inputs)`**
The canonical answer to "where does each job sit on the timeline?".
Returns `{ plotStart, plotEnd, totalWorkingDays, jobs: [{ planned,
original, actual, isLeaf, ... }] }`. All durations + offsets are working
days. **Every** view that draws bars or computes "early start" /
"duration" / "plot end" must use this. Never write your own. Tested in
`job-timeline.test.ts` (14 fixtures) + `job-timeline.snapshot.test.ts`
(realistic plot fixture).

Consumers: critical-path route, Site Story (`buildSiteStory` in
`site-story.ts` consumes timeline facts), Handover ZIP plot-story
PDFs (via `buildSiteStory`).

**Helper migration #13 status (May 2026)**:
- ✅ Cash Flow remap — `remapDateToOriginal` lives in `job-timeline.ts`;
  cash-flow route imports it (single code path for original-mode
  date remapping across the app).
- ✅ Site Story uses the helper for variance + plot-story event timelines.
- ✅ Handover ZIP plot-story PDF reads from Site Story output.
- ⚠️ Plot Detail Gantt (`GanttChart.tsx`) — still computes its own
  pixel positions from raw dates. This is intentional: the Gantt
  renders calendar-day widths (so weekends are visible), which is a
  visual primitive, not a timeline-arithmetic concern. The
  parent/leaf grouping COULD be replaced with `buildJobTimeline`'s
  `parentJobs` / `leafJobs` arrays — left in place because the
  existing grouping is exercised by snapshot tests and changing it
  risks visual regressions.
- ⚠️ Site Programme cells (`SiteProgramme.tsx`) — the three remaining
  `differenceInWorkingDays` calls are partial-week pixel math (how
  much of a cell does this bar fill?), not timeline interpretation.
  Same intentional split as the Gantt.

So the audit-13 anti-pattern (every view re-deriving timeline facts)
is closed: all NON-VISUAL timeline arithmetic now routes through this
helper. Visual cell-fill math stays in the components that render it.

### Plot completion percent

**`plot-percent.ts` — `recomputePlotPercent(client, plotId)`**
The single mutation point for `Plot.buildCompletePercent`. Counts
COMPLETED leaf jobs / total leaf jobs. Call this after **every** job
mutation that could change status counts. The nightly reconcile cron
re-runs it as a safety net.

### Parent stage rollup

**`parent-job.ts` — `recomputeParentFromChildren(tx, parentId)` /
`recomputeParentOf(tx, childJobId)`**
Aggregates parent dates + status from children: planned, original,
actual. Call after any child mutation. Parent's `actualEndDate` only
locks once **every** child is COMPLETED.

### Current stage label

**`plot-stage.ts` — `getCurrentStage(jobs)` / `getCurrentStageLabel(jobs)`**
Unified rule: IN_PROGRESS → that stage, all complete → "Complete", mix
of complete + not-started → first NOT_STARTED, all not-started → first.
Used by Site Programme, Plot Detail, Walkthrough, Daily Brief.

### Working-day arithmetic

**`working-days.ts`**
`addWorkingDays`, `differenceInWorkingDays`, `snapToWorkingDay`,
`isWorkingDay`. Foundation of every other helper here. **Never** use
`differenceInDays` from `date-fns` for job/programme calculations —
it's calendar days and will lie over weekends.

### Stage codes / colours

**`stage-codes.ts` — `getStageCode(job)` / `getStageColor(status)`**
Maps stage names to short codes (FEN, BRI, ROO, etc.) and statuses to
display colours. Both Site Programme + PDF/Excel exports + Critical
Path use this.

### Site story + analysis

**`site-story.ts` — `buildSiteStory(tx, siteId, options?)`**
The retrospective synthesizer. Both the Site Story tab API and the
Handover ZIP generator call this so they can never drift apart.

### Event log

**`event-log.ts` — `logEvent(db, args)`**
The single mutation point for the `EventLog` table. **Never call
`prisma.eventLog.create` directly** — `scripts/smoke-test.ts` fails the
build if you do. `logEvent` backfills plot/site scope from a job id
(jobId → plotId → siteId) so every event reaches the per-plot Site
Story timeline even when the caller only had the job to hand — the
exact drift that made the Story look empty in May 2026. Carries the
structured `detail` payload so readers get typed fields instead of
regex-parsing `description`. Errors propagate by default (so a write
inside a transaction rolls it back); best-effort breadcrumb callers
append `.catch(() => {})` themselves. Coverage is guarded by the smoke
suite rather than a unit test — the helper is a thin DB-write wrapper,
so "is every writer routed through it" is the meaningful invariant.

### Apply-template + cascade

**`apply-template-helpers.ts`**, **`template-pack-children.ts`**,
**`template-preview.ts`**, **`template-order-offsets.ts`**, **`cascade.ts`**
The plot-template apply / recompute / preview engine. Cascades
SEQUENTIALLY from `plotStartDate`; never reads cached `startWeek`. See
`memory/project_template_ssot.md` in Keith's Claude memory for the
full rule.

### Plot URLs

**`plot-urls.ts` — `getPlotInternalUrl({ siteId, plotId, origin? })` /
`getPlotQrUrl(...)`**
Single source for "the URL for this plot". QR codes encode it,
sidebar links route to it, anywhere plot-to-plot navigation needs to
build a URL. Pre-extraction the QR code component built two different
URLs in two places (both wrong) while BatchPlotQR built a third —
classic SSOT failure. Now: change the path here, every consumer
updates automatically.

### Date handling

**`dev-date.ts` — `getCurrentDate()` / `getServerCurrentDate(req)` / `getCurrentDateAtMidnight()`**
Respects Dev Mode timing tests when a dev-date cookie is present, falls
back to real `Date.now()` otherwise. **Always** use this, not `new
Date()`, anywhere you need "now" in business logic. Cron jobs use the
server variant.

## Rules

1. **No local timeline arithmetic.** If you find yourself typing
   `differenceInDays`, `differenceInCalendarDays`, or computing offsets
   from raw dates inside a route or component, stop. Use `buildJobTimeline`
   or extend it.

2. **No local mutation of cached fields.** Don't write
   `prisma.plot.update({ buildCompletePercent: ... })` directly. Use
   `recomputePlotPercent`. Don't write parent date aggregations
   inline. Use `recomputeParentFromChildren`.

3. **Add a test before extending a helper.** Each helper here has unit
   tests. New behaviour → new test. Snapshot tests pin canonical output.

4. **Document new helpers in this README.** A helper that's not in this
   index might as well not exist — devs (and future-you) won't find it.

## When the audit pattern fires again

If a stale-data bug appears in production, the first move is:
1. Find the view that's wrong.
2. Find the helper it should be using.
3. If the helper doesn't exist or doesn't cover the case, **extend the
   helper, then route the view through it.** Never patch the view
   in-place.
4. Add a test pinning the new behaviour.
5. Look for siblings — if one view computes X locally, others probably
   do too. Sweep them.
