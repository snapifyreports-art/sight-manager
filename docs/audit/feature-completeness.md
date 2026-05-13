# Feature Completeness Audit — May 2026

**Generated:** 2026-05-13 (after batches 1-111, commits e1ae78e -> 4500a10).
**Persona:** Skeptical auditor. Methodology: walk every "claimed shipped" feature in
`MEMORY.md` + every linked handover (v3/v4/v5/v6 + v6 addendum), prove each
end-to-end (code exists -> mounted -> wired -> records the right data -> surfaced
to the right views), classify each gap.

**Classification key:**
- **VERIFIED** - chain holds end-to-end.
- **PARTIAL** - implemented but not mounted/reached/used by a real flow.
- **WIRED-WRONG** - exists but does the wrong thing.
- **GHOST** - claimed in handover but no code found (or code stripped later).
- **HALF-MIGRATED** - old + new code both present, callers split, semantics drift.

This audit specifically targets gaps between MEMORY.md claims and the May-2026 codebase. The
in-repo `docs/audit/site-manager.md`, `bugs-data-integrity.md` etc were written from
finer-grained personas; this audit overlaps with them in places but adds the "what was
claimed shipped vs what's actually live" angle that nothing else covers.

---

## Verified claims (chain holds end-to-end)

These claims walk cleanly from the memory file to working code:

- **PDF library migration finished (batch 86 + 88)** - `src/lib/pdf-builder.ts` is the
  only file in `src/` importing `jspdf` (grep `import.*jspdf` shows just the one match).
  All 4 PDF surfaces routed: `handover-pdf-renderers.ts`, `api/snags/[id]/pdf/route.ts`,
  `api/plots/[id]/handover/route.ts:7,224,310`, `components/programme/SiteProgramme.tsx:957`.
- **JobWeekPanel split (batch 87) - 4 modules** - parent down to 1889 lines,
  `JobPhotoLightbox.tsx` (245), `JobOrdersSection.tsx` (143), `JobContractorRow.tsx` (57),
  `JobPhotosSection.tsx` (232). All imported at `JobWeekPanel.tsx:8-11`.
- **Contractor portal photo upload endpoint (batch 89)** -
  `src/app/api/contractor-share/[token]/photo/route.ts` verifies token + assignment +
  site, uploads to Supabase storage `jobs/<id>/...`, mounted into
  `ContractorJobActionRow.tsx:42-67`.
- **Contractor portal snag sign-off (batch 89)** -
  `src/app/api/contractor-share/[token]/snag-action/route.ts` token-auth, photos+notes+
  status flip in one POST. `SnagSignOffCard.tsx:49` calls it. Tested live - 405/401
  evidence in addendum.
- **Customer push fan-out (batches 64-67)** - `CustomerPushSubscription` model in
  `prisma/schema.prisma:796`; `sendPushToPlotCustomers` in `src/lib/push.ts:191`; called
  from `api/plots/[id]/journal/route.ts:88` and `api/plots/[id]/customer-photos/route.ts:108`.
  `CustomerNotifyToggle` mounted in `app/progress/[token]/CustomerNotifyToggle.tsx`.
- **iCalendar feed (session + token auth, batch 39/43)** -
  `src/app/api/sites/[id]/calendar.ics/route.ts:78-104` accepts both auth modes;
  Subscribe button mounted at `src/components/reports/SiteCalendar.tsx:746-803`.
- **SUPER_ADMIN role (batch 52)** - enum extended in `prisma/schema.prisma:18`;
  `getUserSiteIds` skips filter for SUPER_ADMIN (`src/lib/site-access.ts:15`);
  `sessionHasPermission` bypasses (`src/lib/permissions.ts:167`); default permissions
  set to `[...ALL_PERMISSIONS]` (`permissions.ts:112`).
- **Compliance / Toolbox / NCR tabs (batches 53-55)** - schema models + enums in
  `prisma/schema.prisma:957`, `:987`, `:1016`; APIs at `api/sites/[id]/compliance` etc;
  components `SiteCompliance`, `SiteToolboxTalks`, `SiteNCRs` mounted at
  `SiteDetailClient.tsx:2240-2250`.
- **Plot Quality panel (batches 56-58, 74)** - schema models for `PreStartCheck`,
  `Variation`, `DefectReport`, `PlotDrawSchedule`; UI sub-tabs in
  `src/components/plots/PlotQualityPanel.tsx:80-83` (Pre-start, Variations, Defects,
  Draws); all 4 wired to `/api/plots/[id]/...` endpoints.
- **Predictive completion banner (batch 71)** - endpoint
  `src/app/api/plots/[id]/predictive-completion/route.ts`, `PredictiveCompletionBanner`
  mounted at `PlotDetailClient.tsx:497`. Banner-only - acceptable since failure
  is graceful.
- **Stat-card links (batch 24)** - all 8 cards have `href` in `DashboardClient.tsx:201-269`,
  including comment at `:211-214` acknowledging Total Jobs/In Progress links to
  `/daily-brief` as the closest stand-in. (Bug agent flagged the destination as wrong
  page - that's a P0 in `site-manager.md`, not a feature-completeness gap; the cards
  are linked.)
- **At-Risk panel (batch 25 + 70)** - `AtRiskPanel` defined at
  `DashboardClient.tsx:383`, mounted `:784`, fed `overdueJobs` + `staleSnags` from
  `dashboard/page.tsx`; cost-overrun feed `plotsOverBudget` mounted at `:786-841`.
- **Watch toggle UI (batch 26)** - `WatchToggle` component mounted in site header.
  Endpoints `GET/POST/DELETE /api/sites/[id]/watch` exist with site-access guard.
  (Semantic flip noted under HALF-MIGRATED below - the toggle now muting not watching.)
- **Weekly digest cron (batch 27)** - `vercel.json:24` schedules `0 7 * * 1`;
  `src/app/api/cron/weekly-digest/route.ts` exists, uses `checkCronAuth`.
- **Streamed Supabase fetches in ZIP (batch 28)** - `fetchAsStream` at
  `src/lib/handover-zip.ts:96-108` uses `Readable.fromWeb(res.body)` - no buffering.
- **Forgot password / magic invite (batches 31-32)** - `signResetToken` /
  `verifyResetToken` in `src/lib/share-token.ts:98-124`; pages
  `app/forgot-password`, `app/reset-password/[token]` exist; endpoints
  `api/auth/request-reset`, `api/auth/accept-reset` exist.
- **Daily email deep links (batch 34)** - `cron/daily-email/route.ts:173-227` injects
  `tab=daily-brief`, `tab=programme`, `tab=snags` etc into every chip href.
- **Snag PDF route (batch 36 + 42 + 86)** - `api/snags/[id]/pdf/route.ts:6,76` uses
  `loadJsPdf` + `drawHeader` + `pdfResponse`. Has a download button on SnagDialog.
- **Site photo album (batch 38)** - `api/sites/[id]/photos/route.ts` with cursor
  pagination; `SitePhotoAlbum.tsx:52-62` consumes it; lightbox + filters present.
- **Floating mobile FAB (batch 40)** - `FloatingActions.tsx` mounted in
  `(dashboard)/layout.tsx`; hides on walkthrough. (NB: deep links it generates are
  broken - see GHOST finding.)
- **Sidebar accordion groups (batch 41-42)** - `Sidebar.tsx:43-88` defines three
  groups: Manage Site, Site Reporting, Site Admin. Compliance / Toolbox Talks / NCRs
  / Story slotted in `:81-85`.
- **Site status banners (batch 15)** - banners for ON_HOLD + COMPLETED at
  `SiteDetailClient.tsx:1895-1922` above the tabs. Both explain the consequence.
- **Site Story tab + Handover ZIP synthesizer (pre-session + batch 28+)** -
  `buildSiteStory` in `src/lib/site-story.ts`; both `api/sites/[id]/story/route.ts:49`
  and `lib/handover-zip.ts:127` call it. ZIP folder structure (00_README, 01_Site_Overview,
  02_Plots/Plot_N/.., 03_Contractor_Analysis, 04_Supplier_Analysis, 05_Cost_Analysis,
  06_Reports) matches the v3 claim. Budget + cash-flow + delay PDFs all appended
  (`handover-zip.ts:599,632,704`).
- **Auto-rendered per-plot QR codes** - `PlotQRCode.tsx:46-57` renders on mount via
  `QRCode.toDataURL`; `getPlotQrUrl` from `src/lib/plot-urls.ts`.
- **`/q/[plotId]` redirect** - directory exists at `src/app/q/[plotId]/`.
- **EventLog immutability** - grep `eventLog.(update|delete|deleteMany|updateMany)`
  in `src/` returns zero matches. Append-only contract holds at application level.
- **Push subscription cap of 10** - `src/app/api/push/subscribe/route.ts:19,53,57` -
  cap + evict-oldest logic.
- **Email TOCTOU fix (batch 12)** - `api/email/send/route.ts:26-48` uses
  `resolveKnownRecipient` returning DB canonical email; sends to that.
- **`useConfirm` migration complete** - grep `window.confirm` shows only the helper's
  documentation comment (no callers).
- **Notification preferences include 3 new types** -
  `NotificationsSection.tsx:75-86` adds entries for SNAG_RAISED, DELIVERY_CONFIRMED,
  JOB_MILESTONE; preferences API at `api/notifications/preferences/route.ts:30`.
- **Plot status banner ON_HOLD + COMPLETED** - explained above.
- **Branding API endpoint** - `api/settings/branding/route.ts` GET unauth + PUT
  MANAGE_USERS-gated; CSS variable `--brand-primary` injected into
  `(dashboard)/layout.tsx:33`.
- **Portfolio page** - `app/(dashboard)/portfolio/page.tsx` exists; linked from
  `Sidebar.tsx:100`.
- **Stage-benchmark / delay-trends / weather-loss / profitability / contractor-calendar
  analytics widgets (batches 62-63, 68, 75-76)** - all 5 widgets mounted at
  `AnalyticsClient.tsx:819-824`.
- **Material burndown alerts (batches 59-60)** - endpoint at
  `api/sites/[id]/material-burndown/route.ts:84-105`; UI in
  `SiteQuantsClient.tsx:661`.
- **Snag-tx push hook** - `api/plots/[id]/snags/route.ts:160` fires
  `sendPushToSiteAudience(SNAG_RAISED, ...)`.
- **Delivery-confirmed push hook** -
  `api/orders/[id]/route.ts:629` fires `sendPushToSiteAudience(DELIVERY_CONFIRMED, ...)`.
- **Job-milestone push hook** -
  `api/jobs/[id]/actions/route.ts:285` fires `sendPushToSiteAudience(JOB_MILESTONE, ...)`.
- **Predecessor check uses dates not sortOrder** - `useJobAction.tsx` predecessor check
  is by `endDate < startDate`; matches business-rules doc.
- **Cascade ORDERED orders no longer drift (batch 97b)** - `src/lib/cascade.ts:13-20`
  documents the I3 contract: PENDING shifts, ORDERED locked.
- **enforceOrderInvariants in single + bulk** -
  `api/orders/[id]/route.ts`, `api/sites/[id]/bulk-status/route.ts:125,158`,
  `api/jobs/[id]/actions/route.ts` all route through it.
- **Lateness data model (#191 phase 1, batch 108)** -
  `LatenessEvent` model + enums in `prisma/schema.prisma:1191-1249`;
  `openOrUpdateLateness` + `resolveLateness` in `src/lib/lateness-event.ts`.
- **Lateness daily scanner cron (batch 108)** -
  `src/app/api/cron/lateness/route.ts`; scheduled `30 4 * * *` in `vercel.json:20-22`.
- **Lateness display surfaces (batch 109)** -
  `LatenessSummary.tsx` consumed by `DailySiteBrief`, `JobDetailClient`,
  `PlotDetailClient`, `SiteStoryPanel`, `ContactDetailClient`, `DelayReport`,
  `AnalyticsClient` - all 7 mount points present.
- **Lateness reporting (batch 110)** -
  `api/analytics/lateness/route.ts` exists; LatenessWidget in `AnalyticsClient.tsx:825`;
  delay-report leads with `LatenessSummary`; weekly digest aggregates lateness.
- **Lateness change-delivery picker (batch 111, phase 5)** -
  `OrdersClient.tsx:491-501,563-565,692-708` exposes PUSH_JOB / EXPAND_JOB /
  LEAVE_AS_IS picker; `api/orders/[id]/route.ts:321,387,506` consumes the choice.
- **Plot completion percent SSOT** - 11 mutation routes call `recomputePlotPercent`;
  grep `plot.update({ buildCompletePercent` finds zero direct writes outside the
  helper.
- **Parent job rollup SSOT** - `recomputeParentFromChildren` called from 11 mutation
  routes incl. cascade, delay, signoff, complete, cron reconcile.
- **`useJobAction` is the single start path** - imported by 14 consumers
  (Walkthrough, Daily Brief, Plot Detail, JobsClient, ContractorDaySheets,
  TasksClient, etc.) - every business-rules entry point covered.
- **xlsx pinned + vitest installed** - `package.json:48` pins
  `xlsx-0.20.3.tgz`; `package.json:67` includes `vitest ^4.1.5`;
  `vitest.config.ts` present.
- **All 6 crons configured** - `vercel.json` lists daily-email, notifications,
  weather, reconcile, lateness, weekly-digest. All authenticated via
  `checkCronAuth`.
- **WatchedSite + CustomerPushSubscription + AppSettings + all audit-model schemas
  applied** - schema models in `prisma/schema.prisma` + idempotent apply scripts in
  `scripts/apply-*.ts`.

---

## Findings - partial / wrong / ghost / half-migrated

### P0-1 - Memory claims "Watch ecosystem (#152)" but production is a Mute system

- **Status:** HALF-MIGRATED
- **Claim source:** `MEMORY.md` ("complete watch ecosystem"); `session_handover_may_2026_v6.md`
  section 8 (#152 - Watch this site - Complete ecosystem); `session_handover_v4.md`
  ("Watch ecosystem complete: schema -> API -> toggle -> 4 push hooks").
- **What's actually there:** Batch 103 (commit `3684a5b`, 2026-05-13) silently flipped
  WatchedSite semantics: from "row = subscribed" to "row = MUTED".
  - `src/lib/push.ts:93-179` `sendPushToSiteAudience` now treats WatchedSite as the
    *mute list* (subtract from audience), not the watch list.
  - `src/components/sites/WatchToggle.tsx:7-110` is now a bell/bell-off mute toggle
    (still named WatchToggle for diff cleanliness).
  - `DashboardClient.tsx:314` renamed widget to "Muted sites".
  - `src/app/api/cron/weekly-digest/route.ts:74,86-87` subtracts WatchedSite rows.
  - Migration script `scripts/flip-watch-to-mute.ts` deleted existing rows.
- **What's missing:** Every memory file linked from `MEMORY.md` still describes the
  feature as opt-in "Watch this site" + "weekly digest filters to watched + assigned".
  The handover docs (v3, v4, v5, v6, v6 addendum) all describe the opt-in semantics.
  A future agent who reads MEMORY.md and writes new code will model the opt-in API
  contract and produce silent bugs.
- **Fix:** Update MEMORY.md and every handover doc to reflect the
  opt-out semantics; rename the API endpoint `/api/sites/[id]/watch` to
  `/api/sites/[id]/mute` and rename `WatchedSite` model to `MutedSite`. Keep an
  alias only for backward compat.

### P0-2 - `?action=new` Cmd-K + FAB deep links land on the destination page without opening any dialog

- **Status:** GHOST
- **Claim source:** `MEMORY.md` ("Cmd-K action verbs"); v6 handover #134
  ("Cmd-K verbs - batch 37"); v4 handover ("Cmd-K action verbs (Raise snag / Create
  order / New site / etc.)"); v3 batch 20 introduction.
- **What's actually there:** `src/components/layout/SearchModal.tsx:129-174` defines 8
  verbs that link to URLs like `/sites?action=new`, `/orders?action=new`,
  `/sites/[id]?tab=snags&action=new`, `/suppliers?tab=contractors&action=new`.
  `src/components/shared/FloatingActions.tsx:65-86` uses the same URLs. Grep across
  the whole codebase for `get("action")` or `action === "new"` returns zero matches.
  `SitesClient.tsx`, `OrdersClient.tsx`, `SiteDetailClient.tsx`, supplier components,
  and snag components don't consume `?action=new`. The user clicks "Raise a snag",
  lands on the snags tab with the SnagDialog closed.
- **What's missing:** A consumer of `?action=new` on each destination page that
  auto-opens the create dialog. (`site-manager.md` already P0-flagged this.)
- **Fix:** Each destination page reads `searchParams.get("action") === "new"` and
  triggers `setDialogOpen(true)` on mount. For the per-site snags case
  (`SiteDetailClient`), additionally consume `?plotId=` so the SnagDialog opens
  pre-filled.

### P0-3 - `/api/sites` POST has no permission gate

- **Status:** WIRED-WRONG
- **Claim source:** v3 batch 2 ("RBAC sweep") + v4 ("RBAC sweep across every
  mutating endpoint"); v6 #1-#94 ("All shipped batches 1-12").
- **What's actually there:** `src/app/api/sites/route.ts:37-95` checks
  `auth()` only. No `sessionHasPermission` call, no role check. Any logged-in
  user - including a `CONTRACTOR` role with zero `UserSite` rows - can POST to
  spawn a new site, become its assignedToId, and gain a UserSite grant via the
  in-transaction createMany.
- **What's missing:** A `MANAGE_USERS`-style gate before the create, mirroring the
  branding PUT pattern in `api/settings/branding/route.ts:38`.
- **Fix:** Add `if (!sessionHasPermission(session.user, "MANAGE_USERS"))` (or a new
  `CREATE_SITES` permission) before the transaction.

### P0-4 - `/api/sites/[id]` PUT has no RBAC

- **Status:** WIRED-WRONG
- **Claim source:** v3 batch 2 RBAC sweep, v6 #1-#94.
- **What's actually there:** `src/app/api/sites/[id]/route.ts:66-184` checks
  `auth()` only. No `canAccessSite`, no permission check. Any logged-in user can:
  rename any site, flip status (which stamps `completedAt` + excludes from active-site
  crons), reassign to themselves (auto-grants UserSite). DELETE on the same file
  has the access check at `:210-221` but PUT is missing the equivalent.
- **What's missing:** Same `canAccessSite` gate that DELETE uses.
- **Fix:** Wrap PUT in the same guard as DELETE.

### P0-5 - `/api/plots/[id]/snags` POST has no canAccessSite check

- **Status:** WIRED-WRONG
- **Claim source:** v3 batch 2 RBAC sweep.
- **What's actually there:** `src/app/api/plots/[id]/snags/route.ts:46-174` POST
  authenticates the session but never feeds `plot.siteId` (looked up at
  `:72-79`) into `canAccessSite`. A Site Manager assigned to Site A can POST
  to a plot on Site B; the snag is created with site B EventLog entries and
  a push fires to site B's audience.
- **What's missing:** `canAccessSite` after the plot lookup, before the create.
- **Fix:** Mirror the snag PATCH/DELETE pattern in
  `api/snags/[id]/route.ts:43-52`.

### P0-6 - Contractor scorecard endpoint has no site-access scope

- **Status:** WIRED-WRONG
- **Claim source:** v6 #179 ("Contractor scorecard - batch 51"); v4 batch 51.
- **What's actually there:** `src/app/api/contacts/[id]/scorecard/route.ts:22-56`
  only checks `auth()`. It aggregates job/snag stats across *every* site the
  contractor has touched - no `siteAccessFilter` applied. A Site Manager scoped
  to Site A can fetch the scorecard for a contact who's also active on Site B,
  including job names, plot IDs, days-late metrics from Site B.
- **What's missing:** Apply `siteAccessFilter` to the `prisma.jobContractor.findMany`
  + `prisma.snag.findMany` so the scorecard only aggregates the caller's
  accessible sites.
- **Fix:** Inject the filter into both queries; doc the change in the comment block.

### P0-7 - User-management routes use `hasPermission` not `sessionHasPermission` (SUPER_ADMIN bypassed)

- **Status:** HALF-MIGRATED
- **Claim source:** v6 #201 ("SUPER_ADMIN role - batch 52");
  `src/lib/permissions.ts:160-169` notes "SUPER_ADMIN bypasses every permission
  gate alongside CEO + DIRECTOR".
- **What's actually there:** `src/app/api/users/route.ts`,
  `src/app/api/users/[id]/route.ts`, `src/app/api/users/[id]/permissions/route.ts`
  all call bare `hasPermission(permissions, key)` instead of
  `sessionHasPermission(user, key)`. The bare helper does NOT short-circuit
  for SUPER_ADMIN / CEO / DIRECTOR - it just checks the permission array.
  Because CEO/DIRECTOR default permissions include MANAGE_USERS the bug is
  invisible in dev, but a SUPER_ADMIN without an explicit MANAGE_USERS grant
  silently gets 403 from /api/users.
- **What's missing:** Migrate to `sessionHasPermission(session.user, ...)` in all
  three routes.
- **Fix:** s/`hasPermission(session.user.permissions, ...)`/`sessionHasPermission(session.user, ...)`/

### P0-8 - Mobile programme rebuild reverted but memory still claims it's done

- **Status:** GHOST + HALF-MIGRATED
- **Claim source:** `MEMORY.md` ("Mobile programme rebuild on mobile (week-strip
  layout)"); v6 section 7 ("Mobile programme rebuild - fully done (batch 85)");
  v5 batch 85 ("New MobileProgramme component - vertical list of plot cards...");
  v6 #23 ("batch 85"). Three handovers describe a responsive split that no
  longer exists.
- **What's actually there:** Batches 99 + 101 (commits `fb756e3` + `95500eb`)
  reverted the mobile split entirely. `MobileProgramme.tsx` and
  `MobileProgrammeGantt.tsx` were deleted (batch 101 commit message
  explicitly: "MobileProgramme.tsx and MobileProgrammeGantt.tsx deleted —
  nothing imports them"). `SiteProgramme.tsx:1152-1158` documents the new
  rule: "Desktop Gantt renders at every viewport". `md:hidden` / `hidden md:block`
  wrappers are gone.
- **What's missing:** Memory still references the deleted components. A future
  agent following the v6 handover will look for `MobileProgramme.tsx` and be
  confused.
- **Fix:** Update MEMORY.md + handover docs to note the revert. The single-Gantt
  approach is acceptable on its own; just stop claiming the split exists.

### P0-9 - Cmd-K + Floating Actions "Raise a snag" silently misses snag context on site-less pages

- **Status:** PARTIAL
- **Claim source:** v6 #134, v4 batch 37 + batch 40 mobile FAB.
- **What's actually there:** When the user is on a page with no
  site context (e.g. /dashboard, /portfolio, /analytics), the "Raise a snag" verb
  routes to `/sites?pickFor=snags`. `SitesClient.tsx:104-109` consumes
  `pickFor` and forwards to `/sites/[id]?tab=snags`. But - per P0-2 above - the
  destination page doesn't open the SnagDialog. So the flow is:
  "Type 'snag', click verb -> click any site -> end up on snags tab with no
  dialog." Two extra clicks instead of one tap and a dialog.
- **What's missing:** Either a single-active-site picker that auto-opens the
  dialog after pick, or the P0-2 fix that auto-opens the dialog from
  `?action=new&plotId=`.
- **Fix:** Land P0-2 first; pickFor flow then becomes a one-click pick that
  opens the right dialog.

### P0-10 - Lateness attribution UI missing contractor picker

- **Status:** PARTIAL
- **Claim source:** Lateness as first-class concept #191 (memory addendum +
  batches 108-111). Schema + API + display surfaces all built and verified.
- **What's actually there:** `prisma/schema.prisma:1191-1249` includes
  `attributedContactId` + `attributedContact`; `api/lateness/[id]/route.ts:39-41`
  PATCH accepts it; LatenessSummary DTO surfaces it. But
  `src/components/lateness/LatenessSummary.tsx` (around lines 288-328 edit
  block) only renders `reasonCode` (select) and `reasonNote` (textarea) - no
  contractor picker. Reason inference at lateness-event.ts auto-attributes some
  cases, but manager override of attribution is impossible from the UI.
- **What's missing:** Typeahead contractor picker (Contact where type=CONTRACTOR)
  in the edit block, wired to the existing PATCH endpoint.
- **Fix:** Add a contractor input. (Bug agent's `site-manager.md` already P0-flagged this.)

### P0-11 - EXPAND_JOB lateness branch bypasses cascade engine I7 conflict checks

- **Status:** WIRED-WRONG
- **Claim source:** Batch 111 "phase 5 of #191 - Change Delivery Date impact
  picker": "PUSH_JOB invokes the existing cascade engine".
- **What's actually there:** `src/app/api/orders/[id]/route.ts:506-577` EXPAND_JOB
  branch does its own custom successor shift via `addWorkingDays(j.startDate!,
  deltaWD)` instead of calling `calculateCascade`. The cascade engine's I7
  "no silent past-clamp" contract isn't enforced for EXPAND_JOB; an EXPAND that
  would push a successor's startDate before another job's endDate doesn't trigger
  a conflict.
- **What's missing:** Route EXPAND_JOB through `calculateCascade(today, jobs,
  orders, triggerJobId, newJobEnd)` like PUSH_JOB does at the same file.
- **Fix:** Call `calculateCascade` from the EXPAND_JOB branch.

### P0-12 - White-label CSS variable injected but never consumed

- **Status:** PARTIAL
- **Claim source:** v6 #56 White-label foundation (batches 78-80); v4
  ("dashboard layout injects --brand-primary CSS variable").
- **What's actually there:** `src/app/(dashboard)/layout.tsx:33` sets the
  `--brand-primary` CSS variable from AppSettings. Grep for
  `var(--brand-primary)` across `src/` shows ZERO consumers in CSS or component
  styles. Logo URL and brandName *are* read on the login page, but
  primaryColor isn't actually applied anywhere - changing it in Settings ->
  Branding produces no visible change.
- **What's missing:** Tailwind config `theme.extend.colors.brand = "var(--brand-primary)"`
  + s/`bg-blue-600`/`bg-brand`/ on key surfaces (primary buttons, links).
- **Fix:** Two-line tailwind config edit + sweep of consumers.

### P0-13 - `?snagId=` query param universally generated but never consumed

- **Status:** GHOST
- **Claim source:** Implicit - every snag link in the app generates
  `?tab=snags&snagId=<id>` URLs (ContactDetailClient, JobDetailClient, DailyBrief,
  ContractorComms, SearchModal Snag results, walkthrough, lateness URLs) so the
  intent is clear - clicking should focus or open that snag.
- **What's actually there:** Grep `searchParams.get("snagId")` returns zero matches
  in `SnagList.tsx`, `SiteDetailClient.tsx`, or any snag component. The user lands
  on the snags tab; the deep link is meaningless.
- **What's missing:** Either auto-scroll-to-snag or auto-open SnagDialog for the
  matching snagId.
- **Fix:** `SnagList.tsx` reads `?snagId=` and scrolls/highlights the row;
  `SiteDetailClient` reads it and opens the SnagDialog.

### P1-14 - Voice notes + photo annotations are schema + API only

- **Status:** PARTIAL (explicitly acknowledged in v6)
- **Claim source:** v6 #49 (Voice notes) and #50 (Photo annotation) - both
  marked "Schema + API; UI dropped".
- **What's actually there:** Models `VoiceNote`, `PhotoAnnotation` in
  `prisma/schema.prisma:1255-1292`. Endpoints
  `/api/plots/[id]/voice-notes` and `/api/photos/[photoId]/annotations` exist
  and pass RBAC. NO UI components found - grep for `VoiceNote*` or
  `PhotoAnnotation*` in `src/components/` returns zero matches.
- **What's missing:** Acknowledged by memory; not a "claim mismatch" but worth
  surfacing as a P1 because the schema/API surface invites a developer to
  hook them up - and the table will silently never receive writes.
- **Fix:** Either build MediaRecorder + canvas UIs (substantial work) or hide
  the table entirely from the schema until the UI is built.

### P1-15 - Site-access SSOT not enforced in 4 unguarded routes

- **Status:** PARTIAL
- **Claim source:** "Site-scoped lists: pass through getUserSiteIds / canAccessSite.
  Never iterate plots and filter in app-code." (v6 section 6 conventions).
- **What's actually there:** 99 routes have one of the helpers (verified via
  Grep). But several pages don't: the share-token customer endpoint
  (intentional - public auth), the contractor share endpoints (token-auth),
  and notably:
  - `/api/photos/[photoId]/annotations` (claimed in v6 #50)
  - `/api/plots/[id]/predictive-completion`
  - `/api/contacts/[id]/scorecard` (P0-6)
  - `/api/users/*` (P0-7)
- **What's missing:** Audit pass for the routes above; for non-token routes,
  ensure access is verified.
- **Fix:** Spot-check each, add guards or document intent.

### P1-16 - Push call sites not consistently fire-and-forget

- **Status:** HALF-MIGRATED
- **Claim source:** v6 section 6 conventions: "All push calls are
  fire-and-forget: `void sendPushToX(...).catch(console.warn)`".
- **What's actually there:** Verified via grep `sendPushToUser|Site|Plot|All`.
  Some callers are `void sendPushToSiteAudience(...)` (correct), but several
  callers just call without void wrap or catch:
  - `bulk-status/route.ts:324,345` plain calls
  - cron handlers push into `notifications[]` array then `Promise.allSettled` later
    (technically fire-and-forget but inconsistent shape)
  - `cron/weather/route.ts:80,112` uses `await`, blocking weather generation
    on push failures
- **What's missing:** Consistent void+catch pattern; tighten the cron `Promise.allSettled`
  pattern by replacing it.
- **Fix:** Mechanical sweep.

### P1-17 - `/jobs` index page doesn't exist, only `/jobs/[id]`

- **Status:** PARTIAL
- **Claim source:** v6 #143 ("Dashboard stat-card links - batch 24"); v4
  ("Dashboard stat cards linked to relevant views").
- **What's actually there:** Dashboard stat cards link "Total Jobs" + "Jobs In
  Progress" to `/daily-brief`. Code comment at `DashboardClient.tsx:212-214`
  acknowledges: "Pre-fix Total Jobs + Jobs In Progress were dead numbers...
  Linking to the cross-site Daily Brief is the closest 'show me the jobs'
  page we have today".
- **What's missing:** A real `/jobs?status=IN_PROGRESS` index page so the click
  matches the user's expectation.
- **Fix:** Build `app/(dashboard)/jobs/page.tsx` - the data is already in the
  query at dashboard/page.tsx; just reuse the shape.

### P1-18 - Site detail default tab lands on "plots" not "daily-brief"

- **Status:** PARTIAL
- **Claim source:** v6 ("Daily Brief, Programme..." listed as first tabs in the
  sidebar order - implies Daily Brief should be the entry point).
- **What's actually there:** `SiteDetailClient.tsx` defaults to "plots" if no
  ?tab=. Daily Brief is one of nine tabs under the Manage Site sidebar group.
  (Bug agent's site-manager.md P0-flagged this in detail.)
- **What's missing:** Change `useState(initialTab || "plots")` to `daily-brief`
  + matching sidebar fallback.
- **Fix:** Two-line edit. site-manager.md has the exact fix.

### P1-19 - JobActionStrip Mode A hides primary action on mobile

- **Status:** WIRED-WRONG (regression after spec)
- **Claim source:** Mode B exists exactly to surface a primary action; some
  surfaces use Mode A and bury the action.
- **What's actually there:** `JobActionStrip.tsx:22` comment explicitly notes:
  "anything that can require attention shouldn't be collapsed". But
  `DailySiteBrief.tsx:1939-1968, 1948-1956, 2162-2183` (Finishing today + Awaiting
  Sign Off + In Progress rows) use Mode A.
- **What's missing:** Migration to Mode B with the right primary action.
- **Fix:** Three call-site edits.

### P1-20 - "Total Spend" definition drift across views

- **Status:** HALF-MIGRATED
- **Claim source:** SSOT principle: "If two endpoints compute the same thing,
  extract one helper that both call" - feedback_unify_dont_duplicate.md.
- **What's actually there:** Budget Report sums DELIVERED orders; Cash Flow
  uses ORDERED+DELIVERED; Profitability subtracts cost from revenue per plot;
  Analytics uses its own aggregation. No `report-totals.ts` SSOT helper.
- **What's missing:** A canonical `lib/report-totals.ts` helper with one
  function per cost concept (committed, delivered, total).
- **Fix:** Extract.

### P1-21 - "Days late" computation drift

- **Status:** HALF-MIGRATED
- **Claim source:** SSOT. Memory v6 has `src/lib/lateness.ts` "single source of
  truth for is-this-job-late semantics" + working-day arithmetic.
- **What's actually there:** `lateness.ts` is used by 6 callers (dashboard,
  daily-brief, analytics, heatmap, tasks, internal lib). But Contractor
  Scorecard, Site Story variance, and Handover ZIP renderers have their own
  date-late math (some calendar, some working-day). When Keith adds a
  contractor scorecard column "Avg days late" it can disagree with the
  same plot's days-late on the daily brief.
- **What's missing:** Migrate scorecard + site-story to `workingDaysEndOverdue`.
- **Fix:** Spot-fix.

### P1-22 - `/tasks` still has a real underlying API route (api/tasks)

- **Status:** HALF-MIGRATED
- **Claim source:** v6 ("daily-brief (replaces /tasks)").
- **What's actually there:** `src/app/(dashboard)/tasks/page.tsx` is just a
  redirect to /daily-brief (good). But `src/app/api/tasks/route.ts` still
  exists and is consumed by... let me check - actually the API route is needed
  for the all-sites daily brief data. Branding's a bit confusing but it
  works.
- **What's missing:** Either rename `api/tasks` -> `api/daily-brief/all-sites` or
  consolidate. Mild tech debt; not blocking.
- **Fix:** Optional rename.

### P1-23 - Snag request-signoff uses `sendPushToAll` not `sendPushToSiteAudience`

- **Status:** WIRED-WRONG
- **Claim source:** v6 section 6 conventions: "Per-site events ->
  `sendPushToSiteAudience`. Pick the most specific NotificationType."
- **What's actually there:** `api/snags/[id]/request-signoff/route.ts:76` and the
  contractor-share equivalent `contractor-share/[token]/snag-action/route.ts:141`
  both use `sendPushToAll("JOBS_READY_FOR_SIGNOFF", ...)`. The signoff is a
  per-site event - using sendPushToAll spams every tenant user.
- **What's missing:** Migrate to `sendPushToSiteAudience(siteId, "JOBS_READY_FOR_SIGNOFF", ...)`
  in both routes.
- **Fix:** Two-route migration.

### P1-24 - "Snag tx wrap deferred" never resolved

- **Status:** PARTIAL (explicitly deferred)
- **Claim source:** v6 section 8 #77 "Snag tx wrap - Deferred (too tangled -
  documented in batch 7 message)".
- **What's actually there:** `api/plots/[id]/snags/route.ts:46-174` still
  contains the multi-step create-snag flow without a `prisma.$transaction`
  wrap: snag create, photo creates, EventLog create, JobAction create, push
  fire. Photos failing mid-create leaves orphaned rows.
- **What's missing:** A transaction wrap covering everything inside the route
  except the push.
- **Fix:** Single `prisma.$transaction(...)` around the whole flow.

### P1-25 - daily-email cron has no per-user scoping

- **Status:** WIRED-WRONG
- **Claim source:** v6 ("Daily email deep links - batch 34").
- **What's actually there:** `api/cron/daily-email/route.ts` sends one email per
  user-with-an-email summarizing **every** site's brief, regardless of which
  sites that user actually has access to. A CEO/DIRECTOR seeing this is fine;
  a Site Manager assigned to one site gets the cross-site dump too.
- **What's missing:** Filter site list by `getUserSiteIds(userId, role)` per
  user when building the email.
- **Fix:** Wrap the per-user email loop with site-scoping.

### P1-26 - `enforceOrderInvariants` not called inside cascade engine

- **Status:** HALF-MIGRATED
- **Claim source:** Batch 100b "full date-SSOT sweep": "Every order-mutation
  flow now routes its proposed changes through enforceOrderInvariants".
- **What's actually there:** `src/lib/order-invariants.ts:24` "Every
  order-mutation flow now routes...". But `src/lib/cascade.ts` (the engine
  itself, computing PENDING order date shifts) doesn't call it. Cascade
  produces new `dateOfOrder` + `expectedDeliveryDate` without re-validating
  INV-1/2/3. Side effect: a pull-forward cascade can produce
  dateOfOrder > expectedDeliveryDate that no later writer fixes.
- **What's missing:** Call `enforceOrderInvariants` on the proposed updates
  output of `calculateCascade`.
- **Fix:** Mechanical.

### P1-27 - "All push calls fire-and-forget" verified - but multiple use the wrong NotificationType

- **Status:** WIRED-WRONG
- **Claim source:** v6 section 6 conventions: "Pick the most specific
  NotificationType: SNAG_RAISED for snags / DELIVERY_CONFIRMED for material
  deliveries / JOB_MILESTONE for job start/complete/signoff / Anything else
  -> NEW_NOTES_PHOTOS or one of the existing types".
- **What's actually there:** 
  - `api/cron/notifications/route.ts:170` uses `JOBS_STARTING_TODAY` for the
    Daily Brief push - the brief isn't a job-starting event so `NEW_NOTES_PHOTOS`
    or a new `DAILY_BRIEF` type would be more accurate.
  - Contractor share snag-action uses `JOBS_READY_FOR_SIGNOFF`. The event is
    sign-off-requested-by-contractor, semantically distinct.
- **What's missing:** A dedicated `DAILY_BRIEF_READY` NotificationType plus
  consistent use of types.
- **Fix:** Schema + apply script.

### P2-28 - `?tab=` deep links pollute back-button history

- **Status:** PARTIAL
- **Claim source:** project_template_ssot.md: "Always replace, never push -
  push pollutes back-button history".
- **What's actually there:** SiteDetailClient + SettingsClient mostly use
  router.replace, but a few sites use Link `href` which pushes (e.g. snag
  deep links from JobDetail). Mild.
- **Fix:** Convert specific routes.

### P2-29 - Subscribe to calendar button is hard to find

- **Status:** PARTIAL
- **Claim source:** v6 #59 / #189 iCal feed + Subscribe button (batch 43).
- **What's actually there:** Subscribe button exists at
  `SiteCalendar.tsx:746`, mounted at `:282-287`. Only reachable by navigating
  to Site -> Site Reporting -> Calendar tab. There's no call-out elsewhere
  ("Share schedule with contractor" affordance from Contractor Comms,
  for instance).
- **Fix:** Surface the button from Contractor Comms tab too.

### P2-30 - Empty state coaches present but inconsistent

- **Status:** PARTIAL
- **Claim source:** v6 #39 ("Empty state coaches - batch 16").
- **What's actually there:** 15 components have "no X yet" messaging. Coverage
  isn't 100% - some report screens (Cash Flow, Budget) just render an empty
  table.
- **Fix:** Round out coverage.

### P2-31 - Notifications page calls /tasks redirect-page link

- **Status:** WIRED-WRONG
- **Claim source:** Tasks page now redirects to /daily-brief.
- **What's actually there:** `cron/notifications/route.ts:192` snag-reinspection
  URL is `/tasks`. Hits the redirect but adds latency + an extra hop.
- **Fix:** s/`/tasks`/`/daily-brief`/.

### P2-32 - `SiteProgramme.tsx` still uses inline `differenceInWorkingDays` (documented exception)

- **Status:** PARTIAL (explicitly documented)
- **Claim source:** `src/lib/README.md:46` calls out "Site Programme cells - the
  three remaining `differenceInWorkingDays` calls are partial-week pixel math".
- **What's actually there:** Acknowledged exception. Risk: future contributors
  see the inline math and write more.
- **Fix:** Either extract a `cellPixelOffset` helper for the partial-week math,
  or accept the documented exception.

### P2-33 - `GanttChart.tsx` parent/leaf grouping still local (documented exception)

- **Status:** PARTIAL (explicitly documented)
- **Claim source:** `src/lib/README.md:39-44` explicitly states the grouping
  "COULD be replaced with buildJobTimeline's parentJobs / leafJobs arrays —
  left in place because the existing grouping is exercised by snapshot tests".
- **Fix:** Migration is risky; accept the exception, but add a TODO with
  pointer to test fixtures.

### P2-34 - `apply-template-helpers.ts` `computeJobEndDate` uses `addWeeks` + `addDays` (calendar-day fallback)

- **Status:** PARTIAL
- **Claim source:** project_cascade_rules.md - "ALL schedule shifts use working
  days".
- **What's actually there:** `apply-template-helpers.ts:72-83` falls back to
  `addWeeks(plotStartDate, startWeek - 1)` + `addDays(addWeeks(...), 6)` -
  calendar-day spans. For week-based legacy templates this matches the
  template intent (5-day week packed into 7 calendar days) but it produces
  job rows whose endDate is a Sunday when startWeek=1 + duration=5 days.
  Subsequent calls to `snapToWorkingDay(forward)` clean this up, so the user
  doesn't see it.
- **Fix:** Already covered by snap; document the snap dependency.

### P2-35 - JobsClient toast styles not consistent with rest of app

- **Status:** PARTIAL
- **Claim source:** Memory v6 toast system convention - "useToast" hook.
- **What's actually there:** JobsClient uses the global toast hook; mostly fine.
  Some legacy toast colors don't match the new design system.
- **Fix:** Visual polish.

### P2-36 - Toast system has 3 coexisting variants (caught by UX agent)

- **Status:** HALF-MIGRATED
- **Claim source:** Cross-reference - `docs/audit/ux-mobile.md` flags it.
- **What's actually there:** Three toast implementations in the codebase.
- **Fix:** Out of scope for this audit - flagged for cross-reference.

### P2-37 - `/api/sites/[id]/calendar.ics` token TODO comment says "future batch"

- **Status:** GHOST (in comment, not in functionality)
- **Claim source:** Code comment at line 25-26: "we accept either a session
  cookie OR a `?token=...` query param ... (TODO: future batch). For now this
  is session-only".
- **What's actually there:** The comment is outdated. The token-auth flow ships
  at `:78-104` exactly as the memory claims (batches 39+43). The TODO comment
  is stale.
- **Fix:** Update the comment.

### P2-38 - `cron/weather` uses `await sendPushToAll` (blocking)

- **Status:** WIRED-WRONG
- **Claim source:** Convention - pushes are fire-and-forget.
- **What's actually there:** `cron/weather/route.ts:80,112` uses `await`,
  blocking subsequent work on push failures.
- **Fix:** Drop the `await` + add `.catch(...)`.

### P2-39 - Reset password page exists but rate-limit not visible

- **Status:** PARTIAL
- **Claim source:** v3 batch 31 "Generic 200 to prevent enumeration".
- **What's actually there:** `api/auth/request-reset/route.ts` returns 200
  regardless of whether the email exists - good. No visible per-IP rate limit
  though; brute-force enumeration of reset tokens is fast.
- **Fix:** Add a rate limit.

### P2-40 - `/api/email/send` blocks emails to non-tenant addresses (good) but error message is vague

- **Status:** PARTIAL
- **Claim source:** v6 batch 12 TOCTOU + canonical email lookup.
- **What's actually there:** Returns 403 "Recipient must be an existing contact
  or supplier email". User who's trying to email a fresh subcontractor doesn't
  know they need to add them as a Contact first.
- **Fix:** Surface "Click here to add this email as a contact" CTA.

### P2-41 - Lateness UI tooltip text doesn't say what working-day means

- **Status:** PARTIAL
- **Claim source:** working-days.ts is the SSOT helper; LatenessSummary doesn't
  surface the working-day vs calendar-day distinction.
- **What's actually there:** Lateness rows say "X working days late" but no
  tooltip explains the convention (Mon-Fri only).
- **Fix:** One-line tooltip.

### P2-42 - `api/contacts` POST gated by MANAGE_ORDERS but contractor add CTA in CmdK doesn't show "you need permission"

- **Status:** PARTIAL
- **Claim source:** v6 batch 12 RBAC tightening.
- **What's actually there:** Endpoint correctly returns 403; UI doesn't preempt
  by hiding the verb for users without MANAGE_ORDERS.
- **Fix:** SearchModal + FloatingActions hide verbs based on session permissions.

### P2-43 - SiteDocument has category field but Compliance documents don't enforce category

- **Status:** PARTIAL
- **Claim source:** Compliance feature uses SiteDocument for linked docs;
  the category should be e.g. INSURANCE / PERMIT / CDM.
- **What's actually there:** No validation on document.category at the API
  level. Free string.
- **Fix:** Enum or check constraint.

### P2-44 - Reconcile cron doesn't validate Lateness rows

- **Status:** PARTIAL
- **Claim source:** Reconcile is the "nightly safety net" for cached fields.
- **What's actually there:** `cron/reconcile` recomputes `Plot.buildCompletePercent`
  + parent rollups; doesn't sweep open LatenessEvent rows for "target since
  resolved but row not closed" - that's done by `cron/lateness` only.
- **Fix:** Cross-check; possibly merge the two crons.

### P2-45 - `/api/photos/[photoId]/annotations` 200KB cap claim isn't enforced visibly

- **Status:** PARTIAL
- **Claim source:** v6 ("PhotoAnnotation - strokes is opaque JSON, capped at 200KB").
- **What's actually there:** Code does check string length; user-facing error
  doesn't mention the 200KB cap, just says generic 400.
- **Fix:** Better error message.

### P2-46 - `Subscribe to calendar` button auto-opens browser when clipboard fails

- **Status:** PARTIAL
- **Claim source:** Calendar subscribe UX.
- **What's actually there:** `SiteCalendar.tsx:768-772` falls back to
  `window.open(url, "_blank")` on clipboard failure - this opens the .ics URL
  in a new tab, which browsers tend to download as a file. Confusing for the
  user who expected the URL on their clipboard.
- **Fix:** Show a copyable input or a "click to copy" affordance.

### P2-47 - `api/sites/[id]/contractor-comms/share` exists - share-link disable toggle pending?

- **Status:** PARTIAL
- **Claim source:** v3 queued "#10 Per-contractor share-link disable toggle".
- **What's actually there:** Share endpoint exists; toggle never built.
- **Fix:** Build the UI.

### P2-48 - Weekly digest cron's "watched + assigned" comment outdated

- **Status:** HALF-MIGRATED (semantic doc)
- **Claim source:** v5 ("Weekly digest filters to watched + assigned sites").
- **What's actually there:** `cron/weekly-digest/route.ts:52,73-87` explicitly
  notes "WatchedSite rows now mean MUTED" - the comment is updated. But
  external docs (memory v3/v4/v5/v6) still describe pre-flip behavior.
- **Fix:** Update external docs.

### P2-49 - JobAction notes is rendered verbatim in EventLog descriptions (XSS surface)

- **Status:** WIRED-WRONG (caught by bug agent)
- **Claim source:** Cross-reference - audit-may-2026-final.md P0-8.
- **What's actually there:** Contractor share `snag-action` includes notes in
  EventLog description; rendered server-side as JSX text content (escapes
  fine), but the daily email could render same content unescaped.
- **Fix:** Audit the daily email template.

### P2-50 - "All schema applied via raw SQL apply-* scripts" - some scripts named ambiguously

- **Status:** PARTIAL
- **Claim source:** v6 section 6 conventions.
- **What's actually there:** Scripts under `scripts/apply-*.ts` are correctly
  named for new tables; some scripts under `scripts/` are migrations + repairs
  not schema (e.g. `flip-watch-to-mute.ts`, `backfill-skewed-ordered-deliveries.ts`).
  Memory doc could clarify.
- **Fix:** Doc only.

### P2-51 - `getServerCurrentDate(req)` exists but a few cron handlers still use `new Date()`

- **Status:** HALF-MIGRATED
- **Claim source:** v6 conventions: "All cron handlers route through
  getServerCurrentDate(req)".
- **What's actually there:** Verified for `cron/notifications`, `cron/lateness`,
  `cron/weekly-digest`, `cron/reconcile`. Need to spot-check `cron/weather`
  and `cron/daily-email`.

### P2-52 - "Audit log immutability documented as append-only contract" - no DB trigger

- **Status:** PARTIAL (explicitly documented in schema comment)
- **Claim source:** v6 #74 ("EventLog immutability - batch 9"). Schema
  comment at prisma/schema.prisma:1338-1356: "Code only ever calls
  prisma.eventLog.create(). No update / delete routes exist anywhere ...
  An explicit DB-level CHECK / trigger isn't added because Prisma is the
  only thing that talks to this table".
- **What's actually there:** Application-layer enforcement, not DB.
- **Fix:** Optional DB-level rule via Postgres trigger.

### P2-53 - `MEMORY.md` index doesn't include `lateness-event.ts` helper

- **Status:** PARTIAL (doc gap)
- **Claim source:** Memory rule: "If a helper for what you need doesn't exist,
  add one here, document it in src/lib/README.md".
- **What's actually there:** `src/lib/lateness-event.ts` and `src/lib/lateness.ts`
  are not listed in `src/lib/README.md`. Future contributor won't find them.
- **Fix:** Add to README.

### P2-54 - 89 batches shipped per memory, actual 111 - memory doesn't list batches 90-111

- **Status:** HALF-MIGRATED
- **Claim source:** MEMORY.md says "89 batches shipped".
- **What's actually there:** Git log shows commits up to batch 111 (commit
  4500a10). Twenty-two batches are unaccounted for in any handover doc -
  including the lateness work (108-111), the mute flip (103), the mobile
  programme revert (101), and several Daily Brief regression fixes (104-107).
- **Fix:** Write v7 handover.

### P2-55 - `EVENT_TYPE LATENESS_OPENED / LATENESS_RESOLVED` exists in enum but no consumers

- **Status:** PARTIAL
- **Claim source:** Schema enum `EventType` at prisma/schema.prisma:108-114.
- **What's actually there:** `lateness-event.ts:openOrUpdateLateness` does emit
  `LATENESS_OPENED` events; `resolveLateness` emits `LATENESS_RESOLVED`. Site
  story + event filter UIs need to surface them.
- **Fix:** Ensure timeline UI renders these distinctively.

### P2-56 - `prefers-reduced-motion` rule in globals.css

- **Status:** VERIFIED to exist; PARTIAL coverage
- **Claim source:** v3 batch 3 #15.
- **What's actually there:** Global rule present. Some custom animations
  bypass it (Lucide spinners with className="animate-spin" - which Tailwind
  honors but some inline CSS doesn't).
- **Fix:** Spot-check inline keyframes.

### P2-57 - `feedback_check_all_views.md` rule not fully applied in lateness

- **Status:** PARTIAL
- **Claim source:** Keith's "Check all views" rule.
- **What's actually there:** Lateness shown in 7 surfaces verified, but
  Walkthrough doesn't surface a "this plot has open lateness" badge.
- **Fix:** Add to Walkthrough.

### P2-58 - The reference doc `reference_sight_manager_data_views.md` is 46 days old

- **Status:** PARTIAL (doc drift)
- **Claim source:** "After any data change, mentally trace every component that
  reads that data."
- **What's actually there:** The reference doc predates lateness, draws,
  variations, defects, plot quality - none of which have an "all consuming
  views" map.
- **Fix:** Refresh.

### P2-59 - "Cmd-K verb" claim implies typeahead but it's a substring match

- **Status:** WIRED-WRONG (mild)
- **Claim source:** v6 #134.
- **What's actually there:** SearchModal verb matching uses `String.includes(q)`,
  not fuzzy match. Typo "snog" doesn't match "snag".
- **Fix:** Optional fuse.js.

### P2-60 - Photos endpoint accepts FormData without explicit MIME check

- **Status:** PARTIAL
- **Claim source:** Convention - file uploads should validate.
- **What's actually there:** `contractor-share/[token]/photo/route.ts:97`
  uses `file.type || "image/jpeg"` - sets a default if missing. Doesn't
  validate that the file *is* an image.
- **Fix:** Explicit MIME check.

### P2-61 - "Plot Detail Gantt + Site Programme cells - intentionally not migrated" still leaves cells with calendar-day math

- **Status:** PARTIAL (documented)
- **Claim source:** `src/lib/README.md:33-52`.
- **What's actually there:** OK as documented. The risk: future view that
  consumes plot-detail cells will copy the local math.
- **Fix:** Doc reinforcement.

### P2-62 - "Wizard step changes announced via polite live-region" untestable claim

- **Status:** PARTIAL
- **Claim source:** v3 batch 3 #37.
- **What's actually there:** Code in CreateSiteWizard does include
  aria-live="polite" attributes. Manual testing not done.
- **Fix:** Test on actual screen reader.

### P2-63 - Site Closure tab vs Handover ZIP tab confusion

- **Status:** PARTIAL
- **Claim source:** Sidebar has "Site Closure" as last admin tab.
- **What's actually there:** SiteDetailClient renders the handover assembly
  under that tab; tab label says "Site Closure" but the action button is
  "Generate Handover ZIP". Minor naming mismatch.
- **Fix:** Either rename tab to "Handover" or button to "Site Closure".

### P2-64 - `MEMORY.md` says vitest "infra installed" but only 2 tests

- **Status:** PARTIAL
- **Claim source:** v3 ("vitest installed; 14 fixture tests + 1 snapshot
  test in job-timeline.test.ts").
- **What's actually there:** Verified 2 files. New SSOT helpers (lateness,
  order-invariants, parent-job, plot-percent) have no tests.
- **Fix:** Add tests for every SSOT helper.

### P2-65 - WatchedSitesPanel hidden when no mutes - but new users don't know mute exists

- **Status:** PARTIAL
- **Claim source:** Mute UX.
- **What's actually there:** `WatchedSitesPanel` returns null when `sites.length === 0`.
  New users get no introduction to the mute feature. They might silently get
  spammed and not know how to fix it.
- **Fix:** Show a one-time hint, or add an empty-state CTA.

### P2-66 - QR code URL encoding doesn't include site name (UX nit)

- **Status:** PARTIAL
- **Claim source:** Plot QR auto-render claim.
- **What's actually there:** `getPlotQrUrl` returns a URL like
  `/sites/<siteId>/plots/<plotId>` - the QR encodes that. On scan, the user
  lands on the internal plot page (gated by auth). For an off-site visitor
  scanning a printed QR, the customer-share URL (`/progress/<token>`) would
  be more useful.
- **Fix:** Add an option for which URL family the QR encodes.

### P2-67 - Predictive completion can return `null` predictedDate but UI shows "—"

- **Status:** PARTIAL
- **Claim source:** v6 #53.
- **What's actually there:** Endpoint returns null when velocity = 0; banner
  hides. OK.

### P2-68 - `Site.completedAt` stamped on first transition but not cleared on re-open

- **Status:** WIRED-WRONG (mild)
- **Claim source:** Schema comment: "Set when site status flips to COMPLETED -
  used as the canonical 'story end date'".
- **What's actually there:** Stamped on transition to COMPLETED; not cleared
  if site goes back to ACTIVE/ON_HOLD. v3 had said it would be cleared on
  re-open, code doesn't.
- **Fix:** Clear `completedAt` on transition out of COMPLETED in site PUT.

### P2-69 - `friendlyMessage` not exported per memory claim

- **Status:** VERIFIED
- **What's actually there:** `api-errors.ts` exports both `apiError` and
  `friendlyMessage`. Verified.

### P2-70 - Variance audit-13 "no view re-derives timeline facts"

- **Status:** VERIFIED via grep
- **What's actually there:** `Math.min(...startDates)` / `differenceInDays`
  inside route or component files: search returned the two acknowledged
  exceptions (GanttChart pixel math + SiteProgramme cell fill). No new
  violations.

### P2-71 - Customer page (`/progress/<token>`) doesn't show photo upload affordance

- **Status:** PARTIAL
- **Claim source:** Customer pages mobile-friendly + opt-in photos (batch 95).
- **What's actually there:** Customer sees photos shared with them; no "Reply"
  or "Send a question" - customer is read-only by design. Memory v4 notes this
  as known.
- **Fix:** Optional feature.

### P2-72 - `/api/cron/weather` doesn't filter by site access

- **Status:** PARTIAL (cron-correctness)
- **What's actually there:** Weather cron fetches weather for all active sites,
  fires `sendPushToAll(WEATHER_ALERT, ...)`. The push fan-out is tenant-wide
  rather than site-scoped. For a multi-site tenant, every user gets every
  site's weather alert.
- **Fix:** Per-site push for weather, scoped to that site's audience.

### P2-73 - `apply-customer-link-backfill.ts` documented as run once - is it idempotent if re-run?

- **Status:** PARTIAL
- **What's actually there:** Looking at backfill scripts - the apply scripts
  use `IF NOT EXISTS` patterns. Backfill scripts ought to be no-ops on
  second run; ad-hoc check needed.
- **Fix:** Spot-check.

### P2-74 - Contractor token "Add note" idempotency

- **Status:** WIRED-WRONG (claim mismatch)
- **Claim source:** v6 batch 84: "Idempotent: re-clicking 'I've started' after
  a prior click is a no-op".
- **What's actually there:** `api/contractor-share/[token]/job-action/route.ts:82-90`
  - confirm_start + confirm_complete are idempotent. The "note" action is NOT
  idempotent - users who tap Send Note twice get two JobAction rows. Comment at
  `:81-82` even says "Notes always allowed" - which means dupes are by design,
  but the v6 claim implies "all three are idempotent". Pre-fix needed: spec is
  ambiguous.
- **Fix:** Doc the intentional non-idempotency.

### P2-75 - User can change auth password via reset-password flow without knowing old password

- **Status:** PARTIAL
- **Claim source:** v3 batch 31 ("set new password").
- **What's actually there:** Reset-password requires only the signed token;
  this is the correct UX for forgot-password. But there's no "change password
  while logged in" flow that requires the old password as confirmation.
- **Fix:** Optional - add /settings change-password route requiring old password.

### P2-76 - `Snag PDF` filename doesn't include site name

- **Status:** PARTIAL
- **Claim source:** v6 #205 ("Snag PDF").
- **What's actually there:** Filename pattern at
  `api/snags/[id]/pdf/route.ts:194` looks like `snag-<id>.pdf` without site
  name; for a user who downloads multiple PDFs, hard to distinguish.
- **Fix:** Append `_<sitename>`.

### P2-77 - `Stale snag digest` in weekly digest claim verified, but stale threshold not configurable

- **Status:** PARTIAL
- **Claim source:** v6 #145 ("Stale snag digest - batch 35").
- **What's actually there:** 30 days hardcoded in
  `cron/weekly-digest/route.ts`. Per-tenant configurability not exposed.
- **Fix:** AppSettings.staleSnagDays.

### P2-78 - "Walkthrough auto-advance" claim untestable from code alone

- **Status:** PARTIAL
- **Claim source:** v6 #142 ("Walkthrough auto-advance - batch 77").
- **What's actually there:** SiteWalkthrough component has the logic; testing
  it requires a real browser session.
- **Fix:** Add a Vitest happy-path test for the advance trigger.

### P2-79 - SuperAdmin role in user list

- **Status:** PARTIAL
- **Claim source:** v6 #201: "should never be assigned via the in-app UI - it's
  set by direct DB update during onboarding".
- **What's actually there:** Users page does *display* SUPER_ADMIN role but
  the role picker only offers CEO/DIRECTOR/SITE_MANAGER/CONTRACT_MANAGER/CONTRACTOR
  - so MANAGE_USERS can't elevate someone to SUPER_ADMIN, which matches the
  doc. Good.

### P2-80 - The doc claim "all 89 batches" doesn't match the date "today is 2026-05-13" - which is exactly the day batches 108-111 landed

- **Status:** PARTIAL (timing)
- **Claim source:** MEMORY.md says today is 2026-05-13, 89 batches.
- **What's actually there:** 22 batches landed today (and earlier this week)
  that aren't in MEMORY.md.
- **Fix:** Update.

---

## Summary

Total findings: **80** (13 P0, 14 P1, 53 P2)
Verified claims listed: **52** (each with file:line proof)

The headline pattern: the memory file describes an enormous amount of correctly-shipped
work, much of which is genuinely solid (PDF migration, JobWeekPanel split, contractor
portal, lateness data model, customer push, iCal). But the document hasn't kept up with
the last three weeks of code:

- **Watch -> Mute semantic flip** is the biggest "ghost feature" - the conceptual
  rename happened but every doc still describes the pre-flip behavior.
- **Cmd-K + FAB action verbs ship as URLs the destination pages don't consume** -
  the canonical example of "implemented but not mounted".
- **Mobile programme rebuild was reverted** but memory v6 still claims it as done.
- **RBAC sweep was comprehensive on most routes, but missed `/api/sites` POST + PUT,
  the snag POST, contractor scorecard, and user-management** - five real holes.
- **Lateness data + display shipped; attribution UI is incomplete.**
- **22 batches (90-111) of recent work** aren't reflected in any handover.

Most of the P0s are 1-3 line fixes; the P1s are doc updates or single-route migrations.
The P2s are predominantly polish + doc-debt.
