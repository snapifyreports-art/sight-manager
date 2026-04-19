# Sight Manager — Master Context File

**Purpose:** single hand-off document for continuing this project in a new chat with zero prior context. Read this top-to-bottom before touching code. Cross-check every claim here against the live code before acting on it.

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

### Order email (Apr 2026 unified)

- **One template** now — `buildOrderEmailBody` in `src/lib/order-email.ts` (rich: account number, site address, items table with unit costs, subtotals, per-plot totals).
- `useOrderEmail` refactored to call `buildOrderEmailBody` internally. Subject: `Material Order — {job} — {site}{(N plots)}`. Chase mode adds "URGENT" banner and overdue-days context.
- `/api/tasks` response enriched with `supplier.accountNumber`, `site.address/postcode`, `plot.plotNumber`, `orderItems.unitCost` so TasksClient passes rich data.
- Callers still using `buildOrderMailto` directly (DailyBrief, OrderDetailSheet, PlotTodoList) — migration to the hook is a pure code-aesthetics refactor; templates are already byte-identical. (Background agent is finishing these migrations as of latest commits.)

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
  - `39fc911` Gantt partial-week fills for day-granularity jobs
  - `9311ca1` Contractor Comms mini-Gantt
  - `94576ea` Option A: email templates unified on rich `buildOrderEmailBody`
  - `2bc1427` Add Sub-Job on child rows (3+ level hierarchy)
  - `559ac1e` Days override on Edit-Job dialog
  - `5e7ecf2` Drag-to-reorder stages
  - `1f897b9` JobWeekPanel completion toast + PostCompletion explicit dates
  - `8a90d02` Split dialog order placement
  - `13c2dd1` Schema live: `sourceTemplateId` + `durationDays`
  - `62af91a` Normalise parent TemplateJob dates on every read
  - `72f62bc` Reject empty template apply + ID→name sweep
  - (Many more — see `git log --oneline`)

---

## 7. KNOWN ISSUES / BUGS (Apr 2026 snapshot)

### Active

None blocking. 59/59 cascade tests pass, TypeScript clean. Schema in sync with Supabase.

### Deferred / cosmetic / non-blocking

1. **Templates with >2 hierarchy levels render only 2 levels deep** — creation now supports N levels (recursive `parentId`, Add Sub-Job on child rows); rendering in TemplateEditor is still a 2-deep nested map. Not urgent — no 3+ level templates exist yet.
2. **JobDetailClient admin date-edit** — kept as a bespoke flow (separate from `useDelayJob`) because it's an admin correction without a reason. Legitimate difference, not a regression.
3. **PostCompletionDialog body** still has its own decision buttons (not migrated to `usePullForwardDecision`) — the orders + contractor guidance steps add value the shared dialog doesn't have. Decision kept explicit.
4. **DailyBrief / OrderDetailSheet / PlotTodoList** still call `buildOrderMailto` directly. Migration to `useOrderEmail` hook is in progress (bg agent). Templates are already identical — pure code-aesthetics refactor.
5. **Batch 2 agent skipped 6 photo-coupled flows** (SnagDialog close-with-photo, DailyBrief snag photo close, SnagList handleConfirmClose, ContractorComms/Walkthrough/SnagSignOffCard photo uploads). Needs a focused session with live photo-upload testing.
6. **`bulk-status` orphan endpoint** — `/api/orders/bulk-status` still has no user-facing caller (TasksClient's mark-sent POSTs to it via handleMarkGroupSent but the migration note said to keep this path since it's atomic-different-semantics). Either adopt or delete.

### Watch-outs

1. **Vercel bundle cache** — hard-refresh (Ctrl+Shift+R) after pushing if UI looks stale.
2. **Prisma pool cap** — keep `Promise.all` over Prisma to ≤3 concurrent.
3. **DB schema changes need `npm run db:push`** — Vercel's postinstall only runs `prisma generate`, not `migrate deploy`. Use the session-mode pooler URL for connectivity: `aws-1-eu-west-1.pooler.supabase.com:5432`.

---

## 8. NEXT PRIORITIES (Apr 2026)

**In flight right now:**

- Background agent (agentId recorded in session log) migrating DailyBrief + OrderDetailSheet + PlotTodoList to `useOrderEmail` hook, plus HelpTip rollout to SnagDialog / JobDetailClient sign-off / OrderDetailSheet / ContactsClient. Commits landing autonomously.

**Product priorities Keith named:**

1. **Contractor Comms expansion** — Mini Programme shipped. Next: day-sheets tab, messages log, RAMS/method-statements upload per contractor, snags-assigned tab separate from general snags.
2. **Analytics reconciliation audit** — confirm Daily Brief counts match Analytics dashboard (read-only audit first, fix after).
3. **Critical Path Report legend** — Keith flagged missing.
4. **Export buttons standardisation** — some reports have PDF, some Excel, some missing.
5. **Report → Job drill-through** — reports currently dead-end browsing.
6. **Performance audit** — profile N+1 and slow endpoints. Earlier fixes (batched findMany + in-memory maps) helped but no profiler run has been done.

**Rollout still to do:**

- **HelpTip** to more dialogs (snag, order detail, contact edit, add plot, etc.) — partial via bg agent.
- **Unified Modal vs Dialog** — Walkthrough still has bespoke mobile-first Modal; either share it as BottomSheetDialog or migrate to Dialog.
- **Supplier vs Contractor data-model** — both are Contacts with a type. Verify no duplicate-record drift.
- **Template orders anchor UI polish** — anchor fields work but UI is power-user-level.
- **Unlimited hierarchy depth UI** — creation supports N, render is 2-deep. Recursion needed in TemplateEditor's children map.

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

*End of master context. Hand this to the next AI verbatim.*
