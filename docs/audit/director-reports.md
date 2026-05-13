# Director / Reports Audit — May 2026

Audit performed from the director / portfolio-reports persona. Focus: do the same metric reconcile across dashboard / analytics / per-site report / weekly digest / handover PDF? Are attribution chains honest? Can you hand a Delay Report or Budget vs Actual to the board without manually double-checking?

Headline: **the numbers do not reconcile**. There are 4+ definitions of "days late" in active code paths, 4+ definitions of "site total spend", a Site Story variance metric that silently misses auto-cascades because it regex-parses freeform descriptions, a dashboard At-Risk panel that uses calendar days while the Delay Report uses calendar days while Lateness SSOT uses working days, and a Handover ZIP whose delay-report / budget / cash-flow PDFs use a different cost model than the in-app versions of those same reports.

All file paths are absolute on Keith's local checkout. Line numbers are from the audit-day read.

---

## P0 — Site Story variance silently miscounts because it parses freeform EventLog descriptions

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\lib\site-story.ts:366-378`
- **What's wrong:** Variance buckets (`totalDelayDaysWeather`, `totalDelayDaysOther`) accumulate by **regex-matching the EventLog description string**: `ev.description?.match(/delayed (\d+) day/i)`. Three writers produce SCHEDULE_CASCADED rows: `/api/jobs/[id]/delay` uses `"... delayed N day(s) — reason"` (matches), `/api/sites/[id]/bulk-delay` uses `"Bulk delay: ... delayed N day(s) ..."` (matches), but `/api/jobs/[id]/actions` auto-cascade on late completion (`route.ts:582`) uses `"Auto-cascaded ... finished N working day(s) late"` (does **not** match). Same for `cron/reconcile` "Auto-reconcile: ... shifted N downstream by ...". Every auto-attributed delay therefore drops out of Site Story variance.
- **Who notices:** Director opens Site Story tab + handover-pack site-story.pdf — sees small "Variance breakdown" totals that don't add up to the Delay Report's days-overdue figures. Board picks at the inconsistency.
- **Fix:** Add a structured `delayDays Int?` column to EventLog and persist days at write time. Drop regex parsing. Then `totalDelayDaysWeather / Other` are SUMs of the column, not regex extractions.

## P0 — Dashboard "plots over budget" panel is a structural false positive

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\(dashboard)\dashboard\page.tsx:248-289`
- **What's wrong:** Computes `budgeted = quantity * unitCost`, `actual = delivered * unitCost`, then surfaces "over budget" when `actual > budgeted`. By construction, this only fires when `delivered > quantity` — i.e. "received more units than were ordered", which is an over-delivery, not a cost overrun. It also completely ignores `MaterialOrder` spend (where 90%+ of real spend lives per other code). Result: dashboard panel either shows zero plots or surfaces plots that aren't actually over budget by any normal definition.
- **Who notices:** Director's first read of the day. They click into a "rose-card" plot, open Budget Report on the same plot, and see "On budget" — credibility hit on day one.
- **Fix:** Call `/api/sites/[id]/budget-report` (or share its computation) so the dashboard panel uses the same `committed - budgeted` model. Cap at top N by variance.

## P0 — "Total Spend" disagrees across 4 places

- **Files:**
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\analytics\route.ts:374` — `totalSpend = sum(orderItem.totalCost)` across **every** order including CANCELLED.
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\sites\[id]\cash-flow\route.ts:180-182` — `committed = ORDERED + DELIVERED`, `actual = DELIVERED + manualDelivered`, `forecast = PENDING + manualPending`. Excludes CANCELLED.
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\sites\[id]\budget-report\route.ts:188-208` — `committed = ORDERED + DELIVERED`, PENDING kept separate, **excludes manual quants from `committed` but includes them in `budgeted`**.
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\analytics\profitability\route.ts:56-60` — order cost = `sum(orderItems.quantity * unitCost)` regardless of order status (so a CANCELLED order's items still count against profitability!).
- **What's wrong:** Same site, four different totals. Director adds Site A's Analytics totalSpend to Site B's Cash Flow committed for a board report and the numbers don't tie.
- **Who notices:** Anyone running a portfolio P&L. Especially loud once a few orders get CANCELLED — profitability widget will keep counting them.
- **Fix:** One helper `siteSpendTotals(siteId)` returning `{ committed, delivered, forecast, pending, cancelled }`. Every report imports it. Document that profitability uses `delivered + manualDelivered` (real cash out) not "all items quantity × unitCost".

## P0 — Four different "days late" implementations for the same contractor

- **Files:**
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\analytics\route.ts:283-287` — `delay = differenceInDays(actualEndDate, endDate)` (CALENDAR, current `endDate`).
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\sites\[id]\contractor-analysis\route.ts:147-150` — `workingDaysBetween(originalEndDate, actualEndDate)` (WORKING, against `originalEndDate`).
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\contacts\[id]\scorecard\route.ts:70-73` — `Math.ceil((actualEndDate - endDate) / 86400000)` (CALENDAR, current `endDate`).
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\lib\handover-zip.ts:323-328` — `Math.max(0, Math.round((actualEndDate - originalEndDate)/86400000))` (CALENDAR with a comment that lies and says "Working-day count").
- **What's wrong:** A contractor's "days late" total differs across Analytics page, Site Story, Scorecard page and the handover PDF. Working vs calendar + planned-vs-original mixed. The number a director hands to the board changes depending which page they exported from.
- **Who notices:** Anyone trying to triangulate a contractor's history before re-engaging. Scorecard says "12d late", Analytics says "9d", handover PDF says "14d".
- **Fix:** A single helper `contractorDelaySignals(contactId, scope)` returning `{ daysLateWorking, daysLateCalendar, basis: 'planned'|'original' }`. Reports pick one explicit basis (recommend working-days against `originalEndDate` per `daysVarianceWorking` convention in Site Story).

## P0 — Lateness counts disagree between LatenessSummary, Analytics widget and Weekly Digest

- **Files:**
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\components\lateness\LatenessSummary.tsx:118` — `totalDays = events.reduce(...e.daysLate)` summing **all events including resolved** when DelayReport passes `status="all"` (line 292 of DelayReport.tsx).
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\lateness\route.ts:102` — hard limit `take: 200` on the underlying fetch.
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\analytics\lateness\route.ts:28-41` — no limit, splits open vs resolved correctly.
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\cron\weekly-digest\route.ts:195-202` — sums `daysLate` from **all open events** for the site (the "X working days lost" footer); also fetches without limit.
- **What's wrong:** On a big site with >200 lateness events, LatenessSummary's headline silently caps and disagrees with the Analytics widget which has no cap, AND with Weekly Digest which also has no cap. Worse, LatenessSummary's "X working days lost" headline conflates open + resolved when status=all, while Weekly Digest's "X working days lost" footer is open-only. So the email says "12 WD lost" and the Delay Report tab says "47 WD lost (historically + open)" — director can't tell which figure to quote.
- **Who notices:** Anyone reconciling the Monday weekly-digest email against the dashboard. Pills on the digest will not match the in-app top-of-Delay-Report block.
- **Fix:** Standardise: every "headline lateness" surface reports `{ openDays, resolvedDays }` separately, never a `totalDays` blend. Drop the 200-row limit on `/api/lateness` (paginate properly if it becomes a problem) — silent caps in headline numbers are a P0 trust issue.

## P0 — Daily email blasts every site's alerts to every manager — no scoping

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\cron\daily-email\route.ts:110-116`, then `:166-250` builds the SAME `siteRows` HTML and sends to all CEO/DIRECTOR/SITE_MANAGER users.
- **What's wrong:** The HTML is built once across **all** active sites, then `sendEmail` is called per manager with that identical body. A SITE_MANAGER assigned to a single site receives a daily-brief with overdue jobs for every other site, regardless of whether they have site access. Director gets the full portfolio — good. Site manager sees other teams' problems — privacy/RBAC leak.
- **Who notices:** Anyone with non-portfolio access — first time they see a competitor site they shouldn't, support call lands.
- **Fix:** Build per-user `siteDigests` by scoping through `getUserSiteIds(user.id, user.role)`. Match the weekly-digest pattern (which already does this correctly at `cron/weekly-digest/route.ts:53-78`).

## P0 — Contractor scorecard has no site-access scope (full cross-site leak)

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\contacts\[id]\scorecard\route.ts:42-82`
- **What's wrong:** Any logged-in user can hit `GET /api/contacts/<id>/scorecard` and receive the full per-contact rollup across **every** site in the database. `jobContractor.findMany` is scoped only by `contactId`. Same with `snag.findMany` — no site filter.
- **Who notices:** Audit catches it before the customer does, ideally. Eventually a curious employee discovers the URL.
- **Fix:** Scope `jobLinks` and snags through `getUserSiteIds(session.user.id, role)`. Where scope is null (admin), keep current behaviour.

## P0 — Handover ZIP Delay Report PDF omits currently-overdue jobs and contractor delays

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\lib\handover-zip.ts:644-704`
- **What's wrong:** The PDF version of the delay report filters `actualEndDate: { not: null }` and then `actualEndDate > endDate` — so **only completed-late** jobs are in the PDF. Jobs that are still in-progress past their endDate (the largest bucket in `/api/sites/[id]/delay-report:32-94`) are silently absent. Also missing: weather-excused vs contractor-attributable splits, completed-late trend, the LatenessSummary block, and the `allDelayEvents` history. So the in-app DelayReport says "5 overdue jobs, 2 contractor-attributed" but the PDF says "Delayed jobs (3)" — the 3 being only past completions.
- **Who notices:** Anyone QAing the handover pack before sending to the customer or the regulator. The omission is invisible to the cron.
- **Fix:** Call `/api/sites/[id]/delay-report` (or share its query) and pass the full payload to `renderDelayReportPdf`. Render all three buckets (weather/contractor/other) and the lateness summary block.

## P0 — Handover ZIP cost PDFs use a different model than the in-app reports

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\lib\handover-zip.ts:520-632`
- **What's wrong:**
  - Budget: budget = `sum(plotMaterial.quantity * unitCost)`, actual = `sum(MaterialOrder.totalCost where DELIVERED)`. In-app Budget Report uses templates for budget and treats committed = ORDERED + DELIVERED. Different denominator and numerator — variance won't match between the in-app site tab and the PDF in the zip.
  - Cash Flow: month bucket key is `(deliveredDate ?? expectedDeliveryDate)` for ALL three series (forecast/actual/committed). The in-app cash flow uses `dateOfOrder` for committed and `expectedDeliveryDate` for forecast — three different bucketers. PDF totals also store `forecast: totalBudgeted` (a plot-material number) into a cash-flow "forecast" field, which has nothing to do with `PENDING` orders.
- **Who notices:** Anyone comparing the cash-flow PDF in the handover ZIP against the Cash Flow tab live in the app. Same month, different numbers.
- **Fix:** Share the cash-flow + budget-report API computation. Build the handover PDFs from the API's JSON, not a re-implemented inline aggregation.

---

## P1 — At-Risk panel "days late" disagrees with Lateness SSOT

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\components\dashboard\DashboardClient.tsx:392-396`
- **What's wrong:** `dayCount(iso) = floor((Date.now() - createdAt) / 86_400_000)` — calendar days, anchored to **client wall clock**, not server-aware. The Lateness SSOT (`src/lib/lateness.ts:73-76`) is working days, server-anchored. Same overdue job will show "8d late" in the At-Risk panel and "6 working days lost" in the LatenessSummary at top of Delay Report.
- **Who notices:** Director clicks an At-Risk row to drill in, sees a different number in the panel that opens.
- **Fix:** Either compute working-day lateness server-side and ship it on each At-Risk row, or import the SSOT helper and re-compute client-side off `endDate`.

## P1 — Daily-email "overdue jobs" / "late starts" don't use Lateness SSOT helpers

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\cron\daily-email\route.ts:55-60`
- **What's wrong:** Hand-rolled `{ endDate: { lt: todayStart }, status: { not: "COMPLETED" }, children: { none: {} } }`. Coincidentally equivalent to `whereJobEndOverdue` today but no compile-time link. Same for `lateStarts`. Future change to "is overdue" semantics in `src/lib/lateness.ts` won't propagate here.
- **Who notices:** Future maintainer. SSOT slowly drifts.
- **Fix:** Replace with `whereJobEndOverdue(todayStart)` / `whereJobStartOverdue(todayStart)` from `@/lib/lateness`.

## P1 — Cron notifications scope inconsistency

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\cron\notifications\route.ts:40-78`
- **What's wrong:** `overdueJobsCount` filters `status: "IN_PROGRESS"` — but every other overdue count in the system includes `NOT_STARTED` and `ON_HOLD`. Reinspection snags count (`:181-186`) has no site or status scope at all. The site-loop at `:164-177` correctly scopes to the per-site audience, but the upstream global pushes all go via `sendPushToAll`, which spams every push subscriber regardless of which sites they can access.
- **Who notices:** Eventually a user with one site sees a push count for a different site's volume.
- **Fix:** Mirror weekly-digest scoping per user. Replace `IN_PROGRESS` filter with `status: { not: "COMPLETED" }` (or `whereJobEndOverdue`).

## P1 — Weekly Site Report (per-site /weekly-report) inline-computes `overdueJobs`

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\sites\[id]\weekly-report\route.ts:176-178`
- **What's wrong:** `j.endDate && new Date(j.endDate) < today && j.status !== "COMPLETED"` — local arithmetic, doesn't call `isJobEndOverdue` from `@/lib/lateness`. Same logical answer today; next semantics change drifts.
- **Who notices:** Long-term divergence vector. Memory specifically calls this pattern out (see `feedback_ssot_helpers.md`).
- **Fix:** `overdueJobs = allJobs.filter(j => isJobEndOverdue(j, today)).length`.

## P1 — Two locally-defined `workingDaysBetween` shadows of the SSOT

- **Files:**
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\sites\[id]\contractor-analysis\route.ts:46-59`
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\sites\[id]\supplier-analysis\route.ts:41-54`
  - `C:\Users\keith\OneDrive\Desktop\sight-manager\src\lib\site-story.ts:152-167`
- **What's wrong:** Three inline copies of the same loop — same logic as `differenceInWorkingDays` from `@/lib/working-days`. Any future bank-holiday handling won't propagate.
- **Who notices:** Future maintainer; once one copy is fixed, the others lag.
- **Fix:** Import `differenceInWorkingDays`. Site Story's "avoid lib side effects" comment is stale — current `working-days.ts` is pure.

## P1 — Stage benchmark uses calendar days while everything else uses working

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\analytics\stage-benchmark\route.ts:50-60`
- **What's wrong:** Comment explicitly admits "calendar days for now — good enough for benchmarking variance". But median/p10/p90 means and template-duration recommendations all live in the same widget, and a manager comparing a stage's p90 against a job duration figure (which is working-days on screen-via-Delay Report) will compare apples to oranges.
- **Who notices:** Anyone trying to set a realistic template duration from the widget.
- **Fix:** Switch to `differenceInWorkingDays`. The "Node-runtime check" excuse in the comment isn't accurate for current `working-days.ts`.

## P1 — Profitability widget treats every order item as cost regardless of status

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\analytics\profitability\route.ts:39-46`
- **What's wrong:** `orders: { where: { status: "DELIVERED" } }` is filtered correctly — actually OK on a second read; my earlier note about CANCELLED is wrong. BUT: `materials.delivered * unitCost` always counts manual quants, even on plots where you ALSO have MaterialOrder rows for the same physical materials — double-count risk. There's no de-duplication. A plot with both manual-quant cement entries and ordered-cement deliveries shows the cement cost twice.
- **Who notices:** Anyone where the data was populated both ways during the simulation.
- **Fix:** Decide one source of truth for delivered material cost per plot; or surface the ambiguity in the widget with a "manual vs ordered split" tooltip.

## P1 — Analytics totalSpend is identical to a freshly-computed orderItems.reduce — no awareness of refunds/cancellations

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\analytics\route.ts:374-377`
- **What's wrong:** `totalSpend = orderItems.reduce(...)` reads **every** orderItem in scope, with no filter against the parent order's status. A CANCELLED order's items still contribute. The director's portfolio total spend therefore over-counts cancelled work.
- **Who notices:** Site with churned orders. The number creeps higher than reality.
- **Fix:** `prisma.orderItem.findMany({ where: { ...plotFilter, order: { status: { not: "CANCELLED" } } }, select: { totalCost: true } })`.

## P1 — BudgetReport client drops the 4-bucket detail from the API

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\components\reports\BudgetReport.tsx:30-76`
- **What's wrong:** API returns `delivered`, `committed`, `pending` per job and per plot, but `BudgetData` interface only types `actual` and `budgeted`. Rendered table only shows budget/actual/variance. Director can't see "are we over because we delivered too much or committed too much?". Information was computed; UI throws it away.
- **Who notices:** Anyone wanting to defend a variance number to the board.
- **Fix:** Extend interface, add columns or an expandable detail row showing delivered/committed/pending.

## P1 — Stat cards don't link to Analytics or At-Risk

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\components\dashboard\DashboardClient.tsx:200-305`
- **What's wrong:** 8 stat cards. "Total Sites" → `/sites`. "Total Jobs" → `/daily-brief` (workaround comment notes pre-fix it was a dead link). But there is no card for: portfolio lateness total (open WD lost), at-risk count, plots over budget count, profitability total. Director's first read of the day is the dashboard; the at-risk panel is *below the fold* on smaller screens and the lateness Analytics widget is on a different page. None of these critical numbers have a card.
- **Who notices:** Director scanning the dashboard for "where's the fire today".
- **Fix:** Add at-risk count and open lateness WD as stat cards, linking respectively to `#at-risk` (anchor) and `/analytics#lateness`.

## P1 — Weekly Digest "delays" pill counts SCHEDULE_CASCADED events without scope filter

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\cron\weekly-digest\route.ts:160-167`
- **What's wrong:** `prisma.eventLog.count({ where: { siteId: s.id, type: "SCHEDULE_CASCADED", createdAt: { gte: weekStart, lt: todayStart } } })`. A single delay action that auto-cascades 4 downstream jobs typically writes ONE SCHEDULE_CASCADED event with description "shifted 4 downstream by Nd". So `delays` pill counts cascades, not delayed jobs. Director reads "3 delays" but the actual operational reality is 12 jobs that moved. Inconsistent with the in-app DelayReport which counts jobs.
- **Who notices:** Anyone comparing the digest summary to clicking through to the site Delay tab.
- **Fix:** Either rename pill to "Delay events" or count `prisma.latenessEvent.count({ where: { siteId, wentLateOn: { gte: weekStart, lt: todayStart } } })` (it's already fetched at `:175-180`).

## P1 — LatenessSummary attribution UI doesn't expose `attributedContactId`

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\components\lateness\LatenessSummary.tsx:288-328` (editor form), `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\lateness\[id]\route.ts:38-41` (API accepts the field).
- **What's wrong:** Manager can edit `reasonCode` + `reasonNote` but not `attributedContactId`. So the Lateness Analytics widget's "Lateness attributed to contractor / supplier" section (AnalyticsClient.tsx:1252) only has rows for ORDER_DELIVERY_OVERDUE events (which the cron pre-populates from `o.contactId`). JOB_END_OVERDUE and JOB_START_OVERDUE never get attribution — director sees the contractor section near-empty for the largest bucket of lateness.
- **Who notices:** Director looking at "who's responsible for this lateness". Almost always empty for jobs.
- **Fix:** Add a contractor picker to the LatenessSummary editor block. Pre-populate from `JobContractor` rows.

## P1 — Analytics contractor performance treats unknown actual-end as on-time

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\analytics\route.ts:281-296`
- **What's wrong:** `if (j.endDate && j.actualEndDate)` → compare; `else` → on-time. A job marked COMPLETED without `actualEndDate` populated (back-fills, legacy data) flatters the contractor's on-time rate. Comment even calls this out as an assumption.
- **Who notices:** Contractor whose rate looks artificially high. Or vice versa, the board questioning a 100% on-time rate.
- **Fix:** Track `unknownOutcome` separately. Surface in the table as "n/a" rather than counting toward the numerator.

## P1 — Contractor-calendar widget shows in-progress jobs but no lateness overlay

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\analytics\contractor-calendar\route.ts:35-103`
- **What's wrong:** Returns each job's `start` and `end`. No marker for "this job is overdue". The widget at `AnalyticsClient.tsx:1078-1128` renders the list without distinguishing late vs on-time slots.
- **Who notices:** Anyone using the widget to spot who's running over. Currently it just shows schedule shape.
- **Fix:** Include `daysLate` per job in API response and bold/red-flag late rows in the widget.

## P1 — Weather-loss endpoint computes byMonth that the widget never renders

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\analytics\weather-loss\route.ts:52-74`, consumer `C:\Users\keith\OneDrive\Desktop\sight-manager\src\components\analytics\AnalyticsClient.tsx:937-984`.
- **What's wrong:** API spends compute building `byMonth: [{ month, rain, temp, other, total }, ...]`. WeatherLossWidget renders only `byType` and `bySite`. Board can't see seasonality of weather impact even though the data is on the wire.
- **Who notices:** Anyone planning around winter weather slowdowns.
- **Fix:** Render a 12-month sparkline / bar from `byMonth` data.

## P1 — Material burndown report ignores MaterialOrder deliveries entirely

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\sites\[id]\material-burndown\route.ts:41-79`
- **What's wrong:** Only `plotMaterial` rows. Sites whose materials are tracked via `MaterialOrder` orderItems (the modern flow, per memory) get an empty / under-counted burndown.
- **Who notices:** PM trying to spot a shortage on a site that doesn't use manual quants.
- **Fix:** Join `materialOrder.orderItems` keyed by name into the aggregation, treating `quantity` on ORDERED/DELIVERED orders as expected/delivered.

---

## P2 — Stale TODO in handover-zip header comment

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\lib\handover-zip.ts:46-47`
- **What's wrong:** Header docstring says `05_Cost_Analysis/    (TODO: budget + cash-flow PDFs)` and `06_Reports/          (TODO: delay-report-final.pdf)`. Both have actually shipped (lines :574+, :621+, :697+).
- **Who notices:** Future reader trying to understand current ZIP layout.
- **Fix:** Strip the (TODO) markers.

## P2 — handover-zip contractor-summary daysLate comment lies

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\lib\handover-zip.ts:325-328`
- **What's wrong:** Comment says `// Working-day count between original and actual end` but the code is calendar-day division (`Math.round(ms/86400000)`).
- **Who notices:** Anyone reading the code expecting working-days.
- **Fix:** Either change to working days (preferred — matches contractor-analysis route) or fix the comment.

## P2 — Cash-flow PDF "forecast" is plot-material budget, not pending orders

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\lib\handover-zip.ts:621-631`
- **What's wrong:** `totals.forecast: totalBudgeted`. The in-app Cash Flow `forecast` is sum of PENDING orders + manualForecast. Same field name, two different meanings depending which artefact.
- **Who notices:** Anyone QAing the handover.
- **Fix:** Compute true forecast (PENDING orderItems + manual remaining) and use that.

## P2 — Reinspection snags push has no scope at all

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\cron\notifications\route.ts:181-196`
- **What's wrong:** `prisma.snag.count({ where: { status: "RESOLVED", resolvedAt: { lte: sevenDaysAgo } } })` — no site filter, no audience scoping. Push goes to all subscribers (`sendPushToAll`) with the tenant-wide count.
- **Who notices:** Push subscribers on a quiet site getting "47 snags need re-inspection" from someone else's site.
- **Fix:** Per-site loop, scoped to site audience.

## P2 — DelayReport plot filter uses plotNumber string match instead of plotId

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\components\reports\DelayReport.tsx:239-242`
- **What's wrong:** `filterByPlot` matches on `plot.plotNumber || plot.name`. Two plots with the same plot number on different sites (rare but possible after re-numbering) collide. The API doesn't return `plotId` on delayed jobs so the UI can't disambiguate.
- **Who notices:** Edge case but unrecoverable if it triggers.
- **Fix:** API to return `plot.id` on each delayed job; UI filters by id.

## P2 — Snag report uses calendar-day age while scorecard uses ms division

- **Files:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\sites\[id]\snag-report\route.ts:50`, `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\contacts\[id]\scorecard\route.ts:92-100`.
- **What's wrong:** Snag-report uses `differenceInDays` (date-fns, calendar). Scorecard uses ms/86400000 then average. Different rounding, can disagree by 1 day on the same snag.
- **Who notices:** Tight comparison between the snag report page and a contractor's scorecard for the same snag.
- **Fix:** One helper `snagAgeDays(createdAt, resolvedAtOrToday)`.

## P2 — Dashboard `whereJobEndOverdue(new Date())` bypasses dev-date

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\(dashboard)\dashboard\page.tsx:107`
- **What's wrong:** Passes a raw `new Date()` to the helper. Other call sites use `getServerCurrentDate(req)`. Dev-date overrides therefore don't show on the At-Risk panel.
- **Who notices:** QA using dev-date to simulate a future date.
- **Fix:** `whereJobEndOverdue(getServerCurrentDate(req))` — but `page.tsx` doesn't have `req`; either lift to a route or expose a header-aware variant.

## P2 — Stat cards link "Total Jobs" to `/daily-brief` which is a workaround, not a destination

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\components\dashboard\DashboardClient.tsx:215-229`
- **What's wrong:** Comment explicitly calls this a stopgap because there's no "all jobs" page. Director clicks the count "112 jobs" and sees today's brief — not 112 jobs.
- **Who notices:** Director on day 1.
- **Fix:** Either add a real Jobs index page, or relabel the card to "Active Jobs" / "Jobs Today" and update the href intent.

## P2 — Reports export buttons label sheet as "Contractor Performance" everywhere

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\components\analytics\AnalyticsClient.tsx:334-339`
- **What's wrong:** Analytics page exports only Contractor Performance; site progress, supplier spend, profitability, lateness are never reachable as Excel sheets. Director who wants to give an Excel to the board has to manually copy.
- **Who notices:** Anyone preparing a board pack.
- **Fix:** Multi-sheet export. ReportExportButtons supports it; need to pass an `sheets` array.

## P2 — Profitability widget cuts to 15 rows with no "see more"

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\components\analytics\AnalyticsClient.tsx:1035`
- **What's wrong:** `.slice(0, 15)`. Sites with >15 plots silently lose visibility on the rest. Loss-making plots (sorted to the bottom) drop off first.
- **Who notices:** Anyone investigating why the portfolio profitable total seems off.
- **Fix:** Pagination or expandable list. At minimum show "+ N more plots ($-X total)" footer.

## P2 — Reconcile cron `description` includes ID slices but no plot/site names

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\cron\reconcile\route.ts:300-316`
- **What's wrong:** "Sample: plot:abc123" is unparseable without going back to the DB. Director skimming the events log to spot what reconciled overnight gets no signal.
- **Who notices:** Anyone reading recent activity expecting human-readable.
- **Fix:** Look up plot names for the sample IDs before logging.

## P2 — Weekly Digest doesn't link the per-site row to the per-site report

- **File:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\cron\weekly-digest\route.ts:273`
- **What's wrong:** Per-site card wraps in `<a href="${baseUrl}/sites/${s.siteId}?tab=story">`. But the activity numbers (jobs started, snags raised, lateness opened) live more naturally on `?tab=programme` / `?tab=snags` / `?tab=delay`. Single linked headline = a bit of a tease.
- **Who notices:** Anyone clicking the digest expecting to drill into the numbers.
- **Fix:** Either make each pill a separate link or use a tab map per pill.

## P2 — No automated reconciliation tests

- **Files:** `C:\Users\keith\OneDrive\Desktop\sight-manager\src\app\api\sites\[id]\delay-report\route.ts`, `cash-flow/route.ts`, `budget-report/route.ts`, `analytics/route.ts`, `cron/lateness/route.ts`, `cron/weekly-digest/route.ts`.
- **What's wrong:** Only `src/lib/job-timeline.test.ts` and `job-timeline.snapshot.test.ts`. Zero tests covering the report endpoints or any of the cross-view reconciliation rules called out above. Drift accumulates silently.
- **Who notices:** Future audit.
- **Fix:** Add a reconciliation test suite: seed a fixed scenario, assert that the four "days late" definitions agree (or fail the build), that totalSpend matches across endpoints, that delay-report PDF jobs equal API jobs, etc.

---

## Summary by priority

- **P0 (numbers wrong / missing):** 8
- **P1 (director can't trust):** 16
- **P2 (polish / hygiene):** 12

Total: **36 findings.**

The single biggest structural fix would be: a `src/lib/report-totals.ts` module with one function per "cross-view metric" (days late, total spend, overdue count, lateness WD), and a CI check (or a vitest reconciliation suite) that locks every consumer to that source. Today the same number is re-derived 3-5 times per metric — every report tab, every PDF, every email — and they have already silently diverged enough that handing the Delay Report or Budget vs Actual to a board without manual reconciliation is risky.
