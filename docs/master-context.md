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

## 6. CURRENT BUILD STATE

### Completed (shipped to `main`, live on Vercel)

- **Cascade engine + spec + 59-test harness** — `src/lib/cascade.ts`, `docs/cascade-spec.md`, `scripts/test-cascade.ts`
- **`useJobAction` hook** — `src/hooks/useJobAction.tsx`. Exports:
  - `triggerAction(job, action)` — full pre-start flow
  - `runSimpleAction(jobId, action, opts)` — lightweight mutation (new, Batch 1 infra)
  - `previewCascade(jobId, newEndDate)` — cascade preview (new, Batch 1 infra)
  - `isLoading`, `dialogs` (JSX to render)
- **`useDelayJob` hook** — `src/hooks/useDelayJob.tsx`. `openDelayDialog(job)` + `dialogs`. Dual input (days or date). Reason picker (Rain/Temperature/Other + free text for OTHER). Live preview of new dates.
- **`useOrderStatus` hook** — `src/hooks/useOrderStatus.ts`. `setOrderStatus`, `setManyOrderStatus`, `isPending(id)`, `isBusy`. Records `dateOfOrder=now` on ORDERED and `deliveredDate=now` on DELIVERED.
- **`useSnagAction` hook** — `src/hooks/useSnagAction.ts`. `setSnagStatus`, `requestSignOff`. For inline chips; close-with-photo still goes through `SnagDialog`.
- **50 API mutation routes** wrapped with `apiError()` helper
- **78 client mutation handlers** surface errors via toast
- **16 data-load failures** show inline error + retry banner
- **Stale JWT handling** — `auth.ts` wrapper returns null for deleted-user tokens
- **Hydration fix** — `getCurrentDateAtMidnight` in 6 render sites
- **Mark Sent records `dateOfOrder=today`** — Daily Brief, order resolution
- **Drawing upload: 50MB, multi-file, per-file labels** — 3 components + 2 API routes
- **Delay flow** unified across Daily Brief (3 variants) + SiteWalkthrough — reason capture, working-day math, `/api/jobs/[id]/delay` endpoint
- **Pull-forward "already perfectly timed" chip** when delta = 0
- **50+ API errors** now Prisma-code-mapped to friendly messages
- **Sidebar navigation** with Quants + Drawings under Site Admin

### In progress (at time of writing)

- **Batch 1 migration agent running in background** (agentId `ad278278aa1b74224`)
  - Migrating ~11 files from raw `/api/jobs/[id]/actions` fetches to `useJobAction.runSimpleAction`
  - Migrating 5 custom delay dialogs to `useDelayJob`
  - Migrating Walkthrough cascade preview to `useJobAction.previewCascade`

### Not yet built (queued for Batches 2 & 3)

**Batch 2:**
- Migrate ~12 files from raw order-status fetches to `useOrderStatus`
- Migrate snag close-with-photo flows in 4 modals to open `SnagDialog` instead
- Migrate inline snag-status chips to `useSnagAction`

**Batch 3:**
- `<ReportErrorBanner>` shared component — replace 6 copy-pasted retry banners, retrofit 3 silent reports
- `<InlinePhotoCapture>` shared component — replace 14 inline `FormData` + fetch photo uploads (jobs + snags); fix tag inconsistency
- `<AddPlotForm>` shared component — replace duplicate Add Plot dialogs in `SiteDetailClient` and `CreateSiteWizard`; bring chunked POST (from wizard) to SiteDetailClient

**Deferred / not doing (for now):**
- Renaming "one-off order" to avoid confusion with regular orders — user decided to leave as-is
- Unifying walkthrough cascade UX into `useJobAction` fully — in progress via Batch 1

### Repo state

- Latest commits (most recent first):
  - `c85a0c9` Batch 1 infra (useJobAction extension + useDelayJob hook)
  - `4d62830` Walkthrough delay unify + drawing uploads 50MB/multi-file
  - `8b43bb2` Push Job Forward → Delay Job rework
  - `b043b68` Pull-forward button 0-delta fix
  - `509ebae` N+1 perf + hydration fix + Mark Sent records today
  - `da562b7` 78 client mutation silent-failures fixed
  - `d037d16` JWT stale-session fix
  - `845afd4` 50 API routes wrapped with apiError
  - `d345181` Cascade engine rewrite (59/59 tests pass)

---

## 7. KNOWN ISSUES / BUGS

### Active

None critical as of commit `c85a0c9`. Cascade 59/59 passes, typecheck clean, lint 0 errors (121 warnings, all pre-existing unused-import noise).

### Latent / to watch

1. **Some Batch 1 migrations may still be landing** — the migration agent is running. Verify its output before saying "unification complete".
2. **`note`/`notes` keyname drift** in raw fetches — Batch 1 agent is fixing this but raw sites in JobsClient, TasksClient, ContractorDaySheets, SiteCalendar may still be passing `{ note }` (API accepts `{ notes }`). Grep for `"note":` in fetch bodies.
3. **Bundle caching after deploy** — Vercel sometimes serves stale bundles; hard-refresh (Ctrl+Shift+R) to get latest after pushing.
4. **`bulk-status` orphan endpoint** — `/api/orders/bulk-status` has no client. Dead or secretly used.
5. **Walkthrough still has its own `cascadePreview` state** — post-Batch 1 this should be removed; verify.
6. **lint: 121 warnings of unused imports/vars** — not blocking but noisy. An earlier audit flagged 10 as "assigned but never used" that represent actual dead features (DailyBrief cascade flow, SiteProgramme cell order-dots, contractor-share expiry notice); these are documented for later decision.

---

## 8. NEXT PRIORITIES

**Immediate (finish what's in flight):**

1. **Wait for Batch 1 migration agent** to complete, verify tsc clean + tests pass, commit + push.
2. **Batch 2**: Migrate 12 files to `useOrderStatus`, migrate snag close flows to `SnagDialog`, migrate inline snag chips to `useSnagAction`. Ship + push.
3. **Batch 3**: Build `<ReportErrorBanner>`, `<InlinePhotoCapture>`, `<AddPlotForm>`. Migrate consumers. Ship + push.

**Follow-up audit items:**

- Delete or adopt `/api/orders/bulk-status` endpoint.
- Re-audit the 121 lint warnings — separate "truly dead" from "feature built but not wired up" and act on the second category.
- End-to-end E2E tests via browser-based MCP (Claude_in_Chrome) for the unified flows — browser tests have been flaky during development.

**Product priorities from Keith (in backlog, not yet promised):**

- More comprehensive contractor comms (reason for unifying delay — the delay report needs to categorise by weather/contractor/material, feeding back into contractor performance metrics).
- Walkthrough enhancements — already a primary mobile surface, deserves more unified UX with Daily Brief.
- Dev Mode improvements — let Keith simulate multi-week build-outs deterministically.

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

### Hooks
- `src/hooks/useJobAction.tsx` — job mutation + pre-start dialogs + cascade preview
- `src/hooks/useDelayJob.tsx` — shared delay dialog (days or date input, reason capture)
- `src/hooks/useOrderStatus.ts` — order status transitions
- `src/hooks/useSnagAction.ts` — snag status flip + request sign-off
- `src/hooks/useRefreshOnFocus.ts` — refetch on window focus / popstate (uses refs initialised to 0 to avoid purity warnings)

### Shared UI
- `src/components/ui/toast.tsx` — `ToastProvider` + `useToast()` + `fetchErrorMessage()`
- `src/components/ui/ClientOnly.tsx` — uses `useSyncExternalStore` to defer client-only rendering
- `src/components/PostCompletionDialog.tsx` — post-completion cascade choice

### Docs
- `docs/cascade-spec.md` — cascade engine contract + action table + invariants + test matrix
- `docs/master-context.md` — this file

### Tests
- `scripts/test-cascade.ts` — 59 assertions over 11 scenarios
- `scripts/test-cascade-e2e.ts` — HTTP-level smoke test (requires dev server)
- `scripts/test-quants.ts` — Quants + drawings + one-off order integration test

---

*End of master context. Hand this to the next AI verbatim.*
