# Sight Manager Audit — May 2026 (Master Index, final)

**Generated:** 2026-05-13, after batches 87–111
**Scope:** Whole app, 8 persona/concern lenses, find-everything depth
**Methodology:** 8 audit agents running in parallel, each producing a separate detail doc

---

## Headline numbers

| # | Lens | P0 | P1 | P2 | Total | Detail file |
|---|---|---:|---:|---:|---:|---|
| 1 | Site Manager (daily flow) | 12 | 19 | 14 | **45** | [`site-manager.md`](audit/site-manager.md) |
| 2 | Director / Reports | 8 | 16 | 12 | **36** | [`director-reports.md`](audit/director-reports.md) |
| 3 | Bug + Data integrity | 14 | 48 | 20 | **82** | [`bugs-data-integrity.md`](audit/bugs-data-integrity.md) |
| 4 | UX + Mobile | 11 | 22 | 20 | **53** | [`ux-mobile.md`](audit/ux-mobile.md) |
| 5 | Onboarding + External users | 12 | 14 | 9 | **35** | [`onboarding-external.md`](audit/onboarding-external.md) |
| 6 | Performance + scale | 11 | 16 | 11 | **38** | [`performance.md`](audit/performance.md) |
| 7 | Feature-completeness vs claimed | 13 | 14 | 53 | **80** | [`feature-completeness.md`](audit/feature-completeness.md) |
| 8 | Schema + data model | 8 | 16 | 8 | **32** | [`schema-data-model.md`](audit/schema-data-model.md) |
| | **TOTAL** | **89** | **165** | **147** | **401** | |

Plus **52 verified end-to-end claims** confirmed by the feature-completeness agent — the foundation that actually works.

---

## Cross-cutting themes (multiple lenses flagged the same root cause)

Fixing the root cause clears multiple findings at once.

### Theme A — Lateness feature (just shipped) doesn't reconcile with itself
- **Director:** Lateness counts disagree across LatenessSummary / Analytics widget / Weekly Digest
- **Site Manager:** Attribution UI missing contractor picker (API accepts it, UI doesn't render it)
- **Bug:** EXPAND_JOB branch bypasses `calculateCascade` and I7 conflict checks
- **Feature-completeness:** Confirms attribution picker gap + I7 bypass
- **Schema:** `LatenessEvent.attributedContactId` points at Contact but material suppliers aren't Contact rows

### Theme B — RBAC has gaping holes (claimed comprehensive, isn't)
- **Bug agent:** `/api/sites` POST, `/api/sites/[id]` PUT, `/api/plots/[id]/snags` POST, `/api/contacts/[id]/scorecard`, `/api/users/*` — no proper guards
- **Director:** Daily email blasts every site to every CEO/DIRECTOR; contractor scorecard cross-site leak
- **Feature-completeness:** Confirms incomplete despite memory claiming "comprehensive RBAC sweep"
- **Onboarding:** Customer push subscriber has no rate limit or origin check

### Theme C — Mobile is broken in more places than fixed
- **UX:** DailySiteBrief zero `dark:` classes; `h-9 sm:h-6` collapses to 24px; native `<select>` 24-28px
- **Onboarding:** No `<meta viewport>` tag breaks every external mobile page
- **Site Manager:** JobActionStrip Mode A hides Sign Off on mobile
- **Feature-completeness:** **Mobile programme rebuild WAS REVERTED** (batches 99+101 deleted `MobileProgramme.tsx`) but v6 handover still claims the responsive split is done

### Theme D — Metric drift (same number, different answers)
- **Director:** "Total Spend" 4 definitions; "Days late" 4 implementations
- **Bug:** `apply-template-helpers.ts resolveOrderDates` mixes calendar/working day
- **Site Manager:** Dashboard tiles link to wrong page (numbers fine, navigation wrong)
- **Schema:** `Plot.completedAt` claimed in MEMORY.md but doesn't exist in schema

### Theme E — Watch / notification ecosystem half-built
- **Feature-completeness:** **`WatchedSite` semantics flipped in batch 103 (now means MUTED)** but every handover doc still describes the old opt-in "watch"
- **Site Manager:** WatchToggle silently shows "Notifying" on failed GET; half-applied conceptual rename
- **Onboarding:** Customer push fails silently on missing VAPID env

### Theme F — External users get the worst experience
- **Onboarding:** Viewport missing; no welcome email; contractor `notFound()` for expired tokens; `Snag.notes` leaks internal notes; Resend default sender → spam folder
- **UX:** Mobile bugs hit external users hardest (95% mobile)
- **Schema:** `Snag.notes` single TEXT mixes internal + external (root cause of contractor leak)

### Theme G — Mega-components becoming unmaintainable
- **UX/Performance:** `DailySiteBrief` 3,573 lines, `SiteProgramme` 2,442, `TemplateEditor` 3,575, `JobWeekPanel` 1,889 — single React function each
- **Feature-completeness:** JobWeekPanel "4-module split" is shallow — parent still 1,889 lines
- **Site Manager:** Daily Brief auto-expand fights user collapses; sign-off photo upload races complete API

### Theme H — Will fail at modest scale (10–50 sites)
- **Performance:** 4 crons hit N×N work — lateness, reconcile, weekly-digest, daily-email — will exceed 30s
- **Performance:** Three crons fire at the same minute (`0 5 * * *`) saturating Supabase pool
- **Performance:** Handover ZIP does ~550 sequential HTTPS fetches per 500-photo site
- **Performance:** Bundle bloat — `xlsx` + `recharts` shipped on every page; zero `next/dynamic` use
- **Performance:** Hot fields unindexed — `Job.startDate/endDate/actualEndDate`, `MaterialOrder.dateOfOrder/deliveredDate`, `Snag.createdAt/resolvedAt`, `Site.status`
- **Performance:** No pagination on Programme/Analytics/Tasks list endpoints

### Theme I — Data integrity at delete (Cascade choices)
- **Schema:** `MaterialOrder.jobId` AND `MaterialOrder.plotId` Cascade → deleting a Job/Plot WIPES delivery history (DELIVERED orders, items, lateness events)
- **Schema:** `SiteDocument.contactId` Cascade → contact delete wipes RAMS/compliance evidence
- **Schema:** `User` FKs default Restrict → can't offboard staff with historical activity
- **Schema:** `EventLog` immutability is convention-only — no DB enforcement

### Theme J — Claim/code drift (what the docs say isn't what the code does)
- **Feature-completeness:** 22 batches of recent work (90–111) not reflected in any handover
- **Feature-completeness:** Watch→Mute semantic flip not in docs
- **Feature-completeness:** Mobile programme reverted but claim stands
- **Schema:** `Plot.completedAt` claimed but doesn't exist
- **Site Manager:** "Comprehensive a11y pass" claim — partial in reality
- **Bug:** "Comprehensive security RBAC" claim — has 5 P0 holes

### Theme K — Half-built features (shipped but not wired)
- **Feature-completeness:** White-label CSS variable injected but never consumed — `primaryColor` changes do nothing
- **Site Manager + Feature-completeness:** Cmd-K + FAB `?action=new` deep links are ghosts — no destination reads the param
- **Site Manager:** Lateness attribution UI missing picker
- **Onboarding:** "Resend invite" advertised but not wired in UsersClient
- **Schema:** LatenessEvent contractor attribution wrong shape

---

## P0 quick-reference (all 89, grouped for execution)

### 🔒 Security / RBAC (10 P0s — fix this week, one-line guards)
1. `/api/sites/[id]` PUT — no RBAC
2. `/api/sites` POST — no permission gate
3. `/api/plots/[id]/snags` POST — no canAccessSite
4. `/api/contacts/[id]/scorecard` — no site-access scope
5. `orders/backfill-lead-time` — checks dead `ADMIN` role (CEO is the working enum)
6. `/api/users/[id]` + `/permissions` — bare `hasPermission` bypasses SUPER_ADMIN/CEO/DIRECTOR
7. Daily email cron — no per-user scoping (blasts every site to every manager)
8. `snag-action` contractor-share — `notes` rendered verbatim → XSS
9. Customer push subscriber — no rate limit or origin check
10. `auth.ts` callback swallows DB errors and trusts stale tokens

### 📊 Data wrong / numbers don't reconcile (10 P0s)
11. "Total Spend" — 4 definitions across analytics/cash-flow/budget/profitability
12. "Days late" — 4 implementations for the same contractor
13. Lateness counts disagree LatenessSummary / Analytics / Weekly Digest
14. Site Story variance regex-parses freeform EventLog → silently misses cascades
15. Dashboard "plots over budget" — only fires on over-delivery, not cost overrun
16. Handover ZIP Delay Report PDF omits currently-overdue jobs
17. Handover ZIP cost PDFs use different model than in-app reports
18. `resolveOrderDates` mixes calendar/working day arithmetic
19. `bulk-status` POST bulk-completes jobs with no `actualStartDate`
20. `Job.originalStartDate` parent rollup mutates the "original" baseline

### 📱 Mobile / accessibility (11 P0s)
21. **No `<meta viewport>` in root layout** — every external mobile user gets desktop shrunk
22. DailySiteBrief zero dark-mode classes
23. `h-9 sm:h-6` pattern collapses to 24px tall on landscape phone / tablet
24. Walkthrough snag picker native `<select>` rotates on iOS landscape
25. Snag list filter `<select>` 24px tall
26. JobWeekPanel + SnagDialog `max-h-[85vh]` hides actions behind mobile keyboard
27. Programme grid status dots / today line / approval cells — no aria
28. DailySiteBrief native checkbox `size-3.5` escapes touch target
29. DailySiteBrief contractor + assignee `<select>` tiny natives
30. Mobile horizontal scroll in Programme traps page on iOS
31. **Mobile programme rebuild was REVERTED** — `MobileProgramme.tsx` deleted in batches 99+101; v6 handover still claims it's there

### 🔧 Operational / workflow (13 P0s)
32. Dead `?action=new` deep-links from Cmd-K + FAB (8 verbs, no handlers)
33. Header Search button hidden when no site selected
34. Site detail lands on Plots tab, not Daily Brief
35. Dashboard "Total Jobs" + "In-Progress" tiles link to Tasks not Jobs
36. `JobActionStrip` Mode A hides Sign Off behind "Actions ▾" on mobile
37. No global Orders link in sidebar
38. Programme state lost across site switches
39. Today line on programme can absorb clicks
40. Daily Brief sign-off photo upload happens BEFORE complete API call
41. WatchToggle silently shows "Notifying" on failed GET
42. Lateness attribution UI missing contractor picker
43. `sites/[id]` PUT cascades `assignedToId` but skips parent rollups
44. White-label CSS variable injected but never consumed (`primaryColor` does nothing)

### 👤 External user blockers (12 P0s)
45. No welcome / invite email on user creation
46. "Resend invite" not wired in Users UI
47. Brand-new dashboard with zero sites — no "create first site" guidance
48. Customer push silently fails on missing VAPID env
49. Contractor portal renders full `Snag.notes` (internal notes leak)
50. Customer page leaks data if `Plot.shareEnabled = true` but no jobs yet
51. Contractor portal `notFound()` for missing contact/site swallows real error
52. Contractor portal silently 401s on expired token with no UI message
53. Calendar token URL relies on Origin header (often stripped in prod)
54. Resend default sender → emails land in spam unless `EMAIL_FROM` set
55. Daily-email `email: { not: undefined }` is a no-op Prisma filter
56. Daily-email passes empty-string emails

### ⚡ Performance — will fail at modest scale (11 P0s)
57. Lateness cron N×N — will timeout at 10–50 sites
58. Reconcile cron same problem
59. Weekly-digest cron same problem
60. Daily-email cron same problem
61. Three crons fire at `0 5 * * *` saturating Supabase pool
62. Handover ZIP serial HTTPS fetches (~550 round-trips for 500-photo site)
63. `bulk-status` strictly sequential DB writes (15-30 round-trips per job)
64. `xlsx` statically imported by ReportExportButtons + SnagList → 190KB on every authenticated page
65. `recharts` statically imported by Dashboard/Analytics/CashFlow
66. Zero `next/dynamic` use across repo
67. Index gaps on hot fields (`Job.startDate/endDate/actualEndDate`, `MaterialOrder.dateOfOrder/deliveredDate`, `Snag.createdAt/resolvedAt`, `JobPhoto.createdAt`, `Site.status`)

### 🗄️ Schema integrity (8 P0s)
68. `MaterialOrder.jobId` Cascade — deleting Job wipes DELIVERED orders + lateness
69. `MaterialOrder.plotId` Cascade — deleting Plot same risk
70. `SiteDocument.contactId` Cascade — deleting Contact wipes RAMS
71. Order target invariant (jobId XOR siteId+plotId) is convention only — no DB CHECK
72. EventLog immutability convention only — no DB enforcement
73. `Plot.completedAt` claimed in docs but doesn't exist in schema
74. User FKs default Restrict — HR can't offboard anyone
75. `LatenessEvent.attributedContactId` wrong shape (suppliers aren't Contact rows)

### 🛠️ Cron / infrastructure (4 P0s)
76. Reconcile cron `overlapPlots` pass uses raw `new Date()` ignoring dev-date
77. EXPAND_JOB lateness branch bypasses `calculateCascade` I7 conflict checks
78. `cascade.weatherAffected` flag bypass
79. `apply-template-helpers.ts` mixes calendar/working day in `resolveOrderDates`

### 🧾 Code-level integrity (10 P0s — split out)
80–89: photos `sharedWithCustomer` PATCH unguarded; sidebar programme state thrown away; DailySiteBrief tiny inputs / checkboxes; cmd-K verb gaps (see feature-completeness.md for the 8-verb table); 22-batch handover gap

---

## Execution plan — sprints

Following the rule of thumb agreed upstream:
- **"Just fix"** = additive, mechanical, security one-liners, missing infra
- **"Ask first"** = workflow change, schema non-additive, major refactor, ambiguous fix

### Sprint 1 — Security + immediate data wrong (this week)
**Just fix:**
- Close 10 RBAC P0s with one-line `canAccessSite()` / `requireSessionPermission()` guards
- Fix dead `ADMIN` role check → `CEO`
- Add `<meta viewport>` tag
- Wire VAPID env validation (fail loud on startup)
- Fix `email: { not: undefined }` no-op + empty-string email filter
- Add rate limit + origin check to customer push subscriber
- Fix `auth.ts` callback DB error swallowing
- Fix `reconcile` cron raw `new Date()` → `getServerCurrentDate`
- Fix `bulk-status` requiring `actualStartDate` on complete
- XSS escape on contractor-share `snag-action`
- Set `EMAIL_FROM` env in production
- Wire "Resend invite" in Users UI
- Welcome email on user creation
- Wire dashboard tile links to right pages
- Add sidebar global Orders link

**Ask first:**
- Split `Snag.notes` → `internalNotes` + `externalNotes` (additive migration, but data backfill question)
- Site detail default landing tab change (Plots → Daily Brief)

### Sprint 2 — Metric SSOT + lateness reconciliation
**Just fix:**
- Build `src/lib/report-totals.ts` — one function per cross-view metric
- Route Total Spend / Days Late / Lateness count consumers through it
- Add vitest reconciliation suite
- Fix Site Story variance to use structured EventLog fields (not regex)
- Wire Lateness attribution contractor picker into LatenessSummary
- Fix EXPAND_JOB to use `calculateCascade` (closes I7 bypass)
- Add Handover ZIP Delay Report to include currently-overdue jobs
- Fix dashboard "plots over budget" to fire on cost overrun

**Ask first:**
- Canonical definition for "Total Spend" — multiple valid choices, you pick
- Schema fix for `LatenessEvent.attributedContactId` — Supplier vs Contact bridge

### Sprint 3 — Mobile + a11y
**Just fix:**
- Fix touch-target pattern `h-9 sm:h-6` → `h-10` minimum across the codebase
- Replace native `<select>` in Walkthrough + SnagList + DailySiteBrief with Base UI Select
- Add `aria-label` to programme grid status dots / today line / approval cells
- Fix `max-h-[85vh]` to leave room for mobile keyboard in dialogs
- Add focus rings everywhere they're missing
- Friendly token-expired page for contractor portal
- Customer page jargon → buyer-friendly language

**Ask first:**
- DailySiteBrief dark mode pass — 3,573 lines, big change shape
- New user onboarding tour shape (empty-state guidance)
- Restore vs document removal of Mobile programme

### Sprint 4 — Operational wiring
**Just fix:**
- Wire `?action=new` deep links to existing handlers (8 verbs in Cmd-K + FAB)
- Fix `JobActionStrip` Mode A to surface Sign Off on mobile
- Fix sign-off photo upload race (transactional)
- Fix WatchToggle failure visibility
- Wire white-label `primaryColor` CSS variable consumption
- Preserve programme state across site switches
- Fix today-line `pointer-events` order

### Sprint 5 — Performance
**Just fix:**
- Add missing indexes (additive migration)
- Add pagination to Programme / Analytics / Tasks list endpoints
- `next/dynamic` for `xlsx`, `recharts`, walkthrough body, wizard dialogs
- Parallel Handover ZIP file fetches (batch of 10)
- Bulk SQL for `bulk-status` route
- `next/image` for photo grids with width hints

**Ask first:**
- Cron schedule restructure (stagger 3 crons off `0 5 * * *`)
- Stream Handover ZIP via S3 presigned upload if it still times out

### Sprint 6 — Schema integrity (ask first, every item)
- Change `MaterialOrder.jobId/plotId` Cascade → SetNull
- Change `SiteDocument.contactId` Cascade → SetNull
- Add DB CHECK constraint to MaterialOrder target invariant
- Add `Plot.completedAt` to schema
- Add EventLog immutability trigger
- Enumify `JobAction.action`, `DelayReason.category`, `Job.weatherAffectedType`
- Change User FKs Restrict → SetNull (with offboarding flow)

### Sprint 7 — Big refactors (ask first, every item)
- Split DailySiteBrief
- Split SiteProgramme  
- Split TemplateEditor
- Daily Brief All-Sites view redesign
- Watch ecosystem semantic rename completion

### Sprint 8 — Polish (sweep through all P2s)

---

## Structural recommendations (already in place after Sprint 1+2)

1. **`src/lib/report-totals.ts`** — SSOT for every cross-view metric, locked by vitest reconciliation suite
2. **`src/lib/rbac.ts`** — single source for "can this user mutate this entity?", making missing guards code-review red flags
3. **Living audit doc** — each batch references this file, marks closed findings, adds new ones. Stops the regression cycle.
4. **External-user pre-flight checklist** — before shipping a new share feature, verify viewport / mobile / error states / expiry messages / no internal leakage / email branding
5. **Handover discipline** — current docs lag 22 batches. Either keep handovers tight per batch, or treat memory files as historical-only and rely on code + audit doc as truth.

---

## Honest limits of this audit
- Can't feel real loading times or animation jank — read code only
- Can't see pixel-level layout issues at uncommon widths
- Can't verify subjective UX feel
- Doesn't catch business-logic bugs without a "claim" framing — the cascade rules might be wrong; the working-day math might match the spec but not your mental model
