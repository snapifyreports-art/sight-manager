# Bug + Data Integrity Audit — May 2026

QA + SRE pass over the Sight Manager codebase. Focus: SSOT drift, RBAC
gaps, cron correctness, null handling, race conditions, immutable-audit
guarantees, and helper/coverage holes.

Scope of files audited:
- Every `src/lib/*.ts` helper
- Every `src/app/api/**/route.ts` (~120 routes — full sweep of the
  hot mutation paths; spot-check of the lower-risk reports)
- `prisma/schema.prisma`
- `vercel.json`, `vitest.config.ts`
- `scripts/*.ts` (migration / backfill scripts)

Today's date: 2026-05-13.

Severity legend:
- **P0** — Will fail or wrong data on a common path / security hole / cron silently no-ops.
- **P1** — Edge-case bug, SSOT drift waiting to bite, latent correctness risk.
- **P2** — Code smell / cleanup / minor inconsistency.

---

## P0 findings (data wrong, security hole, or crash on a common path)

### P0-1 — `/api/sites/[id]` PUT has no RBAC check at all

- **File:** `src/app/api/sites/[id]/route.ts:65-184`
- **What's wrong:** The PUT handler authenticates the session but does
  zero permission or site-access checking. Any logged-in user — including
  a `CONTRACTOR` role with no `UserSite` row — can:
  - Rename any site
  - Flip site status (e.g. `ACTIVE` → `COMPLETED`, which stamps
    `completedAt`, fires the Story tab closure logic, and excludes the
    site from every active-site cron sweep)
  - Reassign the site to themselves (`assignedToId = self.id`), which
    then auto-creates a `UserSite` grant for them (line 162-167)
  - Cascade `assignedToId` over every job on the site
- **How to trigger:** Log in as any contractor. `curl -X PUT
  /api/sites/<otherSiteId> -d '{"assignedToId":"<self.id>"}'`. You now
  own and can see the site.
- **Fix:** Add `canAccessSite` + a permission check (DELETE already has
  the access check at line 211-220; PUT is missing the equivalent). At
  minimum gate status flips and assignedToId changes behind a
  `MANAGE_USERS`-style permission, since assigning a manager via this
  endpoint silently grants the assignee site access.

### P0-2 — `/api/plots/[id]/snags` POST has no canAccessSite check

- **File:** `src/app/api/plots/[id]/snags/route.ts:46-174`
- **What's wrong:** The POST creates a Snag without verifying the caller
  can access the plot's site. The route fetches `plot.siteId` for
  EventLog purposes (line 72-79) but never feeds it into `canAccessSite`.
  GET on the same file is also unguarded.
- **How to trigger:** Authenticate as a Site Manager assigned to Site A.
  POST to `/api/plots/<plotIdOnSiteB>/snags`. The snag is created, an
  EventLog row is written against Site B, a push is fired to Site B's
  audience.
- **Fix:** Mirror the snag PATCH/DELETE pattern (`/api/snags/[id]/route.ts:43-52`):
  fetch plot.siteId, call `canAccessSite`, 404 (not 403) if denied.

### P0-3 — `/api/sites` POST has no permission guard

- **File:** `src/app/api/sites/route.ts:37-103`
- **What's wrong:** Site creation is open to any authenticated user.
  No role/permission check. The created site auto-grants `UserSite`
  to the caller (line 80-85), so any contractor can spawn sites and
  grant themselves access. The `assignedToId` field is also taken
  from the body without verification — a contractor can name another
  user as the assignee, granting THAT user access too.
- **How to trigger:** `curl -X POST /api/sites -d '{"name":"junk"}'`
  as a contractor. Site appears in their nav and in the system.
- **Fix:** Add `sessionHasPermission(session.user, "EDIT_PROGRAMME")`
  (or a new `CREATE_SITES` permission) as the gate. Validate that any
  passed `assignedToId` exists and has at least SITE_MANAGER role.

### P0-4 — `backfill-lead-time` checks dead role `ADMIN`

- **File:** `src/app/api/orders/backfill-lead-time/route.ts:18-21`
- **What's wrong:** The role gate reads `if (role !== "ADMIN" && role !== "CEO")`.
  `ADMIN` is **not** a value of `UserRole` (the enum has SUPER_ADMIN,
  CEO, DIRECTOR, SITE_MANAGER, CONTRACT_MANAGER, CONTRACTOR — see
  `prisma/schema.prisma:11-24`). Result: only literal-`CEO` accounts
  pass. `SUPER_ADMIN` and `DIRECTOR` are excluded from a destructive
  DB-wide backfill that they obviously should be able to run.
- **How to trigger:** Sign in as DIRECTOR or SUPER_ADMIN, hit POST
  endpoint. 403 Forbidden despite being a higher-privilege role than
  CEO.
- **Fix:** Use `sessionHasPermission(session.user, "MANAGE_USERS")` or
  hard-code the canonical exec roles (`["SUPER_ADMIN", "CEO", "DIRECTOR"]`).
  Search the rest of the codebase for the same "ADMIN" string — this is
  a stale enum reference that may exist elsewhere.

### P0-5 — `/api/users/[id]` and `/api/users/[id]/permissions` use bare `hasPermission`, bypassing SUPER_ADMIN

- **File:** `src/app/api/users/[id]/route.ts:19, 59, 127`,
  `src/app/api/users/[id]/permissions/route.ts:18, 50`,
  `src/app/api/users/route.ts:17, 44`
- **What's wrong:** These routes check `hasPermission(session.user.permissions, "MANAGE_USERS")`
  directly. `hasPermission` is the dumb permission-array predicate
  (`src/lib/permissions.ts:147-153`); it does NOT understand role-based
  bypass for SUPER_ADMIN / CEO / DIRECTOR (only `sessionHasPermission`
  does, see line 160-169). If a SUPER_ADMIN's UserPermission rows
  haven't been seeded (or get deleted), they can't manage users despite
  the role being designed to bypass every gate.
- **How to trigger:** Create a SUPER_ADMIN user with zero UserPermission
  rows. They can navigate the app fine (page-load uses
  `sessionHasPermission`) but every user-management API call returns
  403.
- **Fix:** Replace all six `hasPermission(session.user.permissions, ...)`
  call sites with `sessionHasPermission(session.user, ...)`. The bare
  helper is a footgun — consider deprecating it.

### P0-6 — `auth.ts` callback swallows DB errors and trusts stale tokens

- **File:** `src/lib/auth.ts:50-83`
- **What's wrong:** The `jwt` callback re-validates the user on every
  request. If `prisma.user.findUnique` THROWS, the `catch (line 79-81)`
  silently keeps the old token data ("DB error is non-critical"). That
  means: a user gets deleted, their session keeps working until the
  next successful DB read fires the invalidation. More concerning, if
  permissions or role are revoked via DB, the JWT keeps the old
  permissions during DB outages — an attacker could deliberately
  trigger DB hiccups (e.g. saturate connections) to retain stale
  permissions.
- **How to trigger:** Delete a user's row; their session keeps working
  if the next `findUnique` happens to throw (connection pool
  exhaustion, transient timeout). More commonly: revoke MANAGE_USERS
  permission; the user keeps it cached in their JWT until a clean DB
  read replaces it.
- **Fix:** On DB error, set `token.invalidated = true` (fail closed),
  not fail open. Or accept the risk and document it explicitly with a
  decision marker. The current behaviour contradicts the spirit of
  the wrapped `auth()` at line 106-112 which exists specifically to
  reject stale tokens.

### P0-7 — Reconcile cron `overlapPlots` pass uses raw `new Date()`, ignoring dev-date

- **File:** `src/app/api/cron/reconcile/route.ts:167`
- **What's wrong:** The overlap-reconcile pass computes `todayMidnight`
  with `new Date()` instead of `getServerCurrentDate(req)`. The other
  passes in the same cron route use the real now correctly. Under
  Dev Mode date-override (`dev-date-override` cookie), the cron either
  shifts wrong dates or no-ops when it shouldn't.
- **How to trigger:** Set the dev-date cookie to a future date and
  trigger the cron locally. The plot-percent and parent rollup passes
  honour the override; the overlap pass uses the real current date,
  producing inconsistent state.
- **Fix:** `const todayMidnight = getServerCurrentDate(req); todayMidnight.setHours(0,0,0,0);`.

### P0-8 — `bulk-status` POST bulk-completes jobs that have no actualStartDate

- **File:** `src/app/api/sites/[id]/bulk-status/route.ts:79-86`
- **What's wrong:** When the action is `complete` on a job that's still
  IN_PROGRESS (the path the route DOES allow), the route writes
  `actualEndDate = now` but skips the actualStartDate set even when
  `job.actualStartDate` is null. The guard at line 79 only sets
  actualStartDate when the action is `start`. Result: an admin can
  bulk-complete a job whose actualStartDate stays null. Reports filtering
  on `actualStartDate is not null` (analytics duration calcs, story tab
  variance) silently drop these jobs.
- **How to trigger:** Programmatically set a job status to IN_PROGRESS
  without going through the `start` action (or via a future code path
  that does). Then bulk-complete it. `actualStartDate=null`,
  `actualEndDate=now`, status=COMPLETED. Analytics omits it.
- **Fix:** Inside the `action === "complete"` branch, if
  `!job.actualStartDate`, also write `actualStartDate = job.startDate ?? now`
  to ensure non-null. Already inconsistent with `/api/jobs/[id]/actions`
  complete branch, which sets `actualEndDate=now` but doesn't backfill
  actualStartDate either — same bug applies there.

### P0-9 — Cascade includes `weatherAffected` flag bypass and bypasses I7 silently in EXPAND_JOB branch

- **File:** `src/app/api/orders/[id]/route.ts:506-595`
- **What's wrong:** The EXPAND_JOB branch in the order PUT runs its own
  hand-rolled shift on successors via `addWorkingDays` without going
  through `calculateCascade`. That means none of the engine's
  invariants run:
  - No I7 conflict check (a successor or its PENDING order can land in
    the past silently)
  - No exclusion of ORDERED orders (#176 lock — but the filter here is
    `status: "PENDING"`, so that one's OK)
  - No `assumeOrdersSent` semantics
  - No parent re-derivation
  - No skip on COMPLETED jobs (filter is at line 522 — handles it)
- **How to trigger:** Order edit with `latenessImpact.choice = "EXPAND_JOB"`
  + a deltaWD large enough that the successor's PENDING order date lands
  in the past. The order shifts silently to a past date — exactly the
  bug `#176` and `I3 ORDERED-lock` were supposed to prevent.
- **Fix:** Route EXPAND_JOB through `calculateCascade` with the right
  newEndDate (jobEnd + deltaWD) and only when conflicts.length===0,
  apply (same pattern as PUSH_JOB at line 443).

### P0-10 — `apply-template-helpers.ts` resolveOrderDates uses calendar days for legacy delivery, working days for anchor — mixed unit

- **File:** `src/lib/apply-template-helpers.ts:434, 437, 448-466`
- **What's wrong:** In the anchor path (line 430-439), both `orderDate`
  and `deliveryDate` use `addWorkingDays`. But the legacy fallback path
  (line 461-463) uses `addDays(dateOfOrder, leadTimeDays)` for the
  delivery date — calendar days. Same template, two different unit
  semantics for the same date depending on which fields are populated.
  A migration from legacy → anchor will silently change all existing
  delivery dates because the math is no longer the same.
- **How to trigger:** Apply a legacy template with `deliveryWeekOffset=2`
  and `leadTimeAmount=null`. Order's expectedDelivery is `dateOfOrder
  + 14 calendar days`. Edit the template to use anchor fields with
  `leadTimeAmount=2, leadTimeUnit="weeks"`. Re-apply — now
  expectedDelivery is `dateOfOrder + 10 working days` (Mon→Fri +1wk),
  which is a different real date.
- **Fix:** Unify on working days everywhere in
  `resolveOrderDates`. Note: the comment at `src/app/api/jobs/[id]/actions/route.ts:355-360`
  says calendar-day arithmetic for lead time is "intentional" — that
  contradicts the anchor path. Pick one and document the decision.

### P0-11 — `daily-email` `email: { not: undefined }` is a no-op filter

- **File:** `src/app/api/cron/daily-email/route.ts:111-116`
- **What's wrong:** Prisma treats `email: { not: undefined }` as
  "no filter" — it matches every row regardless of email value. The
  intent was clearly "exclude users with no email" (email is
  non-nullable on the schema but can be `""`). The route then tries
  to email everyone, including users whose `email` is the empty string,
  which Resend will reject and surface as a "N failed" in the event
  log.
- **How to trigger:** Have any user with empty-string email. The daily
  cron iterates them and the Resend call errors. The "filter" in the
  query did nothing.
- **Fix:** `where: { email: { not: "" } }` (or include a regex check
  for `@`). Same gotcha to scan for elsewhere in the codebase.

### P0-12 — `sites/[id]` PUT cascades `assignedToId` to all jobs but doesn't recompute parent rollups

- **File:** `src/app/api/sites/[id]/route.ts:152-169`
- **What's wrong:** When the site's `assignedToId` changes, the route
  runs `prisma.job.updateMany({where:{plotId:{in:plotIds}},data:{assignedToId}})`.
  This writes a single assignee to every job — including parent stages.
  Parent stages are rollup containers (per `recomputeParentFromChildren`
  in `src/lib/parent-job.ts`); their fields should be derived. Writing
  `assignedToId` on a parent doesn't break the schema but creates a
  "phantom assignee" on a non-actionable row. Worse, the parent row's
  derived `status`/`startDate`/`endDate` are not re-rolled afterward
  — `recomputeParentFromChildren` is not called. If a related write
  in the same request was about to update children, the parent rollup
  is stale until the nightly reconcile.
- **How to trigger:** Change a site's assignedToId via PUT. Open Plot
  Detail Gantt — parent stages show the new assignee, leaf children
  unchanged (correct), but if a child mutation happens immediately
  after, the parent's rolled-up dates can be off until midnight.
- **Fix:** Exclude parents from the updateMany
  (`where: { plotId: ..., children: { none: {} } }`). Optionally
  trigger parent rollups for every affected plot.

### P0-13 — `/api/jobs/[id]/photos` POST captures no `sharedWithCustomer` flag — uploaded photos default false (correct) but PATCH allows toggling it without authorising the SITE separately

- **File:** `src/app/api/jobs/[id]/photos/route.ts:179-199`
- **What's wrong:** The PATCH branch only checks job-site access. But
  toggling `sharedWithCustomer = true` is a privacy-sensitive action
  (the photo is now visible to customers via `/api/progress/[token]`).
  PATCH accepts `caption` and `tag`, but a body with `tag` or `caption`
  passes through; if anyone adds `sharedWithCustomer` to the spread at
  line 191-195 (e.g. via a future feature flag), all site-access users
  including limited contractors could leak photos to customers. Today
  the field isn't in the spread, so the bug is latent — but the route's
  type is `Record<string, unknown>` from `req.json()`, easy to misadd.
- **How to trigger:** A future PR adds `sharedWithCustomer` to the
  patch spread. Suddenly a contractor with site access can toggle
  customer visibility on every photo.
- **Fix:** Add explicit guard. Either reject `sharedWithCustomer` on
  the PATCH body or require a stronger permission
  (`EDIT_PROGRAMME` or new `SHARE_PHOTOS`) before honouring it.
  Also: photo deletion (`DELETE` branch) has no permission check —
  any site member can delete photos uploaded by other users.

### P0-14 — Snags POST flagged with `getServerCurrentDate(req)` but the `notes` body field is rendered verbatim — XSS surface on `/api/contractor-share/[token]/snag-action`

- **File:** `src/app/api/contractor-share/[token]/snag-action/route.ts:120-126`
- **What's wrong:** Contractor portal accepts free-text `notes` and
  appends them to `snag.notes`. The eventLog description (line 133)
  includes the snag's `description` verbatim. None of this is
  escaped. The snag notes field is later rendered into admin's UI; if
  the admin views the snag in a context that does HTML rendering
  (e.g. PDF generation, email templates like `snagRaisedEmail` which
  inserts `description` straight into innerHTML), a contractor could
  inject script via a notes payload. The contractor portal is token-
  auth — token is what gates this — but a contractor token is much
  weaker than session auth.
- **How to trigger:** A contractor with a valid share token POSTs
  notes containing `<img src=x onerror=fetch(...)>`. Snag notes
  contain the payload. An admin opens the snag PDF (or the email
  template renders it).
- **Fix:** HTML-escape `description`, `notes`, and `location` before
  they ever cross into rendered HTML. The PDF/email templates should
  escape on render too. `lib/email.ts:147` interpolates
  `${description}` directly into HTML — same concern.

---

## P1 findings (latent risk / edge case bug / SSOT drift)

### P1-1 — `schedule.ts` `getPlotScheduleStatus` uses calendar days, threshold THRESHOLD_DAYS=3

- **File:** `src/lib/schedule.ts:1, 72, 17`
- **What's wrong:** `differenceInCalendarDays(orig, curr)` is used to
  compute deviation, with a threshold of 3 days. Every other helper
  in `src/lib/` uses working days. A 3-calendar-day deviation that
  straddles a weekend (Friday → Monday) is actually 0 working days.
  Direct contradiction of `src/lib/README.md` rule 1: "No local
  timeline arithmetic — use working-days helpers." This is the helper
  consumed by sidebar pills, plot list status chips, and the Programme
  view's status pill.
- **How to trigger:** A plot's `originalStartDate=Friday`,
  `startDate=Monday`. Calendar diff is 3, working diff is 0 (or 1).
  The plot now shows "behind" or "on track" based on weekend
  positioning rather than real movement.
- **Fix:** Switch to `differenceInWorkingDays`. Note this consumer is
  one of the largest in the app (`plot-schedules` route also imports
  it indirectly).

### P1-2 — `/api/jobs/[id]/next` uses calendar `differenceInDays`

- **File:** `src/app/api/jobs/[id]/next/route.ts:5, 120`
- **What's wrong:** Computes `deltaDays = differenceInDays(actualEndDate, endDate)`
  with calendar days, then passes the value to `calculateCascade` (line
  126), which internally re-snaps via working days. The branch at line
  121 guards `if (deltaDays !== 0)` — a same-week shift (Friday→Sunday
  for example) could read deltaDays=2 in calendar terms but 0 in
  working terms. Route then unnecessarily computes a cascade preview.
- **Fix:** Use `differenceInWorkingDays` everywhere.

### P1-3 — `analytics` route uses calendar `differenceInDays` for job durations

- **File:** `src/app/api/analytics/route.ts:4, 211, 225, 283, 357, 364`
- **What's wrong:** Job duration analysis, contractor performance, and
  supplier lead-time calculations all use `differenceInDays`. The whole
  app is calibrated in working days, so the analytics report displays a
  systematically inflated number ("planned 7 days, actual 10 days") for
  any range that spans weekends.
- **Fix:** Migrate to `differenceInWorkingDays`. Replace any "days" copy
  with "working days" in the report headers.

### P1-4 — `delay-report` uses calendar `differenceInDays`

- **File:** `src/app/api/sites/[id]/delay-report/route.ts:4, 151, 267, 285, 315`
- **What's wrong:** Same pattern as analytics — `daysOverdue`,
  `daysLate`, lead-time delays all in calendar days. The view consumer
  presents them as "days late" alongside the job's lateness pill which
  is sourced from `lateness.ts` using **working** days. Inconsistent
  numbers across views for the same job.
- **Fix:** Migrate to working days.

### P1-5 — `snag-report` uses calendar `differenceInDays` for age

- **File:** `src/app/api/sites/[id]/snag-report/route.ts:5, 50, 60, 82`
- **What's wrong:** Snag age and resolution-days computed in calendar
  days. The PDF and email templates report "X days old". The weekly
  digest's `staleSnags > 30 days` threshold is calendar-day too.
  Inconsistent with weekly-report and analytics.
- **Fix:** Either unify everything in calendar days (more honest for
  snag age — weekends still elapse) or in working days. Either way,
  document the chosen unit. Today the unit drifts per view.

### P1-6 — `walkthrough` route uses `differenceInCalendarDays`

- **File:** `src/app/api/sites/[id]/walkthrough/route.ts:5, 137, 148`
- **What's wrong:** Computes "delta" between today and current job's
  end/start with calendar days. Same drift pattern; the value is fed
  into status copy ("3 days behind").
- **Fix:** Working days.

### P1-7 — `lateness` cron computes daysLate via `differenceInWorkingDays`, but seed script uses calendar days

- **File:** `scripts/seed-lateness-from-current-state.ts:40, 50, 86, 99`
- **What's wrong:** The cron at `src/app/api/cron/lateness/route.ts:86,
  104, 164, 184` computes daysLate via `differenceInWorkingDays`. The
  seed script (which is documented as "same logic as the cron")
  computes it as `Math.floor((today - date)/86400000)` — calendar days,
  including weekends. A backfill run would persist working-day values
  for some events and calendar-day for others, depending on which path
  opened the row first.
- **How to trigger:** Run the backfill on a DB that already has cron-
  generated rows. The seed script `openOrUpdateLateness` with
  calendar-day daysLate; the helper sees an existing event and
  overwrites with the new (calendar) value. Reports now read inflated
  daysLate.
- **Fix:** Update the seed script to use `differenceInWorkingDays`.

### P1-8 — `cascade` route GET returns `400` when `newEndDate` would mean snap to today, even with no real movement

- **File:** `src/lib/cascade.ts:136-138`
- **What's wrong:** If deltaDays computes to 0, the function returns an
  empty result. Caller in `/api/jobs/[id]/cascade/route.ts:175-184`
  treats `conflicts.length > 0` as the block condition. Edge case: a
  user moves a job's end date 1 calendar day later, falling on a
  weekend → snap brings it back to Friday → deltaDays=0 → no
  changes apply but the UI received a 200 response that says "0 jobs
  shifted, 0 orders shifted". The user's intent (move it) is silently
  ignored.
- **Fix:** When deltaDays is 0 because of weekend snap, return a
  clear "no shift required" status code or a flag so the UI can show
  feedback.

### P1-9 — `/api/jobs/[id]/cascade` GET returns conflicts that the client could miss because of `JSON.parse(JSON.stringify(...))` round-trip

- **File:** `src/app/api/jobs/[id]/cascade/route.ts:113, 281`
- **What's wrong:** Dates are stringified through `JSON.parse(JSON.stringify(...))`.
  This works but is a brittle serialiser — a Date inside the conflict
  payload becomes a string but the TypeScript type still claims `Date`
  on consumer side. If the consumer ever does `proposedDate.getTime()`
  on the conflict object received via fetch, it'll throw at runtime.
- **Fix:** Use Prisma's structured response or explicit `.toISOString()`
  on the dates. Document the date-serialisation contract.

### P1-10 — `parent-job.recomputeParentFromChildren` writes `originalStartDate/EndDate` from child mins/maxes — but only when children HAVE originals

- **File:** `src/lib/parent-job.ts:104-128`
- **What's wrong:** The helper writes `originalStartDate: minOrigStart`
  IF the children have originals. But `originalStartDate` is **NOT
  NULL** in the schema (line 313-316 of `schema.prisma`). On every
  child mutation that calls `recomputeParentOf`, the parent's original
  is replaced with the min of children — which is generally what we
  want, but if a child was just deleted (the deletion path), the
  parent's original could shrink. Originals should be a fixed
  baseline, NOT computed from current children. The line 104-115
  comment claims "These are the planned baseline" but then it's
  recomputed every call.
- **How to trigger:** Plot has parent stage Brickwork with 3 children
  (original starts day 1/3/5). Parent's originalStartDate=day1.
  Delete child 1; helper re-runs, parent.originalStartDate=day3.
  Site Story variance reports parent "ahead of original" because the
  baseline shifted.
- **Fix:** Either lock originals after first apply (recompute only on
  first parent write) or remove them from the recompute entirely
  and rely on a one-shot apply-time stamp.

### P1-11 — `parent-job.ts` rolls up `actualEndDate` only when EVERY child completed — but `recomputeParentFromChildren` is called from inside transactions where one child may be mid-update

- **File:** `src/lib/parent-job.ts:95-99` and call sites in
  `src/app/api/jobs/[id]/actions/route.ts:466`, etc.
- **What's wrong:** Logic is: parent's `actualEndDate` is only locked
  in when every child is COMPLETED. If a transaction completes one
  sibling and then re-runs the parent rollup, the parent rolls up
  while siblings are still NOT_STARTED. That's correct behaviour. But
  reading the parent state inside another concurrent transaction's
  rollup (race between two sibling completions) can race: tx A sees
  3/4 completed when it begins, sets parent's status to IN_PROGRESS;
  tx B sees 4/4 completed (its own sibling just completed too) and
  sets parent COMPLETED. If tx A commits after tx B, parent is
  IN_PROGRESS but every child is COMPLETED. Plot percent would also
  drift.
- **How to trigger:** Two parallel "complete" actions on different
  sub-jobs of the same parent. Each invokes
  `recomputeParentFromChildren`. The later-committing transaction may
  overwrite the result of the earlier.
- **Fix:** Acquire a row-level lock on the parent during rollup
  (`SELECT ... FOR UPDATE`), or serialise by acquiring an advisory
  lock keyed on parent.id. The nightly reconcile cron papers over
  most cases, but the window is real.

### P1-12 — `recomputePlotPercent` similarly races on concurrent leaf completions

- **File:** `src/lib/plot-percent.ts:22-45`
- **What's wrong:** Same hazard as P1-11. Two concurrent
  "complete" calls on different jobs on the same plot each call
  `recomputePlotPercent(plot)`. Both call `prisma.job.groupBy`; the
  earlier groupBy may not see the later commit. Last writer wins —
  and the loser leaves the plot with a percent that under-counts.
- **Fix:** Acquire an advisory lock keyed on plot.id, or wrap the
  recompute inside a transaction with `for update`. Reconcile cron
  catches it within 24h but the drift is real day-of.

### P1-13 — `openOrUpdateLateness` un-resolves a closed event on re-open without a clear audit row

- **File:** `src/lib/lateness-event.ts:78-99`
- **What's wrong:** If a lateness event was previously resolved
  (resolvedAt set) and the daily cron re-opens it, the helper sets
  `resolvedAt = null` (line 84) but only emits an `LATENESS_OPENED`
  EventLog on first creation (line 121-134). Re-opening doesn't emit
  any audit row — the timeline loses the "re-opened" moment. Reports
  that aggregate `resolved` events for a period will overstate
  resolutions (the closed-then-reopened event is counted as resolved
  for the period that included its first close, but is now open).
- **Fix:** Emit `LATENESS_OPENED` again on un-resolve, or add a
  `LATENESS_REOPENED` event type.

### P1-14 — Cascade `assumeOrdersSent` is applied only inside cascade preview, but the apply flow expects the caller to flip ORDERED separately

- **File:** `src/app/api/jobs/[id]/cascade/route.ts:194-200, 229-234`
- **What's wrong:** The apply transaction (line 203-235) flips the
  override orders to ORDERED with `dateOfOrder=today`. But the same
  orders are also passed to `calculateCascade(..., overrideOrderIds)`.
  Engine skips them in `orderUpdates`. So the flip is the only write
  the order receives. Side effect: `expectedDeliveryDate` is NOT
  recomputed from `leadTimeDays + today`. The order is now ORDERED
  with `dateOfOrder=today` but `expectedDeliveryDate` is unchanged
  (could be in the past relative to today, since this is a pull-forward
  path). Daily Brief / heatmap immediately flag it as overdue. The
  manager triggered "Start anyway" expecting the system to handle
  the order date, but the delivery date wasn't fixed.
- **Fix:** When flipping orders override, call
  `enforceOrderInvariants` so the expectedDeliveryDate is brought
  forward to `today + leadTimeDays`, matching the start-action
  semantics.

### P1-15 — `daily-email` cron forgets the dev-date cookie on managers without an explicit deep-link parameter

- **File:** `src/app/api/cron/daily-email/route.ts:142-143`
- **What's wrong:** `const baseUrl = process.env.NEXTAUTH_URL ?? "https://sight-manager.vercel.app"`.
  Every deep-link in the email points to the production URL even
  during a dev-mode test. If a developer runs the cron locally under
  Dev Mode, the email goes out (to whatever Resend allows in test
  mode) but every link sends the user to prod, not localhost. Lower
  severity than wrong-data but trips up testing.
- **Fix:** Use the request's origin where present, otherwise fall back
  to env. Several other cron emails have the same pattern.

### P1-16 — `request-reset` returns generic 200 even when `sendEmail` throws — but logs nothing distinguishable

- **File:** `src/app/api/auth/request-reset/route.ts:80-84`
- **What's wrong:** If Resend fails (rate limit, invalid API key,
  unverified domain), the route prints `console.error` and returns
  generic-OK. The user sees "if that email is registered, a link is on
  its way" and never gets a link. Operators have no signal — no
  EventLog row, no metric. Could go undetected for weeks.
- **Fix:** Persist a `NOTIFICATION` EventLog row on send failure with
  the underlying error message (truncated) so a monitoring scan can
  alert. Same fix the daily-email cron already does (line 320-323).

### P1-17 — `/api/share/[token]` does NOT check `Plot.shareEnabled`

- **File:** `src/app/api/share/[token]/route.ts:9-55`
- **What's wrong:** The legacy admin "Get share link" feature signs
  a JWT-style token for a plot and serves the data. The endpoint
  verifies the signature + expiry but does not check
  `plot.shareEnabled`. So a previously-issued signed share token
  keeps working even after the manager flips the customer-share
  feature off. The newer `/api/progress/[token]` (line 92-94) checks
  this correctly.
- **Fix:** Add `if (!plot.shareEnabled) return 404` after the
  `findUnique`. Two share systems coexist and one doesn't honour the
  kill switch.

### P1-18 — Daily-brief / notifications cron uses `now` (date+time) for `endDate: { lt: now }` checks

- **File:** `src/app/api/cron/notifications/route.ts:43, 49`
- **What's wrong:** `prisma.job.count({where: {endDate: {lt: now}}})`
  uses the full `now` Date including hours/min/sec. Job.endDate is
  typically stored at midnight (00:00). So a job with endDate=today
  at midnight, when checked at 05:00 UTC during cron, satisfies
  `endDate < now` and counts as overdue — even though the job is
  due TODAY and shouldn't be counted overdue until tomorrow. The
  daily-email path uses `todayStart` (correctly) but the
  notifications path mixes `now` and `todayStart`.
- **How to trigger:** A job with endDate=2026-05-13T00:00:00Z. The
  cron runs at 2026-05-13T05:00:00Z. `endDate < now` is true. The
  "overdue jobs" count is inflated by 1.
- **Fix:** Use `todayStart` consistently in the where clauses for
  overdue-end and overdue-order checks.

### P1-19 — `/api/cron/lateness` `endDate < today` check is correct but the daysLate clamp logic could double-emit on day boundaries

- **File:** `src/app/api/cron/lateness/route.ts:81-99`
- **What's wrong:** `wentLateOn` is computed as endDate + 1 calendar
  day. Cron runs once daily at 30 4 \* \* \* (4:30 AM UTC). If a job
  endDate is "today at midnight" UTC, the cron checks endDate < today
  → false (equal, not less). Tomorrow's cron sees it < tomorrow's
  today, so opens the event with wentLateOn=today+1=actual today.
  Manager looks at the event and is confused: "the event says it
  went late today, but yesterday's daily brief showed it as overdue
  too". Mismatch between push semantics (lateness on day-of) and
  cron's "strictly past" rule.
- **Fix:** Pick one convention site-wide. Either lateness fires
  same-day as endDate (matching dailybrief) or one day later
  (matching cron). Document in `lateness.ts`.

### P1-20 — `/api/cron/weather` `existing` lookup uses `description: { startsWith: "🌤 Weather:" }` — fragile

- **File:** `src/app/api/cron/weather/route.ts:53-57`
- **What's wrong:** Idempotency check for "is today's weather already
  logged" greps the description prefix with an emoji. If the prefix
  changes (e.g. someone refactors the desc format), the cron starts
  double-logging weather rows. Also, the prefix check is case-
  sensitive and timezone-naïve (`dayStart` from `date-fns:startOfDay`
  uses server local time; on Vercel that's UTC).
- **Fix:** Use a dedicated field (or a different EventType like
  WEATHER_LOGGED) instead of pattern-matching the description string.

### P1-21 — `share-token` `verifyContractorToken` accepts `payload.exp = 0` falsely

- **File:** `src/lib/share-token.ts:60-65`
- **What's wrong:** `typeof payload.exp !== "number"` accepts 0. Then
  `Date.now() > payload.exp` is true → reject. OK. BUT `payload.exp =
  -1` (a negative number) would also reject — correct. Edge:
  `payload.exp = Number.MAX_SAFE_INTEGER` accepts (token never
  expires). Unsigned tokens with exp=0 (legacy bug data) get rejected
  cleanly — so this is fine but worth documenting. Note: contractor
  tokens are validated with the SAME secret as customer share tokens
  (`requireSecret()`); if a token leaks, the corresponding secret could
  potentially be used to forge tokens of any other class.
- **Fix:** Document the secret-reuse risk; consider per-token-type
  scoped HMAC (e.g. prepend a domain tag to the payload). Low
  severity but worth a comment in the file.

### P1-22 — Weather cron sends `sendPushToAll` per site — heavy spam during multi-site rollouts

- **File:** `src/app/api/cron/weather/route.ts:80-85, 112-117`
- **What's wrong:** `sendPushToAll` fires to every user in the tenant,
  not the site audience. So 10 active sites = 10 pushes to every user,
  even users with no access to those sites. The notifications cron at
  `/api/cron/notifications/route.ts:168-176` correctly uses
  `sendPushToSiteAudience`. Weather cron lags behind.
- **Fix:** Switch the weather pushes to `sendPushToSiteAudience`.

### P1-23 — `parent-job.ts` doesn't handle ON_HOLD-only children correctly

- **File:** `src/lib/parent-job.ts:71-77`
- **What's wrong:** The rollup rule says: "all (ON_HOLD | COMPLETED)
  with at least one ON_HOLD → ON_HOLD". But "all ON_HOLD" doesn't get
  hit by the IN_PROGRESS branch; falls to ON_HOLD branch which requires
  `some` ON_HOLD and `every` ON_HOLD-or-COMPLETED — so it works. But
  the case where ALL children are NOT_STARTED with one ON_HOLD also
  falls to "otherwise NOT_STARTED" (line 67). A user pausing a
  scheduled sub-job sees the parent flip to NOT_STARTED, not ON_HOLD.
  Subtle but visible.
- **Fix:** Document the precedence rule or include NOT_STARTED in the
  mixed-ON_HOLD branch.

### P1-24 — `getCurrentStage` falls back to "last completed" when everything done — misleading "current stage" pill

- **File:** `src/lib/plot-stage.ts:43-49`
- **What's wrong:** When every job is COMPLETED, returns the
  last-COMPLETED job (line 49 comment: "this is where we ended up").
  But `getCurrentStageLabel` returns "Complete" instead (line 54-58).
  Two functions disagree on the same case. Direct callers of
  `getCurrentStage` (not the label helper) will show the last job's
  name as the current stage. The plot list might say "Brickwork" for
  a fully complete plot, while the same plot's heatmap says "Complete".
- **Fix:** Make `getCurrentStage` return null when all complete (and
  document), or change `getCurrentStageLabel` to use the function's
  output uniformly.

### P1-25 — `bulk-status` auto-cascade fires on EVERY late bulk-complete, even when downstream is already shifted

- **File:** `src/app/api/sites/[id]/bulk-status/route.ts:221-312`
- **What's wrong:** Auto-cascade runs whenever `actualEndDate > planned
  endDate`. But the cascade engine's `calculateCascade` is called with
  the same trigger + downstream config every iteration of the bulk
  loop. If two parents on a plot are bulk-completed in the same batch,
  the second iteration sees the already-shifted downstream and shifts
  it AGAIN. Working-day delta isn't idempotent across two compounded
  shifts.
- **How to trigger:** Bulk-complete two late jobs on the same plot
  back-to-back. First iteration shifts everything by +3 WD; second
  iteration sees the new state, computes +X more WD because the second
  parent is also late, shifts everything again. Downstream ends up
  shifted more than intended.
- **Fix:** Compute the cascade ONCE for the bulk-completion (against
  all triggers, taking the max delta), or sort completed jobs by
  sortOrder and re-fetch the plot state between iterations to honour
  the shifted positions.

### P1-26 — `pull-forward` POST returns 400 when newStartDate === current start because `>=` (line 315)

- **File:** `src/app/api/jobs/[id]/pull-forward/route.ts:315-320`
- **What's wrong:** `if (newStart >= job.startDate)` — rejects same-day
  shifts. Plausible user intent: shift to the same date (no-op),
  expected to return 200 with no changes. Returns 400 with "must be
  earlier", which the UI surfaces as an error toast. Minor UX bug.
- **Fix:** Return `{ noop: true, ... }` with 200 on same-day.

### P1-27 — `next-stage` notification fires from `bulk-status` for COMPLETED parents but assignedToId is the parent's, which is often inherited from the site

- **File:** `src/app/api/sites/[id]/bulk-status/route.ts:331-353`
- **What's wrong:** Next-job push fires to `nj.assignedToId` if present.
  When the assignee was cascaded from the site (`sites/[id]` PUT
  cascading assignedToId to all jobs), every job has the same
  assignedToId. So bulk-completing 5 jobs blasts 5 pushes to the same
  person for the same plot. Realistic noise during a busy day.
- **Fix:** Deduplicate by assignedToId within a single batch, or
  consolidate pushes into a summary.

### P1-28 — `JobAction` records aren't covered by an immutability contract (unlike EventLog)

- **File:** `prisma/schema.prisma:354-366`, no docstring
- **What's wrong:** JobAction is logged on every start/stop/complete/
  note/signoff. The Delay Report and Site Story aggregate from it.
  But unlike EventLog (line 1338-1356), there's no contract that
  JobAction is append-only. `prisma.jobAction.update` or
  `prisma.jobAction.deleteMany` is not blocked. A future code change
  could mutate past actions. The contract should be the same as
  EventLog.
- **Fix:** Document the append-only contract. Optionally add a DB
  trigger or run a CI check that greps for `jobAction.update` /
  `.delete`.

### P1-29 — `restart-decision` route doesn't gate on permission — any session can defer

- **File:** `src/app/api/plots/[id]/restart-decision/route.ts:21-104`
- **What's wrong:** No `canAccessSite` check on either the leave_for_now
  or the start_today/push_weeks branches. A contractor session could
  POST and either defer or pull-forward someone else's plot.
- **How to trigger:** Auth as a contractor. POST to the route with a
  plotId on a site you can't see. The plot's awaitingRestart flag
  flips, an EventLog row is written, downstream jobs shift.
- **Fix:** Fetch the plot, then `canAccessSite(plot.siteId)`. Add a
  `EDIT_PROGRAMME` permission check.

### P1-30 — `recomputeParentFromChildren` no-ops on empty children

- **File:** `src/lib/parent-job.ts:36-39`
- **What's wrong:** Returns early if no children. But consider a parent
  whose children were all deleted in a transaction — the parent
  remains as orphaned data (its own status/dates frozen at the moment
  before the last child was deleted). The route should either delete
  the orphan parent or convert it to a leaf.
- **Fix:** Decide and document. Either the JS deletion code that
  unsets children should also delete the parent if it's now leaf-with-
  zero-children, or the helper should null out the parent's dates.

### P1-31 — Customer share token regeneration on rotate doesn't invalidate existing CustomerPushSubscription rows

- **File:** `src/app/api/plots/[id]/customer-link/route.ts:78-101`,
  `prisma/schema.prisma:790-808`
- **What's wrong:** Rotating the token issues a new shareToken but
  `CustomerPushSubscription.plotId` ties subscriptions to the plot,
  not the token. So after a rotate, old subscribers continue to
  receive pushes even though the URL they bookmarked is dead. From
  the customer's perspective: pushes arrive but the link 404s.
- **Fix:** Either tie subscriptions to (plotId, tokenAtSubscribeTime)
  with a check on push-fire, or delete subscriptions on rotate.

### P1-32 — `enforceOrderInvariants` doesn't enforce "expectedDelivery in the future when status=ORDERED" — explicitly skipped (line 79)

- **File:** `src/lib/order-invariants.ts:76-80`
- **What's wrong:** Comment says: `(today is reserved for future
  invariants — e.g. "expectedDeliveryDate should not be in the past
  for an ORDERED order placed today" — but current invariants are
  purely relative between fields.)`. This is a known TODO that hasn't
  landed. Result: a cascade that ends up with `expectedDeliveryDate <
  today` for an ORDERED order is allowed. Comment at I3 in
  `src/lib/cascade.ts:18-25` claims ORDERED orders DON'T shift, but
  other paths (e.g. EXPAND_JOB in P0-9) shift PENDING which then
  becomes ORDERED on next action, with no invariant catching the
  arithmetic drift.
- **Fix:** Either implement the documented invariant or remove the
  promise from the comment.

### P1-33 — `lateness/[id]` PATCH allows arbitrary `reasonCode` strings without enum validation

- **File:** `src/app/api/lateness/[id]/route.ts:37`
- **What's wrong:** `data.reasonCode = body.reasonCode` accepts any
  string. Prisma's enum validation will reject at the DB layer, but the
  error surfaces as a generic 500 instead of 400 with a clear message.
- **Fix:** Validate against the LatenessReason enum members.

### P1-34 — `cron/lateness` doesn't check `endDate < wentLateOn` consistency before refresh

- **File:** `src/app/api/cron/lateness/route.ts:81-117`
- **What's wrong:** If a manager edits a job's endDate forward AFTER an
  existing JOB_END_OVERDUE event has opened, the cron's next pass:
  - Sees `endDate >= today` → calls resolveLateness (line 224)
  - But the existing `wentLateOn` row is still in the DB
- That's actually correct (we resolve), but: if the manager then pushes
  endDate BACK past today again, the cron opens a NEW event with a NEW
  wentLateOn (yesterday + 1). The old (resolved) event sits alongside the
  new (open) one for the same target — unique key
  `(targetType, targetId, kind, wentLateOn)` allows it. Reports counting
  "total events" double-count this target.
- **Fix:** Add wentLateOn back to the dedup window — once a target has
  any open or recently-closed event in the past N days, refresh that
  one rather than creating a new "went late on a different day" row.

### P1-35 — Dev-date cookie can leak across the cron-secret-protected boundary

- **File:** `src/lib/dev-date.ts:59-63`,
  `src/app/api/cron/*/route.ts`
- **What's wrong:** `getServerCurrentDate` reads `dev-date-override`
  from the request cookies. Cron routes accept this. A malicious actor
  who possesses the CRON_SECRET could fake the time the cron runs at
  by including a dev-date cookie on the cron request. Then daysLate
  computations, "active" site selection, deliveries-today counts all
  shift to a fake date. Could be weaponised to e.g. mark all overdue
  orders not-overdue by setting dev-date in 1900.
- **Fix:** In cron handlers, ignore the dev-date cookie when the
  authorization is the production CRON_SECRET — only honour it in
  Dev Mode (e.g. when `process.env.NODE_ENV !== 'production'`).

### P1-36 — `weatherAffectedType` field is a freeform string but only RAIN / TEMPERATURE / BOTH are documented

- **File:** `prisma/schema.prisma:328`
- **What's wrong:** Field is `String?` with a comment listing valid
  values. No enum, no application-layer validation in route handlers
  that set it (search confirms no validation). Future code that writes
  `weatherAffectedType=cold` will be silently stored and break the
  weather cron's `["rain","snow","thunder"]` heuristic at
  `src/app/api/cron/weather/route.ts:91`.
- **Fix:** Convert to an enum, or add a route-layer validator.

### P1-37 — `siteAccessFilter` returns `{}` for admins, but consumers using it inside a `where: { AND: [...] }` clause may inadvertently widen access

- **File:** `src/lib/site-access.ts:32-40`
- **What's wrong:** A typical call is
  `where: { ...siteAccessFilter(...), other: stuff }`. The `{}` admin
  case spreads no keys — fine. But if someone composes with
  `where: { OR: [siteAccessFilter(...), specialCase] }`, the empty
  object is "match everything" inside the OR, granting access to
  everything. Subtle footgun.
- **Fix:** Have the function return a clause that's always present
  (e.g. `{ siteId: { in: [...] } }` for non-admins and
  `{ siteId: { not: undefined } }` for admins). Or document the
  spread-only contract loudly.

### P1-38 — `verifyShareToken` accepts tokens whose payload has extra fields silently

- **File:** `src/lib/share-token.ts:163-183`
- **What's wrong:** Only validates `plotId` (string) and `exp` (number).
  A token signed with extra fields (e.g. `role: "admin"`) is accepted.
  Today the consumer doesn't read extra fields, but a future expansion
  ("share token can grant write access if `role` set") would silently
  enable forged tokens with a leaked share-secret. Low severity but
  worth tightening.
- **Fix:** Strict schema validation rather than presence checks.

### P1-39 — Job photos POST surfaces the raw error message in the response

- **File:** `src/app/api/jobs/[id]/photos/route.ts:155-161`
- **What's wrong:** `error: error instanceof Error ? error.message : "Upload failed"`
  on the 500. In production this can leak Supabase/Prisma internals
  (storage paths, bucket names). Other routes route through
  `apiError(err, fallback)` which sanitises in production.
- **Fix:** Replace with `apiError(error, "Photo upload failed")`.

### P1-40 — `apply-template` route doesn't enforce a permission gate beyond site access

- **File:** `src/app/api/plots/apply-template/route.ts:13-55`
- **What's wrong:** Creating a plot from a template is a heavy
  mutation (creates jobs, orders, materials, documents). Currently
  gated only by `canAccessSite`. A contractor with site access can
  spawn plots. The schema's intent is that SITE_MANAGER+
  manages plots; the route should match.
- **Fix:** Add `sessionHasPermission(session.user, "EDIT_PROGRAMME")`.

### P1-41 — `weekly-digest` cron counts `latenessDaysLost` from EVERY open event, not the week's open events

- **File:** `src/app/api/cron/weekly-digest/route.ts:190-196`
- **What's wrong:** The "open lateness for week" query at line 190-193
  selects ALL open events on the site regardless of when they opened.
  Then aggregates daysLate. The header "12 working days lost" in the
  digest is therefore the running cumulative, not "what happened this
  week". The weekly digest message implies the latter.
- **Fix:** Filter by `wentLateOn: { lt: todayStart }` (so we only count
  events that opened before this week) — or rephrase the summary to
  match the current data: "12 working days lost across all open
  events".

### P1-42 — `jobs/[id]/actions` "edit" action label is "Updated" but EventLog type is `JOB_EDITED` — confusion with `PUT /api/jobs/[id]` which also creates `JOB_EDITED`

- **File:** `src/app/api/jobs/[id]/actions/route.ts:24, 28-29, 256-272`
- **What's wrong:** Both the actions route (action="edit") and the PUT
  route create EventLog rows of type=JOB_EDITED. Story tab and timeline
  views can't distinguish a structural edit (PUT) from an action note
  (action="edit"). Minor info-loss for audit trails.
- **Fix:** Use a different EventType (e.g. JOB_NOTE_ADDED for note,
  JOB_EDITED for structural).

### P1-43 — `cron-auth` falls back to a fixed dev token when CRON_SECRET is empty in dev

- **File:** `src/lib/cron-auth.ts:24`
- **What's wrong:** Dev returns `ok: authHeader === "Bearer dev-cron"`.
  Local dev is fine, but if someone deploys to a staging environment
  without CRON_SECRET, the cron routes silently accept `Bearer dev-cron`.
  Vercel preview environments are NODE_ENV=production by default — but
  someone deploying via a non-Vercel path (Docker) might end up with
  NODE_ENV=development in production. The result: anyone hitting
  `/api/cron/lateness` with that header opens lateness events across
  the whole DB.
- **Fix:** Require `process.env.NODE_ENV === "development"` AND a
  whitelist hostname check, not just NODE_ENV. Or require CRON_SECRET
  in all environments.

### P1-44 — `apply-template-helpers` `unitsToDays` returns calendar days for the "days" unit but working days for "weeks"

- **File:** `src/lib/apply-template-helpers.ts:394-401`
- **What's wrong:** `unit === "weeks" ? a * 5 : a`. If unit is "weeks",
  multiplies by 5 (working-day translation). If unit is "days", returns
  `a` literally — but `a` is then fed into `addWorkingDays`, so it
  becomes working days. So "5 days" lead time and "1 week" lead time
  both resolve to 5 working days, which... is consistent. OK on
  second look; but the bug is that "1 week" doesn't equal "7 days" in
  the legacy fallback path (line 461 uses `addDays(dateOfOrder, leadTimeDays)`
  with `leadTimeDays = leadTimeAmount * 7`). Two different code paths,
  two different week semantics.
- **Fix:** Pick one. Document.

### P1-45 — `cascade.ts` parent re-derivation runs only when children moved — orphan parents stay frozen

- **File:** `src/lib/cascade.ts:262-285`
- **What's wrong:** Parent re-derivation iterates moved children
  (`newPositionsById.get(c.id)`) and skips parents with no moved
  children. But if a parent has all-COMPLETED children (none moved
  because filtered out at line 165), the parent's dates aren't
  re-derived. If the parent's cached dates were stale (e.g. one
  child's dates were updated outside a cascade), the parent is left
  stale. Reconcile cron picks it up; mid-day it's stale.
- **Fix:** Either also re-derive parents whose stored dates don't match
  the min/max of their children, or accept the cron-catches-it window.

### P1-46 — `jobs/[id]/actions` POST after `complete` returns the job with `_completionContext` — but parent rollups happen AFTER this select runs, so the returned job state is stale

- **File:** `src/app/api/jobs/[id]/actions/route.ts:179-190, 466-477, 670-690`
- **What's wrong:** The route assembles `job` from line 179-190
  (immediately after `prisma.job.update`). Then it calls
  `recomputeParentOf` (line 466), then `resolveLateness` (line 472),
  then auto-cascade (line 492+), then the completion-context block
  (line 670) re-fetches `allPlotJobs` but uses the original `job` for
  the response. Result: the returned job's parentJob fields and the
  plot's percent are stale relative to what's persisted.
- **Fix:** Re-fetch the job at the very end if the caller depends on
  freshness, or make the route's response explicit about what's
  guaranteed-fresh.

### P1-47 — `cron/lateness` order scan misses orders without `siteId` or `jobId` — silently dropped at line 152

- **File:** `src/app/api/cron/lateness/route.ts:148-203`
- **What's wrong:** The site selection at line 150 picks
  `siteId = o.job?.plot?.siteId ?? o.siteId ?? null`. For an order
  that's neither linked to a job NOR to a site, `siteId` is null and
  the order is silently skipped. The schema allows this (both jobId
  and siteId are nullable), so an orphan order is possible — and
  it'll never have lateness recorded.
- **Fix:** Either reject orphan orders at creation time, or report
  them in the cron's response so an operator can clean up.

### P1-48 — `pull-forward` doesn't recompute plot percent on every path

- **File:** `src/app/api/jobs/[id]/pull-forward/route.ts:404-409`
- **What's wrong:** The plot-percent recompute fires AFTER the
  transaction commits. If the transaction is rolled back mid-flight,
  the recompute call after the await isn't reached — fine. But the
  recompute fires unconditionally even when no orders shifted and no
  dates moved (the early-return at line 322-324 short-circuits before
  this). Wasteful but not wrong. Compare with the cascade route which
  also calls it defensively (`src/app/api/jobs/[id]/cascade/route.ts:257-260`)
  — there it's claimed defensive. Same pattern, same defensive note,
  but the cost adds up across paths.
- **Fix:** Document why "defensive recompute" is acceptable here, or
  short-circuit when no changes.

---

## P2 findings (code smell / minor cleanup)

### P2-1 — `audit-may-2026.md` and `docs/audit/` aren't linked from MEMORY.md

- **File:** `docs/audit-may-2026.md`, `docs/audit/onboarding-external.md`
- **What's wrong:** Two parallel audit doc paths. Future readers will
  pick one and miss the other.
- **Fix:** Pick a canonical location. Link from MEMORY.md or sweep
  to a single dir.

### P2-2 — `seed-lateness-from-current-state.ts` script can't be re-run safely without considering existing events

- **File:** `scripts/seed-lateness-from-current-state.ts:1-112`
- **What's wrong:** Script is idempotent on the unique key but
  doesn't print which IDs it touched; impossible to audit which rows
  were inserted vs updated.
- **Fix:** Log the IDs touched.

### P2-3 — `working-days.ts` has no test file

- **File:** `src/lib/working-days.ts`
- **What's wrong:** This is the foundational helper for the entire
  cascade/scheduling system. Tests exist for `job-timeline.ts` (snapshot
  + 14 fixtures) but `working-days.ts` itself has no unit tests for
  `addWorkingDays`, `differenceInWorkingDays`, or `snapToWorkingDay`.
  A bug here would cascade through every dependent helper.
- **Fix:** Add a unit test file covering: weekend snap behaviour,
  positive/negative deltas, year/month boundaries, leap days,
  zero-day case, `addWorkingDays(weekend, 0)` semantics.

### P2-4 — `parent-job.ts` test coverage missing

- **File:** `src/lib/parent-job.ts`
- **What's wrong:** No test file. This helper handles
  multi-edge cases (mixed statuses, originals, actuals) and is called
  from 10+ routes. The race conditions in P1-11 would be caught by a
  test.
- **Fix:** Add tests.

### P2-5 — `plot-percent.ts` no test, no fixture for "no leaf jobs" edge case

- **File:** `src/lib/plot-percent.ts:39`
- **What's wrong:** `total === 0 ? 0 : (completed / total) * 100`.
  A plot with zero leaf jobs gets 0% (not "n/a" or null). Heatmap renders
  it as grey via the "totalJobs === 0" branch. Other consumers may
  show it as "0% complete" which is misleading. No test pinning the
  behaviour.
- **Fix:** Test the no-leaf case; consider returning null for
  "indeterminate".

### P2-6 — `cron/lateness` doesn't log a top-level summary EventLog row

- **File:** `src/app/api/cron/lateness/route.ts`
- **What's wrong:** Unlike `cron/reconcile` (line 302-315), the
  lateness cron doesn't write a summary EventLog row when work
  happened. An operator scanning the events log can't tell when the
  cron last ran.
- **Fix:** Match the reconcile pattern.

### P2-7 — Several routes use `(session.user as { role: string }).role` instead of `session.user.role`

- **File:** Many — e.g. `src/app/api/jobs/[id]/route.ts:48`,
  `src/app/api/orders/[id]/route.ts:55, 101`, etc.
- **What's wrong:** Boilerplate cast scattered across the codebase.
  Type lies. The Session type should be augmented once so consumers
  read `session.user.role` directly.
- **Fix:** Augment `next-auth.d.ts` with the role + permissions on
  `User`. Remove the inline casts everywhere.

### P2-8 — `template-includes.ts` import in apply-template route is unused (the route fetches inline)

- **File:** `src/app/api/plots/apply-template/route.ts:5`
- **What's wrong:** `import { templateJobsInclude } from "@/lib/template-includes";`
  is imported but never used; the route does its own inline include
  at line 92-118.
- **Fix:** Remove the import. If `template-includes.ts` provides a
  canonical include, route through it (SSOT — the apply-batch route
  should also use it).

### P2-9 — `cron/notifications` doesn't filter `sendPushToAll` to active-site users

- **File:** `src/app/api/cron/notifications/route.ts:83-159`
- **What's wrong:** `sendPushToAll` blasts the tenant for things like
  "overdueJobsCount > 0". A user with access to only one site that
  has zero overdue jobs still gets a push because some OTHER site
  somewhere has overdue jobs. Trains users to mute.
- **Fix:** Group by site (audience-targeted) for the overdue/late
  buckets, similar to the daily-brief loop at line 168-176.

### P2-10 — `delay-reasons` table doesn't have a `category` enum at the DB layer

- **File:** `prisma/schema.prisma:1324-1334`
- **What's wrong:** `category String @default("OTHER")`. Three valid
  values documented in comment. Anything else passes. A typo would
  silently break aggregations.
- **Fix:** Convert to enum.

### P2-11 — `auth.ts` doesn't enforce password complexity on Credentials login

- **File:** `src/lib/auth.ts:18-31`
- **What's wrong:** No length / complexity check on login. Bcrypt at
  cost 12 is fine for the hash, but accept-reset enforces
  `MIN_PASSWORD_LENGTH=8` (line 27) while the seed/admin paths can
  set arbitrary passwords.
- **Fix:** Centralise password policy.

### P2-12 — `next-auth.d.ts` not present in repo (inferred from inline casts)

- **File:** Not present — `tsconfig.tsbuildinfo` exists; `next-auth.d.ts`
  doesn't appear.
- **What's wrong:** Without a module-augmentation file for NextAuth's
  Session/User types, every consumer casts. Tied to P2-7.
- **Fix:** Add `src/types/next-auth.d.ts` augmenting the types.

### P2-13 — `share-token.ts` `b64url` helper is not exported but is duplicated semantics across 4 sign/verify functions

- **File:** `src/lib/share-token.ts:40-45, 73-80, 99-101, 134-138`
- **What's wrong:** Four near-identical sign blocks (contractor,
  share, reset, calendar). A factory function would deduplicate.
- **Fix:** Extract `signToken(payload, kind)` / `verifyToken(token, expectedKind)`
  pair. Adds the per-token-type domain separator from P1-21 for free.

### P2-14 — `email.ts` HTML templates interpolate user-provided strings unescaped

- **File:** `src/lib/email.ts:67-159`
- **What's wrong:** Multiple templates interpolate `${description}`,
  `${jobName}`, `${plotName}` directly into HTML strings. If any of
  these are user-controlled (snag description IS user-controlled),
  HTML injection is possible. Resend will deliver the HTML as-is to
  the recipient's mail client; modern clients strip script but
  `<img src=x onerror=...>` and CSS-based attacks vary by client.
- **Fix:** HTML-escape on interpolation. Use a templating lib or a
  small `escapeHtml(...)` helper.

### P2-15 — `share-token.ts` `devWarningEmitted` is hoisted via `let`, but the value is module-singleton — fine, but the warning is per-process. Across cold starts on serverless this re-prints every cold start

- **File:** `src/lib/share-token.ts:35`
- **What's wrong:** Vercel serverless cold-starts re-import the module,
  resetting `devWarningEmitted=false`. Each cold start emits a warning
  even in production. Annoying noise; not harmful.
- **Fix:** Gate the warning on `NODE_ENV === "development"`.

### P2-16 — `apply-template-helpers.ts` `tx: any` cast removes type safety

- **File:** `src/lib/apply-template-helpers.ts:182, 471`
- **What's wrong:** `any` cast on the transaction client. Loses
  Prisma's type completion + makes refactors risky. Used because
  Prisma's `Prisma.TransactionClient` import shape isn't quite right
  for this consumer.
- **Fix:** Use `Prisma.TransactionClient | PrismaClient` (the same
  pattern `parent-job.ts` uses).

### P2-17 — Tests / vitest only cover `job-timeline.ts` — every other helper untested

- **File:** `src/lib/job-timeline.test.ts`,
  `src/lib/job-timeline.snapshot.test.ts`
- **What's wrong:** Per memory: "vitest infra mentioned in memory —
  what's actually tested?". Answer: only the timeline helper. The
  cascade engine (where 90% of date-shift bugs live), the parent
  rollup, the plot percent, the lateness helpers, and the working-day
  arithmetic are all uncovered.
- **Fix:** Prioritise tests for cascade (invariants I1-I7) and
  parent rollup race conditions.

### P2-18 — `lateness-event.ts` `inferReasonFromContext` could double-up: rainedOff AND predecessorLate could both be true

- **File:** `src/lib/lateness-event.ts:182-204`
- **What's wrong:** Priority is delayReasonType → rainedOff →
  predecessorLate → materialLate → OTHER. The function returns one
  reason. If a job is late because of BOTH weather AND a predecessor,
  only weather is recorded. Reports under-count predecessor lateness
  on rainy days.
- **Fix:** Allow multi-reason capture, or document the priority.

### P2-19 — Heatmap RAG thresholds in calendar days (14) but maxOverdueDays now in working days (P1-6 fix)

- **File:** `src/app/api/sites/[id]/heatmap/route.ts:82-90`
- **What's wrong:** `maxOverdueDays > 14` is a comparison threshold.
  Now that `workingDaysEndOverdue` is in working days, 14 working
  days ≈ 3 calendar weeks. Pre-#177 the threshold was calendar days.
  The comment at line 67-71 acknowledges the unit flip but the
  threshold wasn't re-tuned.
- **Fix:** Tune threshold for the new unit (probably 10 WD = 2 weeks
  is the right "RED" boundary).

### P2-20 — `enforceOrderInvariants` ignores `today` parameter completely (line 78-79)

- **File:** `src/lib/order-invariants.ts:78-80`
- **What's wrong:** `void today` is a no-op. Function signature
  takes a `today` Date but doesn't use it. Confusing to readers who
  see the param. Tied to P1-32.
- **Fix:** Either implement the documented future invariant or remove
  the param.

---

## Summary

**P0 (14 findings)** — Security/RBAC holes (sites PUT/POST, plots/snags POST,
users routes, restart-decision), broken role check (`ADMIN`), DB-noop
filter (`email: not undefined`), reconcile dev-date drift, parent-rollup
mis-cascade on site assigning, EXPAND_JOB skips invariants, calendar/
working-day unit mix in template helpers.

**P1 (48 findings)** — SSOT drift between calendar-day and working-day
arithmetic across 7+ routes, race conditions on parent/percent
recompute, lateness un-resolve audit gap, cascade weekend-snap noop,
share-token enabled-flag not checked, weather cron tenant-wide spam,
parent rollup orphan handling, cron dev-date authentication bypass,
order invariants TODOs, weekly-digest mis-aggregation, type cast
boilerplate, missing tests for foundational helpers.

**P2 (20 findings)** — Code smell, missing tests on lib/*, audit-log
description-grep idempotency, doc location drift, HTML escape in email
templates, types not augmented for next-auth, untested cascade engine.

Total: 82 findings.

Foundation status: solid in shape — SSOT helpers exist, EventLog
immutability holds, cron auth uses constant-time compare — but the
**RBAC layer has clear holes** (4 P0 routes unguarded or
mis-guarded) and the **working-day vs calendar-day boundary is
inconsistent** across reports + analytics. Highest-leverage fixes:
P0-1 (sites PUT), P0-2 (snags POST), P0-3 (sites POST), P0-4 (dead
ADMIN role), P0-5 (hasPermission vs sessionHasPermission), and the
working-day migration sweep for reports.
