# Sight Manager — Master Context File

**Purpose:** single hand-off document for continuing this project in a new chat with zero prior context. Read this top-to-bottom before touching code. Cross-check every claim here against the live code before acting on it.

---

## 0.A SINGLE SOURCE OF TRUTH — TEMPLATES (May 2026)

After a chain of template-editor bugs in May 2026, the data model was
rewritten so each piece of business information has **one canonical home**.
Every other field representing the same concept is a derived cache, written
on save and never read for math.

### Sub-job and atomic-stage duration

- **Canonical:** `TemplateJob.durationDays` (working days, 1 = one Mon–Fri day).
- **Derived caches** (write-only, never trust for math):
  - `durationWeeks` = `durationDays / 5`
  - `startWeek` / `endWeek` on individual sub-jobs (no longer maintained — recalculate endpoints stopped writing them; a one-shot backfill on 8 May 2026 populated `durationDays` for every legacy week-only sub-job).
- **Layout:** Editor's TemplateTimeline computes sub-job bar positions on the fly from `sortOrder + durationDays` (a "day cursor" walked through each parent's children). A 3-day sub-job spans 3 day columns in Days view, 0.6 of a week column in Weeks view.

### Order timing

- **Canonical:** the seven anchor fields on `TemplateOrder`:
  - `anchorType` (`"order"` / `"arrive"`)
  - `anchorAmount` + `anchorUnit` (`"weeks"` / `"days"`)
  - `anchorDirection` (`"before"` / `"after"`)
  - `anchorJobId` (which job the order timing is anchored to)
  - `leadTimeAmount` + `leadTimeUnit`
- **Derived cache** (server computes on every POST/PUT via `lib/template-order-offsets.ts`):
  - `orderWeekOffset` / `deliveryWeekOffset` — kept in lock-step with anchor fields.
- **Apply-time:** `apply-template-helpers.resolveOrderDates` reads anchor fields, looks up the anchor job's start in the pre-computed `templateDateMap`, and produces concrete `dateOfOrder` + `expectedDeliveryDate`. Falls back to legacy offsets only if `anchorType` is null (templates predating the rework).
- **Auto-reorder on job-start:** uses anchor-era `leadTimeAmount`/`leadTimeUnit` (then `deliveryWeekOffset` legacy fallback) to compute `expectedDeliveryDate = today + leadTime`. `dateOfOrder` = today.

### Plot-side data

- **Canonical:** `Job.startDate` / `Job.endDate` and `MaterialOrder.dateOfOrder` / `expectedDeliveryDate`. Concrete `Date` values, set at apply time, mutated by the cascade engine. Once a plot exists, downstream consumers (Daily Brief, Programme, Orders, Analytics, Notifications, Contractor Comms, Cash-Flow) read these directly. **Template-editor bugs cannot affect already-applied plots.**
- **Snapshots:** `Job.originalStartDate` / `originalEndDate` capture the apply-time plan. Never mutated.

### Audit trail

Full trace of how this model was reached (consumers audit, SSOT proposal, execution plan): `docs/template-ssot-audit-2026-05-08.md`. The seven-step execution shipped in commits `8bc65a2` → `678da74`. Smoke verified end-to-end via API: a fresh plot from `SMOKE_TEST — Simple Semi` produced exactly the dates the canonical model predicted.

---

## 0.0 STATE-OF-PLAY — POST-LAUNCH WEEK (22 Apr 2026)

**Read this section first. Everything below it is historical; this is right now.**

### What Keith is doing

App launched 20 Apr 2026. Since go-live, Keith has been stress-testing live on real sites (Old Hall Village, Keith's Site, Ryan's Site, Paul's Site). He's filed ~35 bugs/refinements across the session — most fixed inline, shipped to Vercel, hard-refreshed, re-tested. **No rollbacks.** State machine + cascade integrity preserved through every change (59/59 cascade invariants still green).

### What's shipped since launch (35 commits, most recent first)

```
2f898f2  feat(orders): after save, offer to add items to supplier pricelist
04801ee  fix(HelpTip): bigger icon + no longer overlaps the Dialog close X
4a41bd4  fix(uploads): lift template drawing cap 50MB → 500MB
9eecac1  feat(template-timeline): Weeks / Days toggle
d0d0e7f  fix(template-orders): preview weeks now skip Week 0 (industry convention)
5dfddd6  feat(template-orders): clearer preview + lead-time only in Arrive mode
9ba00fc  feat(template-editor): jobs calculated from sub-jobs, atomic toggle, sub-job D&D, drop Start/End Week
8d6ad53  fix(cascade-client): the OTHER toISOString — multiline version missed
3b253cf  chore(script): recompute-plot-dates — repair bad existing plot dates (69 plots, 1270 leaf + 549 parent)
8722872  fix(cascade-client): toISOString() bug sent yesterday's date to server
7562f28  fix(cascade): parents derived from children, not independently shifted
b8f8b88  fix(early-start): timezone bug + consolidate pull-forward section
0579609  feat(early-start): working-day label + preflight + custom date picker
5bbfcbf  fix(daily-brief): alerts + pills were doing nothing on click
61afa31  fix(qa): two bugs surfaced during full-system verification pass (FormData upload + JobWeekPanel stop dialog)
57f4f24  fix(mobile+print): walkthrough stack on mobile, report controls hide on print
b91553c  chore(cron): explain daily-email failures in the event log
e2b1821  fix(uploads): signed URLs to bypass Vercel 4.5MB body cap
6ac3961  feat(stage-dialog): inline errors + per-sub-job days/weeks toggle
83bd56b  feat(site-wizard): custom plot numbers + mixed range input
47a034d  fix(orders): PENDING→DELIVERED silently 400'd — auto-bridge instead
28dba21  fix(mobile): bigger touch targets + clearer button labels
b76e926  fix(errors): surface the remaining silent-failure paths
d53c524  feat(stop-job): capture reason on every stop via shared dialog
ca11b11  fix(programme): Today overlay was eating clicks on everything below it
e4c8422  fix(sidebar): site-scoped nav works without a site, collapse persists
cf9475f  fix(programme): Monday-morning off-by-one + clickable dots
48f229b  chore(seed): launch-day site + plot seeder (60 plots across 3 sites)
300e0f6  fix(print): hide interactive controls, force-expand Budget plots
ba4a482  fix(errors): surface API failures as toasts, not silent no-ops
db4ceb7  fix(mobile): overflow, touch targets, context loss at 375px
f3e3386  feat(walkthrough): inline snag + order quick-flips on site
e2cfe0f  feat(action-parity): Pull Forward + inline flips on every surface
c19bfc8  fix(upload-label): DocumentUpload says "max 50MB" not 10MB
0ef2341  nav: add missing "Day Sheets" to site sidebar (Site Reporting group)
```

### Major themes of this post-launch session

#### 1. Cascade integrity — four distinct bugs found and fixed

The cascade engine was the single most-tested part of the codebase pre-launch (59 invariants, all passing) — but every bug found post-launch exposed a case those tests didn't cover:

- **`cf9475f`** — Programme's "Today" column math was one week off every Monday. `isWithinInterval(now, {start, end})` from date-fns is inclusive on BOTH ends, so Monday midnight matched both the old and new week columns. `findIndex` returned the first match → wrong. Replaced with half-open `[start, end)` check.
- **`7562f28`** — Cascade engine was treating parent stages as INDEPENDENTLY shiftable. Pulling a child job forward would shift the parent by the same delta, landing the parent's stored startDate in the past even when every child was still in the future. Fix: parents excluded from the shift loop; after children are moved, parents re-derived as `min(child.newStart)` / `max(child.newEnd)`. Required adding `parentId` to the `CascadeJob` type + the route's job projection.
- **`8722872` + `8d6ad53`** — Two separate occurrences of the SAME client-side timezone bug in cascade calls. Pattern: `addWorkingDays(date, -N).toISOString().split("T")[0]` where the `Date` has had `setHours(0,0,0,0)` applied. In BST (UTC+1) local midnight = UTC 23:00 of previous day, so `toISOString().split("T")[0]` returned YESTERDAY's date. The single-line version was fixed first (`8722872`); a multi-line version in `previewPullForward` + `executePullForward` was missed and fixed in `8d6ad53`. Root cause class: any place formatting a Date to YYYY-MM-DD must use `toLocaleDateString("en-CA")` (local) not `toISOString()` (UTC).
- **`47a034d`** — `PUT /api/orders/[id]` rejected `PENDING → DELIVERED` transitions with a 400. But the UI showed "Confirm Delivery" buttons on PENDING orders throughout. Users clicked, got a silent 400, order stayed PENDING, "awaiting delivery" stat forever 0. Fixed by auto-bridging: PENDING → DELIVERED now sets both `dateOfOrder` and `deliveredDate` to now. DB audit before the fix: Keith's Site had 380 orders, 1 delivered, 379 silently stuck.

**Recompute migration** (`3b253cf`): because historical plots had been created by the OLD apply-template logic (positional startWeek/endWeek → overlapping children + Sunday starts + parent startDate ≠ min(children startDate)), a one-off script re-laid every NOT_STARTED job sequentially by sortOrder, preserving each child's working-day duration. Applied with `TZ=UTC` to avoid local-tz drift. 69 plots, 1270 leaf jobs, 549 parent aggregates corrected. Run via `npx tsx scripts/recompute-plot-dates.ts --apply` (dry-run by default).

#### 2. Template-editor redesign — "jobs are calculated from sub-jobs"

Keith's core insight: **a job's duration = sum of its sub-job durations. You shouldn't manually set startWeek/endWeek on a job that has sub-jobs.**

Two behaviour changes landed together (`9ba00fc`):

- **apply-template-helpers.ts**: children now cascade SEQUENTIALLY in sortOrder. Parent anchor = `plotStart + parent.startWeek - 1` (snapped forward). First child starts at anchor, each subsequent child starts the next working day after the previous child's end. Parent span = first-child-start → last-child-end. Old logic used each child's own startWeek which allowed overlap/gaps.
- **TemplateEditor Edit Job dialog**:
  - Job has sub-jobs → read-only "Duration auto-calculated — N sub-jobs · M working days total"
  - Sub-job → single "Duration (working days)" input only (no Start/End Week)
  - Top-level leaf job → "This job has no sub-jobs" tickbox; ticked → Duration input shows
  - Save payload omits startWeek/endWeek entirely; for atomic jobs sends `{durationDays: N, durationWeeks: null}`

- **Sub-job rows** — now display in working days ("d" not "wk"), have a `GripVertical` drag handle, and support HTML5 drag-and-drop reordering within the same parent. Cross-parent drag rejected with toast. New order persists via per-child sortOrder PUT + parent recalculate.

**Migration** (`scripts/migrate-subjob-duration-to-days.ts`): converted every sub-job's stored `durationWeeks: N` → `durationDays: N × 5`. 114 sub-jobs migrated at launch time. Idempotent — re-running is a no-op.

#### 3. Template timeline — Weeks / Days toggle + order-dot labels (`9eecac1`, `5dfddd6`)

- `TemplateTimeline.tsx` gained a `viewMode: "weeks" | "days"` toggle top-right. Days view: each week expands into 5 day-columns (`DAY_WIDTH = 28px`, header shows "M T W T F" per week with alternating bg). Week mode unchanged.
- Maths refactor: all bar widths / dot offsets use `weekPixels = colWidth × colsPerWeek` so both modes render identically from the same math.
- Order/delivery dots: bumped from 8px to 12px, added inline "W-1 / W3" labels in matching colour, white ring + shadow for contrast. Legend updated.
- **Week 0 skipped everywhere** — construction-industry convention: `..., -3, -2, -1, 1, 2, 3, ...` (no zero). `displayWeek()` helper in both TemplateEditor + TemplateTimeline applies `raw <= 0 ? raw - 1 : raw`.

#### 4. Order-timing UX rewrite (`5dfddd6`)

The order Add/Edit dialog's timing section was confusing:
- Lead time input showed in both Order and Arrive modes (irrelevant in Order mode — the user is setting the order date directly)
- Preview text was dense: `Order 2 weeks before Brickwork → Order Wk -1 → Delivery Wk 3`
- No warning when lead-time-back-calc put delivery AFTER the anchor job starts

Now:
- **Lead time only visible in Arrive mode** — in Order mode, the user is setting order date; supplier lead time is their problem.
- **Preview shows anchor phrase + absolute week**:
  - Order mode: `Order Wk -2 · 2 weeks before Brickwork`
  - Arrive mode: `Arrive Wk -2 · 2 weeks before Brickwork` + `Order Wk -6 · 4 weeks earlier (lead time)`
- **Red warning when delivery > anchor.startWeek** in Arrive mode — catches impossible lead-time configurations.

#### 5. Starting Early dialog rewrite (`0579609`, `b8f8b88`)

The dialog that fires when user clicks Start on a job with a future startDate. Old version had three separate buttons (Pull Programme Forward / Pull to Specific Date / Pull to Next Event) with confusing defaults and a preflight that ran AFTER click. New version:

- **Single unified "Pull Programme Forward" section** with an embedded date picker defaulting to today.
- **Live preflight** on every date change — dialog calls `POST /api/jobs/[id]/cascade` (preview) and shows `✓ Safe to pull to this date` or `Shift blocked — X would start in the past. Try a later date.` BEFORE the user clicks Apply.
- **"Reset to today" shortcut** if the user bumped the date.
- **Label change**: "7 days" → "7 working days" throughout the dialog (always was working-day math; just the label was ambiguous).
- **Expand This Job** + **Pull to Next Event** retained as separate options (genuinely different actions).

#### 6. Alerts + pills scroll on Daily Brief (`5bbfcbf`)

Every pill and every alert row was a native `<a href="#id">`. Browser default: scroll the WINDOW. But `body` has `overflow-hidden` and `<main>` is the actual scroll container, so clicks silently did nothing (hash updated, nothing scrolled). Fix: single `scrollToSection()` helper using `scrollIntoView()` + auto-expand the target's collapsible section if closed + flash a blue ring for 1.5s so the user sees where they landed. Wired into both pill handlers and alert handlers. Also caught 5 broken pill anchors pointing to IDs that didn't exist (`section-active`, `section-delayed`, `section-tomorrow`, `section-upcoming-orders`, `section-overdue-deliveries`) — added the missing IDs or repointed the pills.

#### 7. Stop-reason dialog (`d53c524`)

Keith's "flow of decision" rule: every stop captures a reason. Before: Tasks hardcoded a note ("Stopped from tasks — overdue"); Jobs/JobDetail/JobWeekPanel just POST'd with no note. Now: `useJobAction.triggerAction(job, "stop")` opens a shared reason-capture dialog unless notes are pre-supplied. Required in all surfaces:
- TasksClient — migrated off its inline `handleStopJob` fetcher (−24 lines).
- JobsClient dropdown — switched from `runSimpleAction` to `triggerAction`.
- JobDetailClient — already used `triggerAction` so picked up the dialog automatically.
- JobWeekPanel (both `handleJobAction` + `handleChildJobAction`) — were calling `fireJobAction` directly with no notes → silently bypassed the dialog. Routed through `triggerAction` when no notes supplied.

#### 8. Today overlay pointer-events (`ca11b11`)

Programme's "Today" highlight stack (40px-wide translucent column + vertical line + label) had no `pointer-events-none`. The highlight column at `z-[5]` covered every job block and dot in the current week column → silently unclickable. Fixed: `pointer-events-none` on all three overlay divs; also on gridlines for good measure. **This was the worst UX bug of the session** — users most want to interact with TODAY, and that's exactly what was broken.

#### 9. Sidebar + dead-link bugs (`e4c8422`)

- Stale `localStorage` site ID from before the launch-day site reset: sidebar kept building links to deleted sites → 404 on every click. Fix: on `/api/sites` fetch, if stored fallback ID isn't in the returned list, clear it + `localStorage.removeItem`.
- Site groups (Manage Site / Site Reporting / Site Admin) were only rendered when a site was selected → new users had no way to discover Programme/Plots/Orders. Now: always rendered; when no site is selected, sub-items link to `/sites?pickFor=<tab>`. The SitesClient reads `pickFor` and shows a banner ("Pick a site to view its Programme"), then forwards the click straight to the chosen site's tab.
- Collapse button was `useState(false)` per render — reset every navigation. Now persisted via `localStorage`.

#### 10. Upload signed URLs for large drawings (`e2b1821`, `4a41bd4`)

Vercel caps serverless function request body at 4.5MB on all plans. Template drawings routinely exceed 10MB; CAD files hit 100MB+. Fix: 3-step signed-upload flow.
- `POST /api/plot-templates/[id]/documents/sign` → Supabase `createSignedUploadUrl()` returns `{signedUrl, token, storagePath}`.
- Client `PUT` directly to `signedUrl` (with FormData wrapping per Supabase's expected format — see `61afa31`).
- `POST /api/plot-templates/[id]/documents/register` → verifies the file landed in storage, creates the DB row.

Server cap: 50MB → 500MB. UI label updated. **Site docs + plot drawings still use the legacy direct-POST flow** — they 413 at ~4.5MB. Flagged to Keith; not ported yet.

#### 11. Mobile breakpoint sweep (`db4ceb7`, `28dba21`, `57f4f24`)

Site managers use this on phones. 375px iPhone audit caught:
- JobsClient 9-column table → wrapped in `overflow-x-auto`
- TasksClient overdue rows → `flex-wrap` so action buttons drop to next line
- Walkthrough snag / order quick-flip buttons → `min-h-[32px] px-3 text-xs` (was `py-0.5 text-[10px]`, below Apple/Material minimums)
- `hidden sm:inline` removed from contractor/assignee/due-date context across Daily Brief + PlotTodoList (mobile rows were showing just "Job Name · Phil" with no company or deadline)
- TasksClient icon-only mobile buttons (`Mail` for Chase, `Mail` for Send Order) → always show labels

#### 12. Silent failure sweep (`ba4a482`, `b76e926`)

12 mutation paths were swallowing errors. Fixed:
- JobsClient create/edit/delete + confirm()
- SuppliersListClient.handleCreate
- TasksClient.handleStopJob + handleMarkGroupSent
- PostCompletionDialog.decide
- SiteDetailClient.handleDeletePlot (replaced `alert()` with toast) + site edit
- PlotMaterialsSection POST + DELETE
- SiteQuantsClient manual material + one-off order POST

Remaining silent paths listed in section 8.

#### 13. Print output + email diagnostics (`300e0f6`, `b91553c`)

- DailySiteBrief action strips on every job row: `print:hidden` (were bleeding into the PDF)
- BudgetReport + CriticalPath collapsed plots: rendered always-in-DOM with `hidden print:block` so prints include every plot regardless of on-screen expansion state
- DelayReport filter, CashFlowReport date-mode toggle, ContractorDaySheets date-nav buttons: `print:hidden`
- Daily email cron was logging "3 failed" every morning with no explanation. Root cause: `RESEND_API_KEY=""` in env. Now early-exits with a clear SKIPPED log; actual send failures include the first error message truncated to 140 chars.

#### 14. Notification infrastructure audit

Verified (not fixed — already working):
- Web-push VAPID keys set; service worker registered; usePush hook correct.
- Subscriptions stored per-device with proper cleanup on 410/404.
- Cron jobs fire `sendPushToAll` for 9 notification types daily at 05:30 UTC.
- Ryan subscribed on Safari/iOS at launch — receiving pushes correctly.
- Toast system wired correctly via `ToastProvider` at app-layout level (`z-[9999]`, 5-10s auto-dismiss).

Email is the ONLY broken path — needs `RESEND_API_KEY` set in Vercel dashboard.

#### 15. Plot numbering in Site Wizard (`83bd56b`)

Site creation wizard's "Add Plots" section used to take two numeric inputs (From / To) and generate consecutive integer plot numbers. Keith: "the plot numbers may be customised". Replaced with a single free-form text input that accepts:
- Ranges: `1-20`
- Comma lists: `47-A, 47-B, 50`
- Mixed: `1-5, 10, 12-14`
- Pure alphanumeric: `BLK-A-01, BLK-A-02`

Integer-integer ranges expand; anything else treated literally (preserves hyphens in "47-A"). Live preview shows "X plots parsed" or a red error. Dedupe within batch + across batches. Unique constraint respected. `Plot.plotNumber` schema column is `String?` — already handles any text.

#### 16. Stage dialog validation (`6ac3961`)

Custom Stage form in "Add Stage" dialog:
- Inline amber warning banner appears when the Add button is disabled, listing exactly what's missing ("Stage Code is required", "Sub-job 3 is missing name, code, or duration")
- Sub-job rows gained a "d" / "w" unit toggle (per-row, inside the grid)
- Stage Code input strips non-A-Z0-9 chars (`BW"` bug with stray quote)
- Save path: days-unit sub-jobs post `{durationDays: N, durationWeeks: 1}` (1 as grid-slot placeholder); weeks-unit post `{durationWeeks: N, durationDays: null}`

#### 17. Custom items → supplier pricelist (`2f898f2`)

New hook `useReviewSupplierMaterials` — after an order save, opens a review dialog diffing the order's items against the supplier's `SupplierMaterial` rows. Three per-item states:
- **NEW** (not in pricelist) — checkbox "Add to [supplier] price list" (default ticked)
- **EXACT MATCH** — info only ("already in list")
- **PRICE CONFLICT** — radio group: Update list / Add as separate item (user types distinguishing name) / Leave list alone

If every item is an exact match, dialog never opens. Wired into both TemplateEditor's order save AND SiteQuantsClient's one-off order save. Uses existing `POST /api/suppliers/[id]/pricelist` (create) + `PUT /api/suppliers/[id]/pricelist/[itemId]` (update).

#### 18. HelpTip fix (`04801ee`)

Two bugs in one component. Icon was `size-5` (20px, muted grey) — too small, easy to miss. **And** the default absolute positioning `right-2 top-2` collided exactly with DialogContent's close X (28px button also at `right-2 top-2`). Every Dialog using a default (non-inline) HelpTip was stacking two buttons on top of each other. Fix: icon size-5 → size-6 with blue bg/border for prominence. Position `right-2 top-2` → `right-10 top-2.5` so the ? sits LEFT of the X with a 4px gap. No call-site changes needed.

### Post-launch data state

- **Users:** Keith (CEO), Ryan (CEO), Paul (SITE_MANAGER).
- **Sites created (real, not test):**
  - Keith's Site — 20 plots, 600 jobs, assigned to Keith (seeded via `scripts/seed-launch-sites.ts`)
  - Ryan's Site — 20 plots, 600 jobs, assigned to Ryan
  - Paul's Site — 20 plots, 600 jobs, assigned to Paul (Paul also has UserSite grant for this site only)
  - Old Hall Village — 20 plots, created by Ryan via UI using template "1047 v12"
- **Templates in use:** The Briarwood (38 jobs, 27 orders), The Oakwood (28), The Riverside (26), The Willow (28), plus "1047 v12" (Ryan's custom — had malformed sub-job data, cleaned up by the recompute migration).
- **Total leaf jobs across all plots:** ~2400. All date-normalised post `3b253cf`.

### Known fragile / just-shipped (re-browser-verify before touching)

1. **Template Editor UI** — the full redesign (`9ba00fc`) is the biggest behavioural change since launch. Edit Job dialog's conditional rendering (auto-calc banner vs atomic-toggle vs duration input) has three branches; test all three.
2. **Sub-job drag-and-drop** — HTML5 native drag, not a library. Mobile Safari's drag-and-drop support on `draggable` elements is unreliable. If Keith reports "drag doesn't work on iPad", this is why.
3. **Pull Forward preflight + cascade parent fix** — both landed the same day. Cascade invariants still 59/59 but those tests don't exercise parent/child hierarchies explicitly.
4. **Signed upload flow** — only wired for template drawings. Site + plot drawings still use the legacy flow (4.5MB Vercel cap).

### What's NOT done yet — post-launch outstanding

- [ ] **TasksClient icon ambiguity** (Mail icon = Chase in one row, Send Order in another — ambiguous on mobile when labels are hidden).
- [ ] **Walkthrough `grid-cols-3` at 1075** (no sm: prefix — tight at 375px but not broken).
- [ ] **JobWeekPanel + Walkthrough using inline note POSTs** instead of `useAddNote` hook. Works, just divergent.
- [ ] **ContractorComms.handleSubmit** fires two POSTs back-to-back (photos + request-signoff); neither checked.
- [ ] **useOrderEmail + useJobAction cascade** failures: `console.error` only in 5 spots — should toast.
- [ ] **TemplateEditor timeline update** silent fail on error.
- [ ] **Site + plot drawing uploads** still legacy direct-POST (413 above 4.5MB).
- [ ] **`RESEND_API_KEY` not set in Vercel** — daily email digest is SKIPPED every morning. Keith to set in Vercel dashboard.
- [ ] **Paul's UserSite restriction end-to-end browser verification** — tested at API level, not browser-clicked.
- [ ] **Full browser click-through test** — just being kicked off by Keith; see todo below.

### Session scripts added post-launch

- **`scripts/seed-launch-sites.ts`** — one-shot idempotent seed. Deletes all existing sites, creates Ryan/Keith/Paul sites with 20 plots each staggered weekly from a given start Monday. Rotates through 4 templates per batch for house-type variety. Can re-run any time to reset.
- **`scripts/migrate-subjob-duration-to-days.ts`** — one-off migration converting sub-job `durationWeeks: N` → `durationDays: N × 5`. Idempotent.
- **`scripts/recompute-plot-dates.ts`** — repair script for plots with bad dates (Sunday starts, parent/child misalignment, gaps). Dry-run by default; `--apply` writes. **Run with `TZ=UTC`** to avoid local-tz drift (working-days.ts utility does local-midnight setHours which gives different results in BST vs UTC).

### Active browser test — in progress

Keith has kicked off a browser-only end-to-end test (22 Apr 2026). Process:
1. Create 2 plot templates manually through the browser (no DB seeding).
2. Create a staggered site with 6 plots using those templates.
3. Exercise: Pull Forward, Expand, Delay, Early Order, Custom Order, Walkthrough, Adding Notes.
4. Fix display / small UX bugs inline.
5. Write a refinement plan for larger issues.
6. Critically viewing from the perspective of a site manager who hates apps.

**This test is IN PROGRESS — check the session log for current status.**

---

## 0. QUICK START — IF YOU ARE A NEW CLAUDE, READ THIS FIRST

You are taking over Sight Manager from a previous session. Keith (the user) is a UK construction business owner, non-technical but domain-expert. He has stakes — "people's families depend on this working". He expects defensive engineering, not MVP shortcuts.

### First 5 minutes of a new session

1. **Read this whole file top-to-bottom** (~650 lines). Don't skim. Section 4 (system logic) and section 11 (workflow) are critical.
2. **Read `~/.claude/projects/.../memory/feedback_core_flows.md`** — the "one source of truth" principle + Keith's interaction rules. This is the meta-rule that governs every change.
3. **Check `git log --oneline -20`** — most-recent commits tell you where we were last. The session log (if pinned) is in `~/.claude/projects/C--Users-keith-OneDrive-Desktop-sight-manager/`.
4. **Run smoke checks silently**: `npx tsc --noEmit` and `npx tsx scripts/test-cascade.ts` (should be 59/59). Never announce running these — Keith's rule: silent verification.
5. **Read the Open Backlog (section 8)** and the Deferred Items Table (section 7) — these list everything that's parked and why. Pick up from there unless Keith directs otherwise.

### Cardinal rules (violate at your peril)

- **One source of truth per concept.** Before adding any button/dialog/mutation, find the existing hook (section 6 "Canonical hooks"). If the central hook is missing a feature, add it to the hook — never a bespoke copy.
- **Ask multiple-choice questions** when the answer isn't obvious. Label the recommended option ⭐. Keith replies "a, a, a, a" — make that format work.
- **Browser-test every UI change** before pushing. Use `mcp__Claude_in_Chrome` to open `http://localhost:3002` or `https://sight-manager.vercel.app/`, click through, confirm behaviour.
- **Deploy then verify.** `git push` to `main` triggers Vercel auto-deploy. Check the live site in Keith's browser afterward. Don't announce you're "verifying" — just do it.
- **Never narrate routine checks.** Silent verification: run the test, report only if it failed. Keith hates "I'm going to now run the tests…" preambles.
- **Check ALL consuming views** when changing any data model or status rule. Sections 4.2/4.3 list the consuming views for order and job status — miss one and the regression is silent.
- **Prisma pool: ≤3 concurrent `Promise.all`** over DB queries. Supabase pool is tight.
- **Cascade tests are the safety net** — run `npx tsx scripts/test-cascade.ts` after any cascade-adjacent change. 59/59 must stay green.

### The workflow in one paragraph

Keith describes a pain point or an idea. You ask multiple-choice questions to pin down exact behaviour. You check if a hook already handles it (collapse, don't duplicate). You implement, typecheck silently, cascade-test if relevant, commit with a descriptive message, push, and browser-verify on the live URL. If you're about to defer anything, you say so explicitly and get Keith's sign-off — silent deferrals are forbidden. See section 11 for full detail.

### Where things live

- **Code:** `C:\Users\keith\OneDrive\Desktop\sight-manager`
- **Docs:** `docs/` — this file, `cascade-spec.md`, user-facing `.docx`/`.pptx`
- **Memory (persists across sessions):** `C:\Users\keith\.claude\projects\C--Users-keith-OneDrive-Desktop-sight-manager\memory\*.md` — read these alongside this file
- **Live app:** https://sight-manager.vercel.app/
- **Dev server:** `npm run dev` → `http://localhost:3002`

### What you absolutely must NOT do

- Duplicate a flow that already has a hook.
- Amend commits — always create new ones (Keith wants a clear audit trail).
- Silently defer work. Every deferral goes in section 7 with Why + Next Action.
- Touch `src/lib/cascade.ts` without running `scripts/test-cascade.ts` after.
- Deploy without browser-verifying the change.
- Invent dates or stats. If you don't know, check the code or DB.

---

## 1. APP OVERVIEW

**Sight Manager** is a construction site management web app. Site managers use it to plan plot builds, track job lifecycles (start/complete/sign-off), manage material orders, record delays/snags, and communicate with contractors. A programme-wide cascade engine shifts dependent dates when anything changes.

- **Repo:** `C:\Users\keith\OneDrive\Desktop\sight-manager`
- **Deployed to:** Vercel (auto-deploy on push to `main`) — https://sight-manager.vercel.app/
- **GitHub:** `snapifyreports-art/sight-manager`
- **Working branch:** `main` (no feature branches used)

### Stack

- **Frontend:** Next.js 16.1.6 (App Router, Turbopack), React 19
- **UI:** Base UI (`@base-ui/react`) + Tailwind CSS 4; shadcn-style ui primitives in `src/components/ui/`
- **Backend:** Next.js Route Handlers in `src/app/api/**`
- **Database:** PostgreSQL via Prisma 6; Supabase-hosted (pooled connection)
- **Auth:** NextAuth v5 (email + password, JWT sessions, strategy: `"jwt"`)
- **File storage:** Supabase Storage (`PHOTOS_BUCKET`) for photos + documents
- **Dev port:** 3002

### Key infrastructure rules

- **Prisma pool cap:** never run more than ~3 parallel Prisma queries in `Promise.all` — Supabase pool is tight.
- **Turbopack/OneDrive:** `next dev` can crash on OneDrive-synced dirs. If crashes happen, fallback: `npx next build && next start -p 3002`.
- **Env vars:** `NEXTAUTH_URL="http://localhost:3002"`, `AUTH_TRUST_HOST=true`, `DATABASE_URL`, `DIRECT_DATABASE_URL` (session-mode pooler for `prisma db push`).
- **Middleware renamed to proxy:** Next.js 16 deprecated `middleware.ts` → `src/proxy.ts` with exported `proxy` function.

---

## 2. TARGET USER

- **Primary:** Keith, a small UK construction business owner running multi-plot residential sites. Non-technical but construction-domain expert.
- **Secondary:** Site managers (SITE_MANAGER role — scoped to a subset of sites via `UserSite`), contractors (via public share-token links, read-mostly).
- **Business context:** "people's families depend on this working" — delays or data-corruption are career-ending; Keith expects defensive engineering, not MVP shortcuts.
- **Work style preferences:**
  - Prefers **multiple-choice questions** with a recommended option rather than open-ended prompts.
  - Wants **deploy-to-Vercel-and-test** after every non-trivial change.
  - Values **unification over duplication** — one core flow per concept, many UX entry points.
  - Expects proactive **data verification** after changes, not post-hoc "I think it works".

---

## 3. CORE FEATURES

- **Multi-site, multi-plot** — plots created blank, from template, or in bulk
- **Plot templates** with jobs, orders, materials, drawings; snapshot-copied to plots on apply
- **Job lifecycle** — `NOT_STARTED → IN_PROGRESS → COMPLETED → (signed off)`, `ON_HOLD` at any time
- **Parent/child jobs** — "stages" (parent) contain "sub-jobs" (children). Parent dates are derived from children.
- **Cascade engine** — see section 4. Shifts all downstream jobs + orders by a working-day delta.
- **Order lifecycle** — `PENDING → ORDERED → DELIVERED → CANCELLED`
- **Material quantities (Quants)** — per-plot bricks/mortar/etc., manual or from template
- **Drawings / documents** — site-wide, plot-scoped, or job-scoped; 50MB/file; multi-upload with per-file labels
- **Snags** — OPEN/IN_PROGRESS/RESOLVED/CLOSED, with before/after photos
- **Daily Brief** — central hub for today's work
- **Walkthrough** — mobile-first site manager flow
- **Programme** — Gantt-style schedule across all plots
- **Reports** — Budget, Cash Flow, Delay, Critical Path, Weekly, Analytics, Contractor Comms
- **Contractor share links** — JWT-token read-only plot views for subcontractors, no login
- **Push notifications** — web-push for deliveries, overdue jobs, sign-off requests
- **Dev Mode Date override** — cookie-based "pretend today is X" for testing time-sensitive flows

---

## 4. SYSTEM LOGIC & RULES

### 4.1 Cascade engine — authoritative spec in `docs/cascade-spec.md`

Single source of truth: **`src/lib/cascade.ts`** (function `calculateCascade`). Everything shifts dates by calling this lib — no ad-hoc date math anywhere else.

Key invariants (all enforced by 59 assertions in `scripts/test-cascade.ts`):

- **I1 Calendar-day shift per job**: `Δ` applied equally to `startDate` and `endDate` — duration preserved.
- **I2 Working-day alignment**: every `startDate` and `endDate` lands Mon–Fri. Snap forward/back consistently.
- **I3 Orders ride with their job**: `dateOfOrder` + `expectedDeliveryDate` shift by the same working-day `Δ`. Gap (lead time) preserved.
- **I4 Completed jobs and delivered/cancelled orders are immovable** — never touched by cascade.
- **I5 Downstream scope**: same plot, sortOrder > trigger. For pull-forward, also includes stage siblings `startDate >= trigger.startDate`.
- **I6 Parent rollup**: `parent.startDate = min(children.startDate)`, `parent.endDate = max(children.endDate)`.
- **I7 No silent clamp to today** — if a shift would put anything in the past, engine returns a `CascadeConflict` (HTTP 409); caller decides whether to force.
- **I8 Sort order preserved**: no job overtakes its successor.
- **I9 originalStartDate / originalEndDate immutability**: set once on first move, never updated again.

Actions that shift dates (all ultimately call `calculateCascade`):

- **Pull forward** (pre-start dialog) — if order's `dateOfOrder` is on/before today's snapped working day, pull-forward is a no-op and UI shows a grey "Already perfectly timed" chip instead of the purple button.
- **Expand** — start now, keep end date (this job only stretches; downstream unchanged).
- **Late push** — shift programme forward (downstream cascades).
- **Late compress** — start now, keep end date (same as expand semantically).
- **Late backdate** — record original start as `actualStartDate`, no cascade.
- **Complete early/late** — `PostCompletionDialog` offers cascade.
- **Delay job** (`/api/jobs/[id]/delay`) — push by N working days with reason (weather rain/temperature/other).
- **Bulk delay** (`/api/sites/[id]/bulk-delay`) — per-plot delay loop.
- **Manual date edit** (`/api/jobs/[id]` PUT) — no cascade (A13: explicit single-job edit).
- **Cascade preview** (POST) vs **apply** (PUT) on `/api/jobs/[id]/cascade`.

### 4.2 Order lifecycle

`PENDING → ORDERED → DELIVERED (+ CANCELLED at any point)`

| Trigger | PENDING → | ORDERED → | Notes |
|---|---|---|---|
| Job start (normal) | ORDERED | no change | Auto-progression on start |
| Job start ("start anyway") | stays PENDING | no change | `skipOrderProgression: true` |
| Job sign-off | no change | DELIVERED | Sign-off = materials confirmed on site |
| "Mark Sent" button | ORDERED | n/a | Now records `dateOfOrder = today` |
| "On Site" button | DELIVERED | DELIVERED | via PUT `/api/orders/[id]` |
| Cascade | dates shift only | dates shift only | Status never changes |

Views that consume order status: Cash Flow, Budget, Supplier Performance, Analytics, Daily Brief, Plot Todo List, Programme, Contractor share page.

### 4.3 Job lifecycle

`NOT_STARTED → IN_PROGRESS → COMPLETED → (signedOffAt set)`. `ON_HOLD` at any time.

- **complete** sets `actualEndDate` + triggers `PostCompletionDialog`.
- **signoff** is a separate action — sets `signedOffAt`, `signedOffById`, auto-progresses remaining `ORDERED` orders to `DELIVERED`.
- Auto-reorder on start: if `existing.stageCode` is set, server looks up matching `templateJob.orders` and creates draft `PENDING` orders for any supplier not already covered. Batched as a single `findMany` + `Promise.all` creates.

### 4.4 Pre-start flow (`useJobAction` hook)

**Every** start button anywhere in the app routes through `triggerAction(job, "start")` from `useJobAction`. The hook auto-fetches orders if the caller didn't supply them.

Flow: predecessor check (by date not sortOrder) → order warning dialog (if undelivered orders) → early-start dialog (if days early > 0, working days) → late-start dialog (if late) → execute.

Working-day math throughout. Days early/late measured by `differenceInWorkingDays(planned, todayForward)`. `todayForward = isWorkingDay(today) ? today : snapToWorkingDay(today, "forward")`.

### 4.5 Dev mode date override

- Cookie `dev-date-override` (ISO date). When set, `getCurrentDate()` returns that date with today's real time-of-day.
- Server equivalent: `getServerCurrentDate(req)`.
- **For render**: always use `getCurrentDateAtMidnight()` to avoid React hydration mismatch (#418) — SSR and client render can be a few ms apart, which fails identity check on formatted dates otherwise.

### 4.6 Authentication + JWT stale-session handling

- `auth()` is wrapped (in `src/lib/auth.ts`) to return `null` when the JWT references a user that no longer exists in the DB. Prevents FK violations on every subsequent audit-log write.
- JWT callback calls `prisma.user.findUnique` on refresh. If the user is gone, `token.invalidated = true` and session callback flags it so the wrapped `auth()` returns null.

### 4.7 Error handling pattern (client)

Shared infra (all live):

- `src/components/ui/toast.tsx` — `ToastProvider` mounted in root layout; `useToast()` returns `{ error, success, info }`; `fetchErrorMessage(res, fallback)` parses `{ error }` from Response body.
- `src/lib/api-errors.ts` — `apiError(err, fallback)` helper for API routes. Maps Prisma P2002/P2003/P2025/validation codes to friendly strings.

All ~50 mutation API routes are wrapped with `try { ... } catch (err) { return apiError(err, "Failed to X"); }`. Error responses include `{ error: "Failed to X: unique constraint violation (P2002)" }` so clients can show the actual cause.

All ~78 client mutation handlers use `if (!res.ok) { toast.error(await fetchErrorMessage(res, "Failed to X")); return; }`. Reports render an inline red "Failed to load — Retry" banner instead of silent empty states.

### 4.8 Performance

- N+1 patterns removed from cascade/delay/bulk-delay routes — parent lookups now read from the already-loaded `jobMap` instead of per-job `findUnique`.
- Auto-reorder in `/api/jobs/[id]/actions` batched: single `findMany` for existing orders + `Promise.all` creates.

---

## 5. EDGE CASES & RISKS

### Things that have bitten us (do not regress)

1. **Pull forward no-op**: when today's snapped working day equals the order's existing `dateOfOrder`, shift is 0 and previously the purple button was clickable but did nothing. Now UI branches on `deltaWDPreview === 0` at render time and shows a grey "Already perfectly timed" chip instead.
2. **Silent failures**: a PUT that 500s previously only `console.error`'d — user saw no feedback. Fixed via the toast infra; verify future additions follow the pattern.
3. **Hydration mismatch #418**: caused by `getCurrentDate()` (millisecond-precise `new Date()`) differing between SSR and first client render. Fixed with `getCurrentDateAtMidnight()`. Any new render-time use of `new Date()` or `Date.now()` needs this treatment.
4. **FK violation on every mutation** after a DB reseed: stale JWT with a deleted user ID tried to write `userId` into EventLog. Fixed in `auth.ts` wrapper (section 4.6). If a user is wiped, they now get a 401 → redirect-to-login.
5. **Calendar-day vs working-day drift**: the first cascade rewrite mixed units. Every date shift is now working days only (see `src/lib/working-days.ts`). Duration preserved by applying same delta to start + end.
6. **10MB file-size limit** was blocking legitimate construction PDFs. Bumped to 50MB on both document routes. If someone tries larger, error now says actual size + limit.

### Known risky spots worth flagging to the next agent

- `/api/jobs/[id]` PUT (manual date edit) does NOT cascade by design (spec A13). If someone changes both start and end with different deltas, the programme can diverge. Keith hasn't asked for this to change.
- `PostCompletionDialog`'s `markOrderDelivered` helper does a fire-and-forget PUT. Wrap if surfacing errors becomes important.
- `bulk-status` endpoint `/api/orders/bulk-status` exists but no client uses it. Delete or adopt.
- `SiteWalkthrough`'s cascade preview uses `useJobAction().previewCascade` now (post-Batch 1), but other surfaces in the walkthrough still do some direct mutations — Batch 1 migration agent is currently running to finish these.

### Prisma pool exhaustion risk

Any new endpoint that does `Promise.all` over per-plot or per-job queries must stay ≤ 3 concurrent. Batched patterns: fetch all data first with `findMany`, build in-memory maps, then write in parallel (writes don't hit the pool as hard).

---

## 6. CURRENT BUILD STATE (Apr 2026 session update)

Everything below is live on `main`. TypeScript clean, 59/59 cascade tests pass, schema migrated on Supabase.

### Canonical hooks (the "one source of truth" stack)

Every action flows through one of these — never duplicate. Before adding any button in a screen, check if a hook already handles it.

| Concept | Hook | File |
|---|---|---|
| Job lifecycle (start / stop / complete / signoff) + pre-start dialogs | `useJobAction` | `src/hooks/useJobAction.tsx` |
| Delay a job (dual input: days OR new-end-date + reason picker + weather auto-suggestion) | `useDelayJob` | `src/hooks/useDelayJob.tsx` |
| Pull a job forward (4 options: today / next Monday / keep / pick; constraint-aware picker) | `usePullForwardDecision` | `src/hooks/usePullForwardDecision.tsx` |
| Order status PENDING → ORDERED → DELIVERED → CANCELLED | `useOrderStatus` | `src/hooks/useOrderStatus.ts` |
| Snag status chip changes (no photo) | `useSnagAction` | `src/hooks/useSnagAction.ts` |
| Contractor assignment (single OR multi-select modes) | `useJobContractorPicker` | `src/hooks/useJobContractorPicker.tsx` |
| Destructive confirms (Delete X) | `useConfirmAction` | `src/hooks/useConfirmAction.tsx` |
| Copy-to-clipboard with keyed feedback | `useCopyToClipboard` | `src/hooks/useCopyToClipboard.ts` |
| Plot creation (4 paths: blank / template / batch-from-template / chunked-blank-batch) | `usePlotCreation` | `src/hooks/usePlotCreation.ts` |
| Inline note on a job | `useAddNote` | `src/hooks/useAddNote.tsx` |
| Order email (send or chase, rich table template) | `useOrderEmail` | `src/hooks/useOrderEmail.tsx` — uses `buildOrderEmailBody` from `src/lib/order-email.ts` |

### Shared UI components

| Purpose | Component | File |
|---|---|---|
| Job / order / snag status badges + snag priority | `JobStatusBadge`, `OrderStatusBadge`, `SnagStatusBadge`, `SnagPriorityBadge` | `src/components/shared/StatusBadge.tsx` |
| "Failed to load — Retry" banner on reports | `ReportErrorBanner` | `src/components/shared/ReportErrorBanner.tsx` |
| Quick photo upload on jobs/snags | `InlinePhotoCapture` | `src/components/shared/InlinePhotoCapture.tsx` |
| Explanation popover (? icon → expanded panel) | `HelpTip` | `src/components/shared/HelpTip.tsx` |
| Full snag form | `SnagDialog` | `src/components/snags/SnagDialog.tsx` — canonical surface; close-with-photo still routes here |

### Templates (schema + UX)

- **`TemplateJob.durationDays`** (new column) — optional days-granularity override. Wins over `durationWeeks` at apply-template time via `computeJobEndDate()` in `src/lib/apply-template-helpers.ts`.
- **`Plot.sourceTemplateId`** (new column) — informational link back to the source template. No auto-sync. Lets TemplateEditor show a "snapshot-model" banner when plots exist that used this template.
- **Parent TemplateJob dates are normalised on every read** — `normaliseTemplateParentDates()` in `src/lib/template-includes.ts` overwrites parent `startWeek`/`endWeek`/`durationWeeks` with min/max of children. Wired into every template GET/PUT route.
- **TemplateEditor UX**:
  - Drag-to-reorder stages (HTML5 native drag)
  - "+" icon on every flat job AND every child row to add a sub-job (supports 3+ level hierarchies; model is recursive, render is 2-deep)
  - Add Sub-Job dialog has **Weeks / Days toggle**
  - Edit Job dialog has **Duration in days (optional)** override
  - Split dialog asks where existing orders go when splitting a flat job into sub-jobs
  - Snapshot-model banner when `_count.sourcedPlots > 0`
- **Apply-template endpoints** reject empty-jobs templates with a 400.

### Programme / Gantt

- **Overlay mode** renders two rows per plot (Current + Original) with a dashed divider + "now" / "was" labels in the plot-metadata column. Replaces an illegible 4px ghost strip.
- **Partial-week fills** — day-granularity sub-jobs render as a fractional-width bar in Week view (e.g. a 3-day job = 60% of the cell). Day view is per-day and unaffected.
- **Pull Forward button** on every non-completed job in JobWeekPanel + Walkthrough.
- **Delay Job button** paired with Pull Forward everywhere.
- **Predecessor detection** ignores parent aggregates (a stage with children whose dates span the whole stage isn't a valid predecessor).

### Contractor Comms

- **Mini Programme** at the top of each contractor card — rows = plots, columns = 12 weekly slots, bars = their jobs placed by date. Green = live, blue = upcoming, red vertical line = today.
- Existing sections (Live Jobs / Coming Up / Open Snags / Drawings / Orders & Deliveries) still present as collapsible details below.
- Share-page generates permanent tokens via `/api/sites/:id/contractor-comms/share` — link emails use `useCopyToClipboard`.

### Post-completion flow

- After sign-off, a **toast with "Review next steps" button** appears instead of auto-opening `PostCompletionDialog`. Site manager chooses to engage.
- PostCompletionDialog decision buttons show **explicit dates** ("Start today (Wed 19 Apr)" / "Start Monday 20 Apr") — never ambiguous.
- Same flow in DailySiteBrief, SiteWalkthrough, and (partially) JobWeekPanel.

### Delay job flow

- Weather auto-suggestion: `useDelayJob` fetches rain/temperature logs for the job's period on open and pre-selects the reason.
- Four surfaces (DailyBrief, Walkthrough, TasksClient, JobWeekPanel, JobsClient) use the same dialog — two input modes (days or date), reason picker, live preview of new dates.

### Order email (Apr 2026 unified — migration complete)

- **One template** now — `buildOrderEmailBody` in `src/lib/order-email.ts` (rich: account number, site address, items table with unit costs, subtotals, per-plot totals).
- `useOrderEmail` refactored to call `buildOrderEmailBody` internally. Subject: `Material Order — {job} — {site}{(N plots)}`. Chase mode adds "URGENT" banner and overdue-days context.
- `/api/tasks` response enriched with `supplier.accountNumber`, `site.address/postcode`, `plot.plotNumber`, `orderItems.unitCost` so TasksClient passes rich data.
- **All UI callers migrated** — DailyBrief, OrderDetailSheet, PlotTodoList, TasksClient, **SiteOrders** all use `useOrderEmail` hook. No remaining direct `buildOrderMailto` call sites in UI.
- One non-UI remnant: `useJobAction.tsx` still calls `buildOrderMailto` directly inside its internal "Send order" button (the pre-start order-warning dialog). This is inside the canonical job-action hook, not a duplicated UI template, so it's defensible — but worth revisiting if `useOrderEmail` ever gains a state-less "build mailto only" export.

### Interaction rules banked to memory

`~/.claude/projects/.../memory/feedback_core_flows.md` now enshrines:

1. Every question ends with one recommended option marked ⭐.
2. Use multiple-choice dialog format for decisions — Keith whips through "a, a, a, a".
3. Test in Keith's browser before pushing — Claude_in_Chrome tools.
4. Button clickability is a permanent review item (5-point checklist).
5. Wording must be crisp; use `<HelpTip>` for long context.
6. Keith's 4-stage framework for audits: Setup → Creation → Management → Analytics.

### Repo state

- Latest commits (most recent first, post-launch session):
  - `2f898f2` feat(orders): after save, offer to add items to supplier pricelist
  - `04801ee` fix(HelpTip): bigger icon + no longer overlaps the Dialog close X
  - `4a41bd4` fix(uploads): lift template drawing cap 50MB → 500MB
  - `9eecac1` feat(template-timeline): Weeks / Days toggle
  - `d0d0e7f` fix(template-orders): preview weeks now skip Week 0 (industry convention)
  - `5dfddd6` feat(template-orders): clearer preview + lead-time only in Arrive mode
  - `9ba00fc` feat(template-editor): jobs calculated from sub-jobs, atomic toggle, sub-job D&D, drop Start/End Week
  - `8d6ad53` fix(cascade-client): the OTHER toISOString — multiline version missed
  - `3b253cf` chore(script): recompute-plot-dates — repair bad existing plot dates (1270 leaf + 549 parent)
  - `8722872` fix(cascade-client): toISOString() bug sent yesterday's date to server
  - `7562f28` fix(cascade): parents derived from children, not independently shifted
  - `b8f8b88` fix(early-start): timezone bug + consolidate pull-forward section
  - `0579609` feat(early-start): working-day label + preflight + custom date picker
  - `5bbfcbf` fix(daily-brief): alerts + pills were doing nothing on click
  - `61afa31` fix(qa): FormData upload + JobWeekPanel stop dialog
  - `57f4f24` fix(mobile+print): walkthrough + report controls
  - `e2b1821` fix(uploads): signed URLs to bypass Vercel 4.5MB body cap
  - `6ac3961` feat(stage-dialog): inline errors + per-sub-job days/weeks toggle
  - `83bd56b` feat(site-wizard): custom plot numbers + mixed range input
  - `47a034d` fix(orders): PENDING→DELIVERED silently 400'd — auto-bridge instead
  - (See full list in section 0.0 above — 35 post-launch commits)

- **No in-flight background agents.** All committed work is visible in `git log`.

### New hooks added this session

- **`useReviewSupplierMaterials`** — after-order-save dialog: diffs items against supplier pricelist, lets user choose add-new / update-existing / add-as-variant / skip per item. Wired into TemplateEditor + SiteQuantsClient.

### New scripts added this session

- `scripts/seed-launch-sites.ts` — idempotent launch seeder
- `scripts/migrate-subjob-duration-to-days.ts` — one-off sub-job weeks→days
- `scripts/recompute-plot-dates.ts` — repair bad plot dates (dry-run / --apply)

---

## 7. KNOWN ISSUES / BUGS / DEFERRED WORK (Apr 2026 snapshot)

### Active

None blocking. 59/59 cascade tests pass, TypeScript clean. Schema in sync with Supabase. Live site deploys cleanly on `main`.

### Deferred Items — Full Table (every parked item, why it's parked, next concrete action)

These are the items that came up during the Apr 2026 session and were explicitly deferred rather than done. Order roughly by how much value vs. effort each represents.

| # | Item | Why deferred | Next concrete action | Scope |
|---|---|---|---|---|
| 1 | ~~**Unlimited hierarchy depth — render**~~ | **RESOLVED Apr 2026** — extracted the inline child-row JSX into a recursive `renderSubJobNode(child, depth)` helper inside `TemplateEditor.tsx`. Each node checks `child.children?.length` and recursively renders grandchildren with left-padding + border rule. Level labels ("level 3", "level 4") appear for depth > 1 so the tree is visually obvious. | — | — |
| 2 | ~~**Analytics reconciliation audit**~~ | **RESOLVED Apr 2026** — `scripts/audit-analytics-vs-brief.ts` compared Brief-style where-counts vs Analytics-style findMany+filter counts for 6 metrics across 12 sites. All 72 comparisons matched exactly. Any user-visible drift is UI-layer rendering, not query-layer. Script kept for re-run on demand. | — | — |
| 3 | **Batch 2 photo-coupled flows (6 surfaces)** | Awaiting Keith's hands-on test. Test plan shipped as `docs/batch2-photo-flows-test-plan.md` — step-by-step instructions, DevTools observation points, red flags. Once Keith runs through it with real photo files and flags any issues, the migration to unified `useSnagAction` + `InlinePhotoCapture` can proceed with confidence. | Keith runs the test plan → Claude migrates based on findings. | M |
| 4 | ~~**Contractor Comms — day-sheets tab**~~ | **RESOLVED Apr 2026** — Keith answered Q1=c (inline view + printable PDF). Shipped as new "Day Sheets (this week)" collapsible section on every ContractorCard: Mon-Sun rows with jobs active each day, weekend marked, "Print / PDF" button uses `window.print()` with existing `print:*` classes. | — | — |
| 5 | ~~**Contractor Comms — messages log tab**~~ | **RESOLVED Apr 2026** — Keith answered Q2=b (reuse EventLog / existing logging). Shipped as "Messages Log" section with localStorage-backed rolling 20-entry timeline. Currently logs the Send-Link action; future contractor-comms actions should append to the same log via the `useLastShareSent.markSent` hook or similar. | — | — |
| 6 | ~~**Contractor Comms — RAMS / method-statement upload per contractor**~~ | **RESOLVED Apr 2026** — shipped end-to-end. Schema: added `contactId` + back-relation to SiteDocument, made siteId optional so the same model handles site-scoped AND contractor-scoped docs. Endpoint: `POST/GET /api/contacts/[id]/documents` (any file type, any size per Keith Q3=b). UI: new collapsible "RAMS / Method Statements" section per ContractorCard with lazy-load + upload + delete. Visible on contractor share link via a new "Your Documents" section on `/contractor/:token`. | — | — |
| 7 | ~~**Contractor Comms — snags-assigned-to-me tab**~~ | **RESOLVED Apr 2026** — on inspection, the existing "Open Snags" section on each ContractorCard already filters snags by contractor (the API's `openSnags` field is per-contractor). Renamed to "Snags Assigned ({count})" for clarity. No new code needed. | — | — |
| 8 | ~~**Critical Path Report legend**~~ | **RESOLVED Apr 2026** — top-level legend added above the plot cards: 6 entries (Critical path, In progress, Completed, On hold, Not started, Weather-affected). Replaces the old per-plot-card inline legend that was hidden until expansion. | — | — |
| 9 | ~~**Export buttons standardisation**~~ | **RESOLVED Apr 2026** — Keith answered Q4=c (PDF + Excel on every report). Shipped shared `ReportExportButtons` component in `src/components/shared/ReportExportButtons.tsx` — uses `window.print()` for PDF (respects `print:*` classes) and SheetJS `xlsx` for Excel. Wired into BudgetReport, DelayReport, CashFlowReport, CriticalPath, WeeklySiteReport. Other surfaces (Analytics, Daily Brief) can drop in the same component when reviewed. | — | — |
| 10 | ~~**Report → Job drill-through navigation**~~ | **RESOLVED Apr 2026** — CriticalPath, BudgetReport, DelayReport all now wrap job rows in `<Link href="/jobs/:id">`. WeeklySiteReport already had it. CashFlowReport is intentionally not drilled-through (aggregated by month, no per-job target). | — | — |
| 11 | ~~**Performance audit**~~ | **RESOLVED Apr 2026** — `scripts/audit-performance.ts` times 12 representative Prisma queries against the prod DB, 3x median. Root cause found: schema had ONLY ONE `@@index` declaration, so every FK lookup (`plot.siteId`, `job.plotId`, `order.jobId`, etc.) was a sequential scan. Added 19 hot-path indexes and pushed via session pooler. Result: all 12 queries now under 500ms median. Biggest wins — Programme 728→476ms (-35%), Daily Brief upcoming 559→332ms (-41%), Analytics 608→374ms (-38%), Site Orders 541→346ms (-36%), Tasks 605→443ms (-27%). Script + `scripts/list-db-indexes.ts` kept for periodic re-run as DB grows. | — | — |
| 12 | ~~**Walkthrough Modal → BottomSheetDialog unification**~~ | **RESOLVED Apr 2026** — Keith answered: Walkthrough UX is intentionally different ("app within an app") and the visual shell should stay. What mattered was whether it's *linked up* to the rest of the data/flow. Audit + fix: migrated the last two drift points (handleSignOff and handleAddNote's direct `/api/jobs/:id/actions` POSTs) to `runSimpleAction` on `useJobAction`. Walkthrough now uses the same hooks as Daily Brief / Tasks / JobsClient for every mutation. Modal visual shell kept as-is. | — | — |
| 13 | ~~**Supplier vs Contractor data-model dedup check**~~ | **RESOLVED Apr 2026** — read-only audit (`scripts/audit-contact-dedup.ts`) ran against prod: 26 contacts, zero duplicate emails, zero duplicate phones, zero cross-type name collisions. DB `type: ContactType` enum enforces one-of at insert. No action needed. Keep the script for periodic re-checks. | — | — |
| 14 | ~~**Template orders anchor UI polish**~~ | **RESOLVED Apr 2026** — `<HelpTip>` added to the Timing row in the Add/Edit Order dialog (`TemplateEditor.tsx`). Explains Order-vs-Arrive semantics, anchor-relative scheduling, and which job to pick for which material. | — | — |
| 15 | ~~**`/api/orders/bulk-status` orphan endpoint**~~ | **RESOLVED** after handover audit: grep found `TasksClient:320` (`handleMarkGroupSent` POSTs to it for atomic-bulk-ORDERED) and `DailySiteBrief` uses the sibling `/api/sites/[id]/bulk-status` for bulk start/complete. Both endpoints are live and used. Keep. | N/A — resolved. Keep a comment in each endpoint naming its caller for future clarity. | — |
| 16 | ~~**HelpTip rollout — remaining dialogs**~~ | **RESOLVED Apr 2026** — HelpTip added to AddPlotDialog (SiteDetailClient), CreateSiteWizard, TemplateEditor Split dialog, PostCompletionDialog, and Template Orders anchor Timing row. Plus existing rollout to SnagDialog, JobDetailClient sign-off, OrderDetailSheet, ContactsClient. Full coverage. | — | — |

### Intentional Non-Migrations (keep these as-is unless Keith says otherwise)

These look like "deferred migrations" but are actually deliberate design decisions — don't collapse them into the shared hooks just for consistency:

1. **JobDetailClient admin date-edit** — bespoke flow separate from `useDelayJob` because it's an admin correction without a reason (reason is required on delay). Legitimate difference.
2. **PostCompletionDialog's own decision buttons** — not migrated to `usePullForwardDecision` because the orders + contractor guidance steps add value the shared dialog doesn't have. Kept explicit.

### Watch-outs (things that have bitten us)

1. **Vercel bundle cache** — hard-refresh (Ctrl+Shift+R) after pushing if UI looks stale.
2. **Prisma pool cap** — keep `Promise.all` over Prisma to ≤3 concurrent on reads; writes can be higher.
3. **DB schema changes need `npm run db:push`** — Vercel's postinstall only runs `prisma generate`, not `migrate deploy`. Use the session-mode pooler URL for connectivity: `aws-1-eu-west-1.pooler.supabase.com:5432` via `DIRECT_DATABASE_URL` override.
4. **Don't push code that depends on new schema columns before the DB push succeeds** — we hit this once (cascade tests failed with "column does not exist"). Order: push schema first via pooler, verify with `psql`, THEN commit + push code.
5. **`{ not: undefined }` in Prisma** — matches nothing instead of "everything". Always spread-conditional: `...(job.parentId ? { id: { not: job.parentId } } : {})`.
6. **Dev-date mismatch between server and client** — client uses `getCurrentDateAtMidnight()`, server must use `getServerCurrentDate(req)`. Never `new Date()` in API routes that need to honour the dev cookie.
7. **Agent commits bundled with mine** — if a background agent is running and I use `git add -A`, I may pick up its in-progress files. Prefer `git add <specific files>`.

---

## 8. OPEN BACKLOG (Apr 2026) — what to pick up next

Nothing is in flight. All background agents have completed their runs as of commit `4284152`. Pick from this backlog based on what Keith prioritises next, but default order reflects value × readiness.

### Backlog snapshot after Apr 2026 clearing session

**All Priority 1 and Priority 2 items resolved.** Sixteen of seventeen deferred-table items now show as RESOLVED. The only remaining open item is:

- **Row 3 — Batch 2 photo-coupled flows** (6 surfaces). Unblocked only by Keith running the test plan at `docs/batch2-photo-flows-test-plan.md`. Once findings are captured, migration to unified hooks proceeds. No code work until then.

### What Keith could pick up next (new work, not in deferred table)

These aren't deferred items — they're opportunities surfaced during the April session that might be worth raising:

- **Performance follow-up**: the audit script identified 9 queries in the 200-500ms range (the "watch" zone). All under target, but if the DB grows 5-10x, the Programme (476ms) and Tasks (443ms) routes will breach. Could proactively split the deeply-nested includes via the fetch-then-stitch pattern.
- **Contractor Comms follow-ups**: now that the Day Sheets / RAMS / Messages Log sections exist, Keith may want per-contractor analytics (on-time %, overdue count, typical lead time), or a bulk send-link-to-all-contractors button.
- **Hierarchy depth — UX polish**: creation + rendering both support unlimited depth now, but there's no "collapse all sub-jobs by default" affordance. Deep templates could become overwhelming without one.
- **Walkthrough — more Keith ideas**: the April UX sharpening batch (hide-pull-forward-when-greyed etc.) resolved his named items, but plot-card-level info density could still drop further (e.g. relative "2 days ahead/behind" for every sub-job).

### Working method on new work

- **Offer before acting.** Ask Keith multiple-choice for any non-obvious product decision.
- **One item at a time.** Each to completion with browser-test + commit + push + live-verify, then next.
- **If an item grows beyond expectations**, stop and ask multiple-choice before continuing.
- **Keep section 6 commits list + section 7 deferred table in sync** as you go — Keith will check them next session.

---

## 9. IMPORTANT DECISIONS MADE

### Architecture

1. **Working days, always** (for scheduling). Calendar days only used for UI preview of new end dates. Engine math is all working days via `src/lib/working-days.ts`.
2. **Single cascade engine** — all date shifts go through `calculateCascade`. No component or endpoint does ad-hoc date math.
3. **Fail loud, fail specific** — every mutation route wraps in try/catch and returns the real Prisma error code; every client mutation surfaces it via toast. No more silent `console.error`.
4. **Hooks for mutations, components for UI** — `useJobAction`, `useDelayJob`, `useOrderStatus`, `useSnagAction`. UI lives in the caller's component so surface variation is preserved; mutation lives in the hook so logic is one place.
5. **`SnagDialog` is the canonical snag surface** — any close-with-photo flow opens SnagDialog preset. Quick chips (change status without photo) use `useSnagAction`.
6. **50MB file size limit** for documents/drawings (was 10MB — too small for CAD/PDF).

### UX

1. **"Delay" is the single term** for "push a job + downstream forward". Replaces "Push Job Forward", "Push Further", "Delay / Push Job" across all surfaces.
2. **Reason capture on every delay** — Rain / Temperature / Other (+ free text on OTHER). Feeds Delay Report categorisation.
3. **Toast for every success AND every error** on lifecycle actions — never silently mutate.
4. **"Already perfectly timed" chip** replaces a no-op pull-forward button when delta = 0.
5. **Multi-file upload with per-file labels** for all drawing uploads.

### Data integrity

1. **Stale JWT = null session** — wrapped `auth()` rejects tokens whose user no longer exists.
2. **`originalStartDate` / `originalEndDate`** set on first cascade only, never again — preserves the template baseline.
3. **Completed jobs immovable** — I4 invariant; cascade never touches them.
4. **Delivered/cancelled orders immovable** — same reason.

### Testing

- **Cascade tests are the safety net** — 59 assertions in `scripts/test-cascade.ts`. Run before any cascade-adjacent change: `npx tsx scripts/test-cascade.ts`.
- **Typecheck before commit** — `npx tsc --noEmit`.
- **Lint for errors** — `npm run lint` (warnings OK, errors not).

### Process rules from Keith

- **Ask multiple-choice questions** when uncertain, with a recommended option labelled ⭐.
- **Deploy after every change** — `git push` to `main` triggers Vercel auto-deploy; verify in browser.
- **Verify silently** — don't narrate "running tests, checking build". Just do it.
- **One core flow per concept** — no duplicate implementations.
- **Check consuming views after data changes** — if job status logic changes, check every view listed in section 4.2 and 4.3.

---

## 10. FILES TO KNOW

### Core infra
- `src/lib/cascade.ts` — cascade engine
- `src/lib/working-days.ts` — working-day arithmetic
- `src/lib/api-errors.ts` — API error wrapper
- `src/lib/auth.ts` — NextAuth + stale-JWT fix
- `src/lib/dev-date.ts` — date override for dev mode (use `getCurrentDateAtMidnight()` in render)

### Hooks (full list — check here BEFORE adding any new action button)
- `src/hooks/useJobAction.tsx` — job mutations + pre-start dialogs + cascade preview
- `src/hooks/useDelayJob.tsx` — delay dialog with weather auto-suggestion
- `src/hooks/usePullForwardDecision.tsx` — 4-option pull-forward with constraint-aware picker
- `src/hooks/useOrderStatus.ts` — order status transitions
- `src/hooks/useSnagAction.ts` — snag status chip flips
- `src/hooks/useJobContractorPicker.tsx` — contractor assignment (single/multi)
- `src/hooks/useConfirmAction.tsx` — shared destructive-confirm dialog
- `src/hooks/useCopyToClipboard.ts` — keyed copy-feedback
- `src/hooks/usePlotCreation.ts` — 4 plot-creation paths
- `src/hooks/useAddNote.tsx` — inline note dialog
- `src/hooks/useOrderEmail.tsx` — supplier email (send + chase, rich template)
- `src/hooks/useRefreshOnFocus.ts` — refetch on window focus / popstate

### Shared UI
- `src/components/shared/StatusBadge.tsx` — `JobStatusBadge`, `OrderStatusBadge`, `SnagStatusBadge`, `SnagPriorityBadge`
- `src/components/shared/ReportErrorBanner.tsx` — shared "Failed to load — Retry"
- `src/components/shared/InlinePhotoCapture.tsx` — quick photo upload for jobs + snags
- `src/components/shared/HelpTip.tsx` — ? icon + expandable explanation panel
- `src/components/ui/toast.tsx` — `ToastProvider` + `useToast()` + `fetchErrorMessage()` (toast supports optional `action` button)
- `src/components/ui/ClientOnly.tsx` — `useSyncExternalStore` to defer client-only rendering
- `src/components/PostCompletionDialog.tsx` — post-completion cascade choice (not migrated to `usePullForwardDecision` by design — has orders + contractor steps)
- `src/components/snags/SnagDialog.tsx` — canonical snag surface

### Docs
- `docs/cascade-spec.md` — cascade engine contract + action table + invariants + test matrix
- `docs/master-context.md` — this file

### Tests
- `scripts/test-cascade.ts` — 59 assertions over 11 scenarios
- `scripts/test-cascade-e2e.ts` — HTTP-level smoke test (requires dev server)
- `scripts/test-quants.ts` — Quants + drawings + one-off order integration test

---

## 11. SESSION WORKFLOW & HOW KEITH OPERATES (READ ME)

This is the part that makes previous Claude sessions work well vs. badly. Pattern-match on Keith's signals.

### 11.1 How Keith opens a session

Keith typically opens with a short, conversational message — no formal ticket. Examples:
- "right lets crack on"
- "okay so what else can we sort"
- "i've been thinking about the contractor comms…"

He won't restate context. He expects you to read this file + memory + `git log` and know where we are. If you're confused, **ask a multiple-choice question** rather than guess.

### 11.2 How Keith gives direction

- He uses **abbreviated English** with construction vernacular. "Crack on" = proceed. "Fire fire fire" = go. "As you were" = continue what you were doing.
- He often replies to a numbered question list with "a, a, a, a" — you need to have numbered and lettered your options for this to work.
- He **trusts you** to make judgement calls on implementation details. He reserves judgement for UX-visible decisions.
- He gets frustrated by **silent deferrals**. Say if you're going to skip something, and why.
- He gets frustrated by **long reasoning paragraphs** where a 4-option multiple-choice would do.
- He expects **"no stone unturned"** robustness. Shortcuts now = career-ending bug later.

### 11.3 The session rhythm

1. **He opens with a pain or an idea.**
2. **You clarify with multiple-choice questions** (if needed — not always).
3. **You check for existing hooks/components** before writing new code.
4. **You implement silently**, running `tsc` and cascade tests as you go.
5. **You browser-test** via Claude_in_Chrome or Claude_Preview.
6. **You commit and push** with a descriptive message.
7. **You verify live on Vercel** (hard-refresh if the bundle looks stale).
8. **You summarise to Keith** in 3-5 lines. Not an essay.

### 11.4 Multiple-choice question format (critical)

When asking Keith to decide something, format like this:

> **Q: How should the delay reason picker handle weather auto-suggestion when the API is slow?**
> a) Block the dialog until it resolves
> b) Open dialog with placeholder, fill in when ready ⭐
> c) Skip auto-suggestion entirely on slow responses
> d) Show a spinner next to the field

One ⭐ per question on your recommended default. Keith will reply "b" or "b, a, ⭐, d" across several questions.

### 11.5 Browser testing — Claude_in_Chrome & Claude_Preview

Two MCP tools are available:
- **`mcp__Claude_in_Chrome__*`** — real Chrome browser, full interaction, for live-site verification.
- **`mcp__Claude_Preview__*`** — sandbox preview, faster, good for local dev validation.

**Rule:** every UI-visible change gets a browser smoke test before the summary goes back to Keith. The smoke test confirms: (a) the component renders without console errors, (b) the new interaction actually happens on click, (c) no layout regressions.

### 11.6 Silent verification

Keith banked the rule in `feedback_verification_silence.md`: never announce "I'm going to run the tests now" or "let me verify this". Just run the tool. Only speak if it fails or you discover something important.

### 11.7 Deploy-and-test loop

After push:
- **Vercel auto-deploy** kicks off (check with `curl -sI https://sight-manager.vercel.app | grep -i x-vercel` if unsure).
- **Ctrl+Shift+R** in browser to bust bundle cache if needed.
- **Browser-test the exact flow** that just changed.
- **Report result** in 1-2 lines back to Keith.

### 11.8 Deferring — rules

If you're going to defer something, **announce it**. Keith's direct words: "i want a log of everything youve deffered i dont know how many times i need to say it but i want it complete". Every deferral goes in section 7's table with:
- Why deferred (genuine blocker / waiting on decision / out of scope now)
- Next concrete action (so future-you knows exactly what to do)
- Scope estimate (S / M / L)

### 11.9 Parallel agent dispatch

For large mechanical migrations (e.g. "migrate N call sites to the new hook"), you can spawn a background agent via the `Agent` tool with `run_in_background: true`. Rules:
- **Only mechanical work.** Agents are bad at UX decisions.
- **Prime the agent** with everything it needs — it won't see your conversation.
- **Browser-test the agent's output** before trusting its "complete" claim — it may report success based on typecheck alone.
- **One agent at a time** unless work is genuinely independent.

### 11.10 Session ending — the handover checklist

Before a session closes (or before context compacts), do ALL of these:

1. **Git state clean** — `git status` shows nothing. No half-done changes left uncommitted.
2. **Tests green** — `npx tsc --noEmit && npx tsx scripts/test-cascade.ts`.
3. **Live site verified** — last change smoke-tested on Vercel.
4. **This file updated** — `docs/master-context.md`. Specifically:
   - Section 6's "Repo state / Latest commits" list refreshed with `git log --oneline -20`.
   - Section 7's deferred table updated (add new deferrals, remove completed ones).
   - Section 8's Open Backlog reordered if priorities shifted.
   - Any new architectural decisions banked in section 9.
   - Any new "things that bit us" banked in section 7's Watch-outs.
5. **Memory updates** — if an interaction pattern emerged, bank it in `memory/feedback_*.md`.
6. **Session note** — a couple of lines in git log or a comment summarising what shipped + what's next.

### 11.11 Context compaction

Long sessions auto-compact their history. Signs of a recent compaction: a "summary of the earlier conversation" system message and missing code references. If you see this:
- **Re-read this file** immediately — it's the only reliable source for state post-compaction.
- **Re-read the most recent 10-20 git commits** to ground yourself.
- **Don't trust claims about file state** from before compaction — verify with `Read`.

---

## 12. WHAT TO DO IF YOU'RE UNSURE

Ranking by what to do when something is ambiguous:

1. **Read the relevant code** (Grep for the symbol, then Read the file).
2. **Read this doc's relevant section** — you may be forgetting something you already read.
3. **Check `memory/*.md`** for previously-banked guidance.
4. **Run the cascade tests + tsc** silently to sanity-check current state.
5. **Ask Keith a multiple-choice question** — never guess on UX-visible decisions.
6. **Flag it as deferred** if you can't resolve and the rest of the work doesn't depend on it.

When in doubt: **ask rather than assume**. Keith would rather answer a 4-option question than review a wrong implementation.

---

*End of master context. Hand this to the next AI verbatim.*

*Last refresh: Apr 2026 session. Verify against `git log` + `date` before assuming nothing has changed.*
