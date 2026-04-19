# Sight Manager — Master Context File

**Purpose:** single hand-off document for continuing this project in a new chat with zero prior context. Read this top-to-bottom before touching code. Cross-check every claim here against the live code before acting on it.

---

## 0.0 STATE-OF-PLAY — LATE APR 2026 SESSION (GO-LIVE TOMORROW)

**Read this section first. Everything below it is historical; this is right now.**

### What Keith is doing
Going live with the app tomorrow (20 Apr 2026 in dev-date terms). He's actively stress-testing — clicking through, spotting bugs, demanding fixes. He is frustrated with me for missing UX bugs that a proper browser test would have caught. He is right. "tsc passing ≠ UX passing" is the lesson.

### What's shipped in this session (most recent first)
```
135fddc  fix(budget): render availableTemplates section (was loaded, not shown)
b3bcd05  fix(daily-brief): show ALL pills incl. missing ones; 0-values dimmed
a4d52c2  fix(site-header): hide Raise Snag button when already on Snags tab
4efa45c  fix(email-dialog): wider on desktop, scrollable body, footer pinned
e95300d  Tasks → Daily Brief merge (Keith Q1=b)
fbeb6ec  Send Orders grouping: one batch per supplier + dateOfOrder (JIT)
144a216  Contacts → Contractors + Suppliers/Contractors blue/amber + deliveries stacked by day
5f64551  nav: remove duplicated global Daily Brief + Orders entries
8e0e35b  share page parity with Contractor Comms + collapse Mini Programme default
5ac0bc0  UX audit fixes: proper contact page, nav, links, inline priority, clone templates, share-page actions
754076a  RAMS + perf audit (27-41% speedup via indexes) + photo test plan
cd874ad  Contractor Comms tabs (3 of 4 shipped) + report exports + handover update
2c88bfa  walkthrough UX sharpening (Keith's Apr 2026 asks)
e7d0cd8  clearing batch 2: unlimited hierarchy render + report drill-throughs
f2349e4  clearing batch: HelpTips, Walkthrough unification, 2 audits resolved
cd35409  spot-check sweep: fix handover inaccuracies + clear Priority 1 items
fbdee5f  docs: triple-check handover — add Quick Start + Workflow + complete Deferred table
```

### Honest testing state

| Area | State | Notes |
|---|---|---|
| `tsc --noEmit` | ✅ clean | |
| `scripts/test-cascade.ts` | ✅ 59/59 | |
| `npm run lint` | ✅ 0 errors | 126 warnings (unused imports) |
| `npx next build` | ✅ clean (last full run at `4efa45c`) | |
| DB integrity (`scripts/audit-integrity.ts`) | ✅ 13/14 checks clean | 1 soft historical (3 IN_PROGRESS jobs without actualStartDate — pre-existing) |
| Analytics vs Brief reconciliation | ✅ clean (72/72 matches) | |
| Contact dedup | ✅ clean (26 contacts, no dupes) | |
| API endpoints return 200 | ✅ all 27 spot-checked | |
| HTTP perf under 500ms | ⚠️ DB-level yes; HTTP 2–5s on heavy endpoints | Parallelisation of /api/tasks + /api/analytics done; still noisy |
| E2E test harness ran | ✅ 22 PASS / 0 FAIL / 1 WARN (test harness bug, not app) | `scripts/e2e-full-test.ts` — creates QA_E2E site + templates |
| **Full browser click-through of every view** | ❌ **NOT DONE** | Keith has caught multiple bugs I missed. This is the known gap. |

### Known fragile — for tomorrow's go-live

1. **Daily Brief pills** — just fixed (`b3bcd05`). Every pill now always shows, 0-values dimmed. Missing pills added to all 3 rows. If you see a pill row with nothing visible, check that the data field name matches the API.
2. **Budget Report** — just fixed (`135fddc`). `availableTemplates` now renders as "Template Budgets" card. **Pattern: other reports likely have the same bug of API-loaded-but-not-rendered fields. Running sweep now.**
3. **Raise Snag on site header** — just fixed. Was duplicating with the tab's own button. Now hidden when `activeTab === "snags"`.
4. **Email dialog overflow** — just fixed. Previously `sm:max-w-lg` + no max-height → footer off-screen on long bodies. Now `max-h-[90vh]` + internal scroll + `lg:max-w-3xl`.
5. **Tasks / Daily Brief merge** — Tasks page retired, `/tasks` redirects to `/daily-brief`. Sidebar "Daily Brief" entry now points at the global view. DailySiteBrief renders for picked site; TasksClient (relabelled) renders for "All Sites".
6. **Send Orders batching** — per-supplier + per-dateOfOrder (not per-supplier lumped). Each batch is one JIT email.
7. **Contact detail page** — new route at `/contacts/[id]`. Replaces the `?highlight=id` hack. 5 places fixed to link through.
8. **Contractor share page parity** — Mini Programme / Day Sheets / Drawings / RAMS / Messages Log all added.
9. **RAMS upload** — new route per contractor. Schema: `SiteDocument.contactId` was added.

### Session scripts added (keep around, useful for re-runs)

- `scripts/e2e-full-test.ts` — creates a throwaway test site with 2 templates + 3 plots + exercises every action. Re-run any time to regenerate QA fixtures.
- `scripts/audit-performance.ts` — times 12 representative Prisma queries, flags >500ms.
- `scripts/audit-integrity.ts` — 14 DB invariant checks (orphans, rollup, weekend-dates, etc.).
- `scripts/audit-contact-dedup.ts` — Contact email/phone/name collisions.
- `scripts/audit-analytics-vs-brief.ts` — same-metric comparison across Brief vs Analytics.
- `scripts/check-contact-split.ts` — Contact-type-SUPPLIER vs Supplier-table inspection.
- `scripts/list-db-indexes.ts` — lists every `@@index` actually applied.

### Active test site (seeded this session)

- Site: `QA_E2E_TEST__2026-04-19T20-01` (id `cmo66yr69000gph0ohelwq5gy`)
- Template A: `QA_E2E__TPL_A__2026-04-19T20-01` — simple 3-stage build with order on Brickwork
- Template B: `QA_E2E__TPL_B__2026-04-19T20-01` — parent stage Groundworks + 3 sub-jobs
- 3 plots created, every action exercised (start / complete / signoff / delay / pull-forward attempted / note / snag raise+resolve / order PENDING→ORDERED→DELIVERED / doc upload / RAMS upload / photo)
- Invariants checked: I6 rollup ✓, I2 weekend alignment ✓, I4 immovable completed ✓, order state machine ✓

Safe to delete via site-delete UI or `DELETE FROM "Site" WHERE name LIKE 'QA_E2E_TEST__%'`.

### What's NOT done yet — in this session's TODO

- [ ] Exhaustive browser click-through of every view. Keith said "automatically start on B but don't skip corners". This is B.
- [ ] For each view: API-vs-render diff (catch "data loaded, not shown" bugs like the Budget/DailyBrief ones).
- [ ] Click every button, check states (0 / 1 / many / overflow / error).
- [ ] Visual consistency at common breakpoints.

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

- Latest commits (most recent first):
  - `754076a` RAMS + perf audit (27-41% speedup via indexes) + photo test plan
  - `cd874ad` Contractor Comms tabs (Day Sheets + Messages + Snags rename) + report exports + handover update
  - `2c88bfa` walkthrough UX sharpening (6 items: hide Pull Forward when greyed, contractor→comms link, orders popup, quick-note presets, etc.)
  - `e7d0cd8` clearing batch 2: unlimited hierarchy render + report drill-throughs
  - `f2349e4` clearing batch: HelpTips + Walkthrough unification + 2 audits resolved
  - `cd35409` spot-check sweep: fix handover inaccuracies + clear Priority 1 items
  - `fbdee5f` docs: triple-check handover — add Quick Start + Workflow + complete Deferred table
  - `4284152` HelpTip on ContactsClient Add/Edit dialog
  - `d7611f8` HelpTip on OrderDetailSheet explaining order lifecycle
  - `513d1f9` HelpTip on JobDetailClient sign-off dialog
  - `e206661` HelpTip on SnagDialog explaining snag lifecycle
  - `d8ab7ec` Migrate PlotTodoList.tsx to useOrderEmail hook
  - `39fc911` Gantt partial-week fills for day-granularity jobs
  - `c7aeadc` Migrate OrderDetailSheet.tsx to useOrderEmail hook
  - `80751a3` Migrate DailySiteBrief.tsx to useOrderEmail hook
  - `9311ca1` Contractor Comms mini-Gantt (Keith's idea)
  - `94576ea` Option A: email templates unified on rich `buildOrderEmailBody`
  - (Many more — see `git log --oneline`)

- **No in-flight background agents.** The email-migrations + HelpTip rollout agent completed its run (last commit `4284152`). If a new session sees a similar "bg agent running" note, verify via `git log` before assuming anything is still live.

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
