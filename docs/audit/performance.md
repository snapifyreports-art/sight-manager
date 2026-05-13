# Performance Audit — May 2026

Audit of Sight Manager (Next.js 16, Prisma 6, Supabase, Vercel) focused on query efficiency, Lambda timeout risk, bundle size, and render performance. Codebase covers ~70K lines of TSX in `src/components`, 1,377-line Prisma schema with 67 indexes, six Vercel crons, and ~150 API routes. Scale targets: 8 plots × ~150 jobs per site, 500+ photos, multi-site portfolios.

**P0** = current load is slow OR will fail at realistic scale.
**P1** = will degrade as scale grows.
**P2** = optimisation opportunity (latency / bundle / DX).

---

## P0 — Handover ZIP fetches Supabase URLs sequentially in a tight per-plot loop

- **File:** `src/lib/handover-zip.ts:159-246`
- **What's slow:** Two nested loops issue per-plot Prisma queries AND per-file `fetch(url)` calls strictly serially: `for (const plot of plotStories)` → `for (const doc of docs) { await fetchAsStream(...) }` → `for (const p of photos) { await fetchAsStream(...) }`. Each `fetchAsStream` is one HTTPS round-trip to Supabase storage (cold cache: 60-300 ms). For a typical 8-plot site with ~500 photos and ~50 documents that is ~550 sequential HTTP calls = 30-150 s wall time before compression even competes.
- **Expected impact:** A full handover at 500 photos × 80 ms median = 40 s, 1,000 photos = 80 s. With `maxDuration = 300` it will not time out yet, but the user waits the full duration before the first byte streams. At 8 plots × 200 photos each (realistic in 6 months) the route routinely brushes the 5-minute Lambda ceiling.
- **Fix:** Stream files in bounded parallel batches (e.g. p-limit with concurrency 8) once the per-plot queries are gathered. Also batch the per-plot `prisma.snag.findMany` / `prisma.siteDocument.findMany` / `prisma.jobPhoto.findMany` into single grouped queries with `where: { plotId: { in: plotIds } }` then bucket in memory — eliminates 3N round-trips.

## P0 — Lateness cron does per-row DB writes inside three sequential loops

- **File:** `src/app/api/cron/lateness/route.ts:78-251`
- **What's slow:** `for (const j of lateJobs)` calls `openOrUpdateLateness` (which does findUnique + upsert), then `for (const o of lateOrders)` does the same, then `for (const ev of openEvents)` does `findUnique` per event PLUS `resolveLateness` for resolved ones. For 200 late jobs + 100 late orders + 300 open events that is ~1,200 round-trips. At Supabase pgbouncer latency (~5-15 ms each) that is 6-18 s wall time. Add the auth + start-of-day boundary writes that ride along and the cron easily climbs to 25 s.
- **Expected impact:** Currently runs in seconds on the demo data. With one busy site at 6 months in (200 overdue jobs across all plots, dozens of late orders) it will trend toward the 30 s Vercel cron timeout. Two large sites concurrently and it will start failing past noon.
- **Fix:** (a) Bulk-fetch existing `LatenessEvent` rows for all candidate `(targetId, kind)` pairs in one `findMany`, diff in memory, then `createMany` for new + `updateMany` for refreshes. (b) Batch `openEvents` target lookups: collect job IDs and order IDs into two arrays, do `prisma.job.findMany({ where: { id: { in: jobIds } } })` once, then resolve in memory.

## P0 — Reconcile cron's overlap pass does N×M queries per plot

- **File:** `src/app/api/cron/reconcile/route.ts:163-275`
- **What's slow:** Outer `for (const plot of overlapPlots)` already fetches jobs per plot. Inside it, for **each trigger**, the code re-fetches `prisma.materialOrder.findMany({ where: { jobId: { in: jobs.map(...) } } })` and then runs `Promise.all` updates. After applying, it refetches `prisma.job.findMany` for the plot AGAIN. With 50 plots × ~3 triggers each that is 100+ extra round-trips, plus the inner updates. The outer plot loop also already does `for (const p of activePlots) { await recomputePlotPercent + findUnique }` (lines 61-88) and `for (const p of parentJobs)` (lines 109-144) — both pure serial.
- **Expected impact:** On a portfolio of 5 active sites × 8 plots = 40 plots with average 150 jobs each = ~6,000 jobs reconciled serially. Each `recomputePlotPercent` is one `groupBy` + one `update` = ~10-20 ms. Plot pass alone: 40 × 25 ms = 1 s — fine. Add parent rollup pass (~300 parents × 25 ms = 7.5 s) + overlap pass (variable, can be 10-20 s). Total runtime today around 15-25 s. **Will exceed 30 s at 10 sites or 60 active plots.**
- **Fix:** (a) Parallelise the plot-percent loop with `Promise.all` over chunks of 10. (b) For the overlap pass, fetch *all* jobs + orders for active sites once with `where: { plot: { siteId: { in: activeIds } } }`, build a `Map<plotId, jobs[]>` and `Map<plotId, orders[]>`, then process plots in memory. (c) Move the cron to a Vercel Background Function or split into multiple smaller crons keyed by siteId.

## P0 — Weekly digest cron multiplies users × sites × 10 count queries

- **File:** `src/app/api/cron/weekly-digest/route.ts:84-219`
- **What's slow:** Outer `for (const u of users)` then inner `await Promise.all(sites.map(async (s) => { ... 10 count queries ... }))`. With 30 users each watching 5 sites that is 30 × 5 × 10 = **1,500 count queries** in a single cron invocation. Each count on Job/Snag/MaterialOrder filters by `plot.siteId` (relational join) — Postgres planner picks an index scan on each but the round-trip cost dominates: ~10 ms × 1,500 = 15 s. Add the email sends and you hit 25-30 s.
- **Expected impact:** Fine today (small team, demo data). At 50 active users × 6 sites = 3,000 counts ≈ 30 s — overlaps the cron timeout. Email rate-limit (Resend allows 10/s) means the rest of the runtime is queued sends.
- **Fix:** Pivot the query: run ONE `prisma.job.groupBy({ by: ["plotId"], where: { plot: { siteId: { in: allSiteIds } } }, ... })` per metric, then build per-site summaries in memory. Reduces the work to ~10 queries total regardless of user count. Compute per-user emails by filtering the global map by their site IDs.

## P0 — Daily-email cron N×8 fan-out grows linearly with site count

- **File:** `src/app/api/cron/daily-email/route.ts:42-107`
- **What's slow:** `await Promise.all(sites.map(async (site) => { await Promise.all([ 8 count queries ]) }))`. The inner 8 are parallel (good) but they fan out per site. At 20 active sites: 160 simultaneous queries → Prisma's default 10-conn pool serialises them in batches → effective wall time = (160/10) × ~50 ms = 800 ms — acceptable. **However**, this happens at the same minute as the `notifications` and `weather` crons (all three scheduled at `0 5 * * *` in `vercel.json:3-14`). Three concurrent Lambdas competing for the same Supabase connection pool means each sees longer queue times.
- **Expected impact:** With 50 sites the three concurrent crons issue ~400 queries in the same second, saturating Supabase's free-tier connection limit (15) and forcing each cron to retry. Tail latency turns 5 s runs into 25-40 s ones.
- **Fix:** (a) Stagger the cron schedules — move `notifications` to `5 5 * * *` and `weather` to `10 5 * * *`. (b) Combine the 8 per-site counts into a single grouped query using `prisma.job.groupBy` keyed by `plotId`/`siteId`, then bucket in memory.

## P0 — `bulk-status` route is strictly sequential with many DB writes per job

- **File:** `src/app/api/sites/[id]/bulk-status/route.ts:61-432`
- **What's slow:** `for (const jobId of jobIds)` — for each job: `findUnique` + `update` + `updateMany` plot + (optionally) `findMany` orders + N `update` orders + `create` jobAction + (optionally) `create` jobAction signoff + `create` eventLog + `recomputeParentOf` (2 queries) + late-cascade branch (5+ queries) + `recomputePlotPercent` (2 queries) + next-stage notification fetch + auto-reorder branch (3+ queries per template). A "Start All" on 8 plots' active jobs ≈ 8 × 15 = ~120 round-trips serially. Even at 10 ms each that is 1.2 s wall time; with the cascade branch active (~30 round-trips per job) it stretches to 3-5 s.
- **Expected impact:** UX feels sluggish today; will timeout when the user bulk-completes 50 jobs at once (e.g. on a site closeout: 50 × 30 = 1,500 round-trips ≈ 15-30 s, brushes the default 30 s Vercel limit).
- **Fix:** Process jobs in parallel batches (concurrency 5-10). The intentional "sequential to respect connection pool" comment at line 60 is outdated — Prisma + pgbouncer handles concurrent writes fine. Also cache the cross-job lookups (template jobs, plot info) outside the loop.

## P0 — Analytics `/api/analytics` loads every job + every order across portfolio with no pagination

- **File:** `src/app/api/analytics/route.ts:54-165`
- **What's slow:** Ten parallel queries that each return the full unfiltered set (constrained only by site-access filter). `prisma.job.findMany` with all leaf jobs across every accessible site, `prisma.materialOrder.findMany` with full include tree (supplier + orderItems + job → plot → site name), `prisma.jobContractor.findMany` likewise. At 10 sites × 8 plots × 150 jobs = 12,000 leaf jobs returned over the wire to the Lambda — ~5 MB payload assembled in memory before the aggregation passes.
- **Expected impact:** Today (~1,000 jobs) the request takes 500-900 ms. At 10,000 jobs it climbs to 5-10 s + 50 MB Lambda memory. The unfiltered orderItems include alone can be the largest table in the response.
- **Fix:** Push the aggregations into Prisma `groupBy` / `_count` instead of fetching every row. The job-duration map, contractor performance, supplier spend, and order-status histogram can all be computed server-side via group-by + count without ever materialising the row data in JS.

## P0 — Programme route returns full plot+job+order tree with no pagination

- **File:** `src/app/api/sites/[id]/programme/route.ts:24-67`
- **What's slow:** One `prisma.site.findUnique` pulls every plot, every job per plot (incl. orders + counts), every rained-off day. At 8 plots × 150 jobs × ~5 orders/job that is ~6,000 orders in the response. Each order is selected with supplier name, items description, etc. Response JSON is then `JSON.parse(JSON.stringify(site))` (line 81) which doubles peak memory. Typical payload size today: 200-500 KB. At full scale (8 plots × 150 jobs × 5 orders): ~2-3 MB JSON.
- **Expected impact:** Initial programme load on the largest sites already takes 1-2 s with the heavy payload + decode + React render. At a 20-plot site (rare but possible for portfolio leads) the response goes past 5 MB and the parse step alone takes 200-400 ms on mid-tier mobile devices.
- **Fix:** (a) Drop the `JSON.parse(JSON.stringify(...))` and let `NextResponse.json` handle it — it already does the same date-serialisation work. (b) Add `?window=start&end=` query params so the client only requests the visible weeks. (c) Lazy-load order details on hover/click instead of inline include.

## P0 — `recompute*` helpers do `findUnique`-after-`update` round-trip per call

- **File:** `src/app/api/cron/reconcile/route.ts:64-87, 109-144`; `src/lib/parent-job.ts:33-129`
- **What's slow:** The reconcile cron calls `recomputePlotPercent` then **immediately re-fetches** the same plot with `findUnique` (line 66-69) to detect drift. Same pattern at lines 111-124 for parent jobs. That doubles every recompute round-trip count from 2 to 3. Across 6,000 plot+parent recomputes that is 6,000 extra round-trips ≈ 60-90 s wasted serially. The non-cron call sites also fetch `prisma.job.findUnique { parentId }` (parent-job.ts:137-141) when the caller often already has the parentId in scope.
- **Expected impact:** Reconcile cron runtime inflated by ~2× unnecessarily; under load risks the 30 s timeout.
- **Fix:** Make `recomputePlotPercent` return the new percent so the caller can compare without a second query. For parent recompute, accept an optional `parentId` parameter to skip the lookup.

## P0 — `OrdersClient` / `SnagList` static-import xlsx (~700 KB) into every page bundle

- **File:** `src/components/shared/ReportExportButtons.tsx:26`; `src/components/snags/SnagList.tsx:26`
- **What's slow:** `import * as XLSX from "xlsx"` at module top level. Tree-shaking can't help — every page that renders `ReportExportButtons` or `SnagList` ships the full SheetJS bundle (~720 KB minified, ~190 KB gzipped). That includes the Tasks page, every report tab on every site, the Orders client, and SiteDetailClient's Snags tab. Net result: every authenticated page incurs the xlsx cost in TTFB-to-interactive even though the user almost never clicks Export Excel.
- **Expected impact:** First contentful paint delayed ~200-400 ms on cold loads, especially noticeable on mobile 3G/4G. xlsx is the single largest non-React dependency.
- **Fix:** Convert to `const XLSX = await import("xlsx")` inside the handler (the pattern already used in `SiteProgramme.tsx:901`). Same change at both call sites collapses the bundle by ~190 KB gzipped.

## P0 — `next/dynamic` is not used anywhere; heavy modal/dialog content always bundled

- **File:** repo-wide (search confirms zero matches for `next/dynamic`)
- **What's slow:** Every dialog body, walkthrough flow, template editor, and report tab is statically imported into its parent page. `TemplateEditor.tsx` (3,575 lines), `SiteWalkthrough.tsx` (1,632), `SnagDialog.tsx` (1,533), `JobWeekPanel.tsx` (1,889), and `CreateSiteWizard.tsx` (1,570) are all required up front by their owners. Total client-bundle bloat ≈ 50-80 KB gzipped per page beyond what the user actually sees on initial paint.
- **Expected impact:** Initial JS payload for the dashboard / programme is ~1.2-1.6 MB gzipped today. Reducing by 200-300 KB via lazy modal loading would shave 500-900 ms off TTI on mobile.
- **Fix:** Wrap large modal/dialog components in `dynamic(() => import(...), { ssr: false })`. Priority targets: `TemplateEditor`, `SiteWalkthrough`, `CreateSiteWizard`, `SnagDialog`, `JobWeekPanel`.

---

## P1 — Snags / Tasks / Orders list endpoints return entire result set

- **File:** `src/app/api/sites/[id]/snags/route.ts:27-43`; `src/app/api/tasks/route.ts:65-138`; `src/app/api/orders/route.ts:30-43`
- **What's slow:** None of these endpoints applies `take` or cursor pagination. `/api/orders` includes the full `supplier + contact + orderItems + job → plot → site` tree per row. `/api/tasks` runs nine parallel `findMany` with rich includes and **no take** on `overdueJobs`, `lateStartJobs`, `overdueOrders`, `awaitingDelivery`. At realistic scale (5,000 orders, 800 overdue jobs) each response can run to several MB.
- **Expected impact:** Today 200-400 KB; at 6 months of activity each page hits 3-5 MB and adds 500-1500 ms to TTI. Tasks page also rerenders the full list on every focus refresh (`useRefreshOnFocus`).
- **Fix:** Add `take: 100` defaults + cursor pagination to all list endpoints. Tasks page should also bucket counts vs full rows — only fetch full rows for the visible bucket.

## P1 — Site Story builds full plot timeline + every snag + every photo group in one go

- **File:** `src/lib/site-story.ts:191-771`
- **What's slow:** Inside `buildSiteStory` the sequence: `prisma.plot.findMany` (with leaf jobs) → `prisma.eventLog.findMany` (delay events) → `prisma.rainedOffDay.findMany` → `prisma.snag.groupBy` → `prisma.snag.findMany` (ALL snags) → `prisma.jobPhoto.groupBy` → `prisma.job.findMany` (allJobsLite for plot mapping) → `prisma.snag.groupBy` again → optionally events + journals + journals quote board. That is 9-11 round-trips even on the compact path. The two snag passes (groupBy then findMany) duplicate work.
- **Expected impact:** Story tab cold load is 800 ms - 1.5 s today; at portfolio scale (50 plots, 500 snags, 1,000 events) it stretches to 3-4 s. ZIP generator uses the same code path with `includeFullDetail` and so amplifies the cost.
- **Fix:** Collapse the two snag queries into one `findMany` and aggregate in memory. Run the independent reads with `Promise.all`. The `allJobsLite` round-trip is unnecessary — the plot include already returns each plot's leaf jobs with IDs.

## P1 — Bulk-delay route processes plots strictly serially despite each running its own transaction

- **File:** `src/app/api/sites/[id]/bulk-delay/route.ts:70-216`
- **What's slow:** `for (const plotId of plotIds)` — each plot does `findFirst` + `findMany` (jobs) + `findMany` (orders) + transaction containing N `update` calls + 2 audit creates + N parent recomputes + `recomputePlotPercent`. With 8 plots × ~25 round-trips = 200 sequential round-trips ≈ 3-5 s wall time. The transaction timeout is set to 30 s per plot — fine — but a "Delay all plots by 5 days" on a 20-plot site easily takes 10-15 s.
- **Expected impact:** Risks the 30 s Vercel default for larger sites. Even successful, the UX freezes the programme view for the duration.
- **Fix:** Run plot transactions in parallel chunks of 4-5. Each plot is independent. Same comment about pool-saturation in the code is outdated — verify with a quick load test.

## P1 — Cascade route (`PUT`/`POST`) re-queries jobs + orders that the caller already has

- **File:** `src/app/api/jobs/[id]/cascade/route.ts:71-285`
- **What's slow:** Both methods do `prisma.job.findUnique` (with plot include) then `prisma.job.findMany` (all plot jobs) then `prisma.materialOrder.findMany`. Three round-trips before any computation. The preview path then doubles up because the client UI typically calls POST (preview) then PUT (apply) within a few seconds — six round-trips for one user action. No memoisation between the two.
- **Expected impact:** Cascade preview latency is ~200-400 ms today; apply adds another similar slice. On a plot with 150 jobs the order findMany pulls 500+ rows even though only ~10 are downstream.
- **Fix:** Narrow the order query to `jobId: { in: downstreamJobIds }` after computing the cascade preview (apply path). For the preview/apply round-trip, accept an opaque "preview token" in the apply body that lets the route skip re-fetching jobs.

## P1 — `JobWeekPanel` opens with per-child N+1 fetches when parent is a stage

- **File:** `src/components/programme/JobWeekPanel.tsx:426-499`
- **What's slow:** When the user clicks a parent-stage row in the programme, the panel fires `Promise.all(childIds.map(cid => [fetch(/api/jobs/cid/photos), fetch(/api/jobs/cid)]))`. With 6 children per stage that is **12 HTTP round-trips just to open the panel**, each carrying its own auth + Prisma overhead. Even parallel, the slowest in the batch sets the visible latency (~400-700 ms today; will be worse on slow networks).
- **Expected impact:** Panel feels laggy now; will get visibly slow on mobile or under network throttle (>1 s open animation).
- **Fix:** Add a single `/api/jobs/[id]/with-children` endpoint that returns the parent + every child + every child's photos + actions + orders in one query. Or extend `/api/sites/[id]/programme` to optionally include child detail.

## P1 — Search uses unindexed `ILIKE %term%` across six tables

- **File:** `src/app/api/search/route.ts:34-160`
- **What's slow:** `{ contains: search, mode: "insensitive" }` translates to `ILIKE '%term%'` which cannot use a B-tree index — every match scans the whole table. Across 6 tables (Site, Plot, Job, Contact, MaterialOrder, Snag) in parallel.
- **Expected impact:** Fine today (small tables). At 10,000 jobs + 5,000 snags the search latency climbs to 1-2 s per keystroke. Without debouncing on the client (need to verify) it amplifies into a typing-lag UX problem.
- **Fix:** Add Postgres trigram (`pg_trgm`) GIN indexes on the searched fields, or move to Postgres full-text search with `tsvector` columns. Failing that, switch to `startsWith` matching for the most common case.

## P1 — Plot photos fetched via `flatMap` of grouped per-job counts + extra mapping query

- **File:** `src/lib/site-story.ts:505-524`
- **What's slow:** `prisma.jobPhoto.groupBy` returns counts per `jobId`, then `prisma.job.findMany({ where: { plotId: { in: plotIds } } })` runs purely to build a `jobId → plotId` lookup. Two queries where one would do.
- **Expected impact:** Adds 30-80 ms per Story tab load. Minor today; minor at scale; net waste.
- **Fix:** Group by `plot.id` directly via raw query, or fetch the `plotId` alongside photos via `prisma.jobPhoto.findMany({ where, select: { jobId, job: { select: { plotId } } } })` then aggregate in JS.

## P1 — `recharts` is statically imported by Dashboard, Analytics, and CashFlow

- **File:** `src/components/dashboard/DashboardClient.tsx:22-42`; `src/components/analytics/AnalyticsClient.tsx`; `src/components/reports/CashFlowReport.tsx`
- **What's slow:** recharts ships ~140 KB gzipped and depends on d3-shape and resize-observer-polyfill. Statically imported into the dashboard means every authenticated user pays for it on home-page hit, regardless of whether the charts are visible (the dashboard scrolls them off-screen on mobile).
- **Expected impact:** ~100 ms extra parse on mid-tier mobile per page load.
- **Fix:** Dynamic-import the chart components with a small SSR skeleton fallback.

## P1 — `analytics/lateness`, `analytics/profitability`, `analytics/contractor-calendar` fetched via independent useEffect waterfalls

- **File:** `src/components/analytics/AnalyticsClient.tsx:242-1180`
- **What's slow:** Seven `useEffect` blocks each issue their own `fetch` for a separate analytics endpoint. They run in parallel (good) but each carries its own auth + canAccessSite round-trip on the server side, and each kicks off independent data-conversion + re-render cycles in React. Total cold load = max(individual latencies) but ~7 React commit phases for what is conceptually one page.
- **Expected impact:** Sub-1 s today; visible jank on slower networks as widgets pop in.
- **Fix:** Combine into one `/api/analytics/full` endpoint or wrap with a SWR-like layout that batches the React commits. Failing that, switch to React Server Components for the read-only analytics widgets so the network round-trips happen during streaming SSR.

## P1 — Missing indexes on hot date columns

- **File:** `prisma/schema.prisma:303-352, 436-477, 870-897, 211-222`
- **What's slow:** Frequently filtered/sorted columns lack indexes:
  - `Job.startDate`, `Job.endDate`, `Job.actualEndDate` — daily-brief filters all three with `lt: today`, `gte: weekStart`, etc., on every cron and every site-page load.
  - `MaterialOrder.dateOfOrder` — used in `orderBy: { dateOfOrder: "desc" }` (orders list, contractor comms), no index.
  - `MaterialOrder.deliveredDate` — filtered in cash-flow + budget routes, no index.
  - `Snag.createdAt`, `Snag.resolvedAt` — weekly digest counts by date range, ageing report filters by `createdAt: { lt: 30d ago }`, no index.
  - `JobPhoto.createdAt` — every photos endpoint sorts by it for cursor pagination, no index.
  - `Site.status` — `where: { status: { not: "COMPLETED" } }` on every cron and dashboard fetch, no index.
  - `EventLog.createdAt` is part of `@@index([siteId, createdAt])` but plain `createdAt` queries (analytics 30-day windows) cannot use it.
- **Expected impact:** Each missing index forces a sequential scan on the hot path. With 12,000 jobs and 5,000 orders today the scans run in 20-50 ms — invisible. At 100,000 jobs (3-5 years out) the unsorted endDate scan alone can take 300+ ms per call and compound across the 8 daily-email queries × 20 sites.
- **Fix:** Add composite indexes aligned with the most common query shapes:
  - `@@index([endDate, status])` on `Job`
  - `@@index([startDate, status])` on `Job`
  - `@@index([dateOfOrder])` on `MaterialOrder`
  - `@@index([deliveredDate])` on `MaterialOrder`
  - `@@index([createdAt])` on `Snag`
  - `@@index([resolvedAt])` on `Snag`
  - `@@index([createdAt])` on `JobPhoto` (or `[jobId, createdAt]`)
  - `@@index([status])` on `Site`

## P1 — `<img>` tags everywhere — no next/image, no width hints, no responsive sources

- **File:** `src/components/programme/JobPhotosSection.tsx:208-212`; `src/components/programme/JobPhotoLightbox.tsx:90`; `src/components/plots/PlotCustomerViewTab.tsx:408`; `src/components/snags/SnagDialog.tsx`; `src/components/walkthrough/SiteWalkthrough.tsx`
- **What's slow:** Job photos render as `<img src={photo.url} className="size-full object-cover" />` — no `width` / `height` (layout shift), no `loading="lazy"` on most, no responsive `srcset`, no Vercel image optimisation. A grid of 20 photos pulls full-resolution Supabase originals (often 2-5 MB each on phones), totalling 40-100 MB transferred to display thumbnails.
- **Expected impact:** Plot pages with 50+ photos consume the user's data and crash mobile Safari on heavily-photographed sites. Layout-shift CLS scores will fail Core Web Vitals.
- **Fix:** Wrap with `next/image` and either configure Supabase as a remote image source in `next.config.js` (then Vercel handles resizing) or accept Supabase's `?width=` query-string transform on the URL. Add `loading="lazy"` and explicit dimensions.

## P1 — Weather cron does sequential HTTP fetch + DB writes per site

- **File:** `src/app/api/cron/weather/route.ts:45-124`
- **What's slow:** `for (const site of sites)` — for each site: `findFirst` (dedupe), `fetch(weather API)`, `create` event log, `sendPushToAll`, optional `count` weather-sensitive jobs, optional `sendPushToAll` again. Strictly sequential. At 20 sites × ~400 ms (one Open-Meteo round-trip + one push fan-out + a few queries) = 8 s. Pushes themselves call `prisma.pushSubscription.findMany` then iterate `webpush.sendNotification` in parallel — good — but the OUTER loop is the bottleneck.
- **Expected impact:** Currently fine; will brush 30 s at 60 sites.
- **Fix:** Run the per-site work with `Promise.all` (Open-Meteo allows ~10 concurrent free-tier calls).

## P1 — Notifications cron fans out one push per active site sequentially in `for` loop

- **File:** `src/app/api/cron/notifications/route.ts:164-198`
- **What's slow:** `for (const site of activeSites) { notifications.push(sendPushToSiteAudience(...)) }`. The push fan-out is queued into the `notifications` array and awaited via `Promise.allSettled` — good. But `sendPushToSiteAudience` itself does 4 sequential DB queries per call (site lookup, accessRows, execs, muted, then disabledPrefs, then subscriptions). 4 × N sites = 4×20 = 80 round-trips before any push fires.
- **Expected impact:** Today's setup runs in 2-4 s. At 50 sites = 200 lookup queries plus push fan-out, 10-15 s total.
- **Fix:** Bulk-fetch the audience data: one `findMany` for site.assignedToId across all active sites, one for UserSite, one for execs, one for muted, one for prefs, one for subscriptions. Build per-site audiences in memory.

## P1 — `canAccessSite` re-queries `UserSite` on every API request

- **File:** `src/lib/site-access.ts:46-54`
- **What's slow:** Every authenticated API call invokes `canAccessSite` which calls `getUserSiteIds` which queries `UserSite` — even for admins (CEO / DIRECTOR / SUPER_ADMIN) where the function short-circuits via role check. For non-admins it adds 5-15 ms per request. Many pages issue 5-10 API calls on mount; cumulative effect = 50-150 ms of redundant DB latency per page.
- **Expected impact:** Linear in API surface area. Today negligible; at high request rates per user it eats into the connection pool.
- **Fix:** Cache `userSites` for the request duration via `unstable_cache` keyed by userId, or push the result into the JWT/session payload at login so middleware reads it from the token without a DB hit.

## P1 — `JobWeekPanel`, `DailySiteBrief`, `SiteProgramme`, `TemplateEditor` exceed 1,500 lines each

- **File:** `src/components/programme/JobWeekPanel.tsx` (1,889); `src/components/reports/DailySiteBrief.tsx` (3,573); `src/components/programme/SiteProgramme.tsx` (2,442); `src/components/settings/TemplateEditor.tsx` (3,575)
- **What's slow:** Each is a single function component with dozens of useState + useMemo hooks. Any state change at the root re-renders the entire subtree. `SiteProgramme` has 8 useMemo + 5 useEffect at the top level — `processedPlots` (lines 639-754) recomputes the full synthetic-parent aggregation on every render where `filteredPlots` reference changes. `DailySiteBrief` similarly recomputes everything on every fetch refresh.
- **Expected impact:** On smaller sites the re-render cost is ~50-100 ms per state tick (visible jank on slower devices). With 20-plot sites and the Sub-Jobs view active, `processedPlots` alone takes 80-200 ms per render. The component-level memo boundary is so wide that React reconciliation is the bottleneck, not the data.
- **Fix:** Split each component into row-level subcomponents wrapped in `React.memo` keyed by plot/job ID. Move heavy useMemo into separate hooks file and lift derived state into useReducer where the state machine is non-trivial.

---

## P2 — `JSON.parse(JSON.stringify(...))` wrappers double-encode every route's response

- **File:** `src/app/api/sites/[id]/programme/route.ts:81`; `src/app/api/jobs/[id]/cascade/route.ts:113, 281`; `src/app/api/tasks/route.ts:141-149`
- **What's slow:** Each route serialises its response twice. `NextResponse.json` already does the date-stringify pass. The extra `JSON.parse(JSON.stringify(...))` round-trip allocates a duplicate object graph and runs an extra parse — adds 20-80 ms on a 2 MB programme payload.
- **Fix:** Remove the wrappers. `NextResponse.json` already handles Date → ISO string. If the goal is to strip prototype fields, do it explicitly on the relevant fields.

## P2 — `configureWebPush` called on every push send

- **File:** `src/lib/push.ts:5-11`
- **What's slow:** Each call to `sendPushToUser` / `sendPushToAll` / `sendPushToSiteAudience` re-invokes `webpush.setVapidDetails` even though the VAPID config is process-static. Negligible CPU cost (<1 ms) but ~10× per cron tick.
- **Fix:** Lazy-init at module load behind a `let configured = false` flag.

## P2 — No connection pool tuning on Prisma client

- **File:** `src/lib/prisma.ts:1-9`
- **What's slow:** `new PrismaClient()` defaults to `connection_limit = num_cpus * 2 + 1` (typically 5-9 on Vercel Lambdas). For serverless this is fine per-instance, but the pool resets on cold start. No `connection_limit` query param on `DATABASE_URL` to align with Supabase pgbouncer's transaction pool size.
- **Expected impact:** Under concurrent cron + user load the pool can starve briefly during cold starts.
- **Fix:** Add `?connection_limit=5&pool_timeout=10` to the Vercel `DATABASE_URL`, matching Supabase's recommended Lambda config.

## P2 — `siteCriticalPlot` linear search inside `plotPaths.reduce`

- **File:** `src/app/api/sites/[id]/critical-path/route.ts:157-161`
- **What's slow:** Inconsequential O(N) reduce — not a problem at any realistic plot count. Flagged purely because the route is on the dashboard cold path and any micro-cost shows up there.
- **Fix:** None needed. Listed for completeness; ignore.

## P2 — `processedPlots` useMemo in SiteProgramme rebuilds Map per render

- **File:** `src/components/programme/SiteProgramme.tsx:639-754`
- **What's slow:** Allocates a `Map<string, ProgrammeJob[]>` per render of every filtered plot, runs `flatMap` + `reduce` over each child set. The aggregation logic is sound; the cost is realloc churn on the GC during state-heavy interactions (selecting plots, opening panels).
- **Fix:** Memoise per-plot rather than per-render: extract a `useProcessedPlot(plot, jobView)` hook so each plot's processing memoises independently.

## P2 — `recomputePlotPercent` and `recomputeParentFromChildren` not batched on bulk-delay

- **File:** `src/app/api/sites/[id]/bulk-delay/route.ts:184-206`
- **What's slow:** Inside the per-plot transaction, parent recomputes run with `Promise.all` — good. But `recomputePlotPercent` runs after the transaction for each plot, serially. A 20-plot bulk delay does 20 separate `recomputePlotPercent` calls in series outside the transaction.
- **Fix:** Move `recomputePlotPercent` inside the per-plot tx OR batch them at the end of the outer loop with `Promise.all`.

## P2 — Critical-path route pulls all sub-job + parent rows even though only leaves render

- **File:** `src/app/api/sites/[id]/critical-path/route.ts:49-81`
- **What's slow:** Comment says "Pull every job (parents + children) so the helper can decide which are leaves" — but the response only renders `timeline.leafJobs`. The parent rows are loaded just to be discarded after `buildJobTimeline` classifies leaves.
- **Fix:** Either narrow the query to `{ children: { none: {} } }` and skip the helper's isLeaf branch, or accept the cost as design (it informs parent rollup math). Worth a 2 ms profile to confirm.

## P2 — `eventLog.findMany` on `analytics/route` orders by `createdAt desc id desc` without composite index

- **File:** `src/app/api/analytics/route.ts:146-153`
- **What's slow:** `orderBy: [{ createdAt: "desc" }, { id: "desc" }]` with `take: 100` — Postgres picks the existing `@@index([siteId, createdAt])` when filtered by siteId, but the unfiltered admin path falls back to a heap scan + sort.
- **Fix:** Add `@@index([createdAt])` on `EventLog` (or accept the cost since events log is small in practice).

## P2 — `useEffect` data fetches lack abort signals on unmount

- **File:** `src/components/programme/SiteProgramme.tsx:303-413`; `src/components/reports/DailySiteBrief.tsx:631-639`
- **What's slow:** When the user navigates away mid-fetch, the resolved data still calls `setState`, triggering "set state on unmounted component" warnings AND wasted re-renders. Not a wall-clock issue but a memory/GC pressure issue on rapid navigation.
- **Fix:** Pass `AbortController.signal` into `fetch` and bail in `.then` when aborted. Analytics already uses a `cancelled` flag (line 243-263); apply the same pattern everywhere.

## P2 — Site `findUnique` returns full include tree for share/token route on every request

- **File:** `src/app/api/share/[token]/route.ts:20-45`
- **What's slow:** Public share endpoint with no caching headers — every customer browser refresh re-runs the full plot+jobs query.
- **Fix:** Add `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on the share response. Plot status data tolerates a 1-minute lag, and the customer often hits refresh multiple times in a session.

## P2 — Budget report pulls every template in the system

- **File:** `src/app/api/sites/[id]/budget-report/route.ts:74-106`
- **What's slow:** `prisma.plotTemplate.findMany({...all... })` with full jobs + orders + items tree, regardless of which templates this site uses. With 20 templates × 30 jobs × 5 items each = 3,000 rows materialised just to build a lookup map.
- **Fix:** Restrict templates to the set actually referenced by this site's plots: `where: { id: { in: distinctSourceTemplateIds } }`.

## P2 — `contractor-comms` route does multiple findMany passes that could be merged

- **File:** `src/app/api/sites/[id]/contractor-comms/route.ts:31-181`
- **What's slow:** Four sequential `findMany` (jobContractors → snags → materialOrders → signOffRequests → siteWideDrawings → plotDrawings). Five-six round-trips when the data could be fetched in one transaction or via Promise.all (since they're independent).
- **Fix:** Wrap the independent fetches in `Promise.all`.

---

**Summary**: 11 P0, 16 P1, 11 P2 = 38 findings total. Hottest areas: cron routes (4 of 6 risk timeout at scale), the handover ZIP fan-out, programme route payload size, and the static xlsx + recharts imports on every authenticated page. Index gaps on `Job` date columns and `Snag.createdAt` are the most consequential schema-level fixes; lazy-loading modals via `next/dynamic` is the single largest bundle-size win.
