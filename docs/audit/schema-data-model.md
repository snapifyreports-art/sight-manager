# Schema + Data Model Audit — May 2026

Audit of `prisma/schema.prisma` against the consumer surface in `src/app/api/` and `src/lib/`, the migration scripts in `scripts/`, and the SSOT claims in `memory/project_template_ssot.md`. Findings are tagged P0 (data-loss risk or broken invariant), P1 (missing index / latent denormalisation drift), P2 (naming / style / minor risk).

Schema is 1377 lines, 50+ models. Generally well-thought-through — comments document many invariants, cached fields are owned by canonical helpers (`recomputePlotPercent`, `recomputeParentFromChildren`, `enforceOrderInvariants`, `openOrUpdateLateness`), audit-log immutability is enforced by convention (and verified clean by grep). The findings below are pockets where the contract is convention-only when it should be DB-enforced, indexes are missing for filter columns that are actually queried, cascade choices silently destroy historical evidence, or nullability is wrong for the consumer.

Lines cited refer to `prisma/schema.prisma` unless noted otherwise.

---

## P0 — `MaterialOrder.job` Cascade destroys delivery history

- **Table/field:** `MaterialOrder.jobId` (FK to `Job`)
- **Schema location:** `prisma/schema.prisma:466`
- **Issue:** `onDelete: Cascade`. Deleting a Job wipes every `MaterialOrder` for it — including orders already DELIVERED with a `deliveredDate`, `dateOfOrder`, items, and lateness events. Compare with `JobAction` (audit trail of clicks on that job) which is also `Cascade`, but JobActions are derivative; orders are first-class business records that survived (or didn't) supplier delivery.
- **Risk:** Current bug. Job deletion happens via `/api/jobs/[id]` DELETE; if a manager deletes a misnamed job that has already been ordered against, the order vanishes with no audit trace, the supplier's invoice no longer reconciles with any record in the system, and `LatenessEvent` rows fall to SetNull but lose their join target. `OrderItem.totalCost` rows go with it (cascade chain).
- **Fix:** Change to `onDelete: SetNull` so the order rows survive with `jobId=null`. The order then reads as a one-off (the `siteId` denormalised field already covers this case). Add a backfill migration to populate `siteId` for any historical order where it's null but `jobId` points at an extant Plot.

## P0 — `MaterialOrder.plot` Cascade destroys one-off orders on Plot delete

- **Table/field:** `MaterialOrder.plotId`
- **Schema location:** `prisma/schema.prisma:468`
- **Issue:** Same shape as above — `onDelete: Cascade` on plot-level one-off orders. A plot can carry orders directly (not via a job) when the manager places a site-level/plot-level order at the Plot tab. Deleting the Plot wipes them.
- **Risk:** Current bug. The Plot delete path doesn't archive one-offs; suppliers were emailed, money committed, but the record is gone. Compounded by the fact that `Plot.onDelete: Cascade` from `Site` means a Site delete also cascades through Plot → orders.
- **Fix:** `onDelete: SetNull` on `plotId`. Pair with a NOT-NULL check on `siteId` for any one-off (currently the comment claims "either jobId OR (siteId+plotId)" but nothing enforces it — see P0 "Order target invariant unenforced" below).

## P0 — Order target invariant is convention-only ("either jobId OR siteId+plotId")

- **Table/field:** `MaterialOrder.jobId / siteId / plotId`
- **Schema location:** `prisma/schema.prisma:439-444`, comment line 440
- **Issue:** Schema comment says "Either jobId OR (siteId set, with optional plotId) must be present — enforced at API level." But every field is nullable, no DB CHECK constraint exists, and the only enforcement is in the few one-off-orders POST routes. Any future writer (cascade route, reconcile cron, ad-hoc script, future endpoint) that forgets the rule produces an orphan order that consumes the deliveries/overdue dashboards weirdly.
- **Risk:** Latent. Orphans don't crash queries — they silently appear in the wrong scope. Already observed once in the cascade route when a job was deleted between a select and a write.
- **Fix:** Add a Postgres CHECK constraint via `apply-order-target-check.ts`: `CHECK ("jobId" IS NOT NULL OR ("siteId" IS NOT NULL))`. Document the convention in the model. Alternatively split into two tables (`JobOrder` / `SiteOrder`) but the cost of refactoring all consumers is high.

## P0 — `Plot.completedAt` claimed by memory, missing from schema

- **Table/field:** `Plot.completedAt`
- **Schema location:** N/A (does not exist) — referenced by `MEMORY.md` "Plot.completedAt added in May 2026 audit — set everywhere needed?"
- **Issue:** `MEMORY.md` lists `Plot.completedAt` as audit-added; only `Site.completedAt` (line 192) exists. `src/lib/handover-pdf-renderers.ts:254` reads `plot.completedAt` but it's reading the computed `PlotStory.completedAt` derived in `site-story.ts:577` — not a DB column. Consumers that want "when did this plot finish" must currently derive it from `max(actualEndDate)` of leaf jobs.
- **Risk:** Latent — derivation works today but means every plot-level closure date is re-computed from many job rows per consumer, can disagree across views, and there's no canonical timestamp for "first time this plot became 100% complete". Memory's claim that the column exists is documentation drift; an engineer trusting the memory will write `Plot.completedAt` and the build will fail.
- **Fix:** Either (a) add `Plot.completedAt DateTime?` and stamp it in the same helper that calls `recomputePlotPercent` whenever total==completed==count>0; (b) update `MEMORY.md` to say the field is derived. Recommend (a) — keeps semantics symmetric with `Site.completedAt`.

## P0 — Audit-log immutability is convention-only

- **Table/field:** `EventLog`
- **Schema location:** `prisma/schema.prisma:1338-1377` (header comment, model definition)
- **Issue:** Schema comment claims "IMMUTABLE — APPEND-ONLY by contract" and rule 3 explicitly says "An explicit DB-level CHECK / trigger isn't added because Prisma is the only thing that talks to this table." That's accepted convention. But (a) Site cascade deletes wipe EventLog rows via `onDelete: Cascade` on `siteId`, which is the only sanctioned removal path per the comment, BUT (b) anyone running a raw SQL `UPDATE` or attaching a second client (a future analytics consumer, a reporting export tool, a migration script) bypasses the convention. The grep verification has to be re-run every commit; nothing stops it from re-introducing a `eventLog.update` call.
- **Risk:** Latent. Today the grep is clean. The audit-log claim is structurally weak: a single stray `update()` call can corrupt history months later. Site cascade is also debatable — closed-site EventLogs are exactly the history a regulator wants to read.
- **Fix:** Add a Postgres trigger via `apply-eventlog-immutable.ts` that raises on UPDATE/DELETE except where current_user matches a known migration role. Optionally make Site→EventLog cascade `SetNull` so closing a site preserves the timeline (handover ZIP already pulls this content).

## P0 — Site.createdBy / Snag.raisedBy / SiteDocument.uploadedBy block User delete with Restrict

- **Table/field:** `Site.createdById`, `Snag.raisedById`, `SiteDocument.uploadedById`, `JobAction.userId`
- **Schema location:** `prisma/schema.prisma:196, 891, 940, 363`
- **Issue:** All four are required-User refs with no `onDelete` clause — Prisma defaults to `Restrict`. Deleting a User who ever created a site, raised a snag, uploaded a doc, or clicked a job button will fail the FK and abort the transaction. The only path to remove a user is to manually transfer ownership or bulk-delete their history first — and there's no UI for that.
- **Risk:** Current bug. Triggered the moment HR offboards anyone with historical activity. User deletion silently fails (Prisma error bubble up as "internal server error" via `apiError` in users/[id]/route.ts:DELETE).
- **Fix:** Decide policy. Recommended: change all four to `onDelete: SetNull` (allow attribution to be lost), make the fields nullable. Alternative: implement a "deactivate" pattern (`User.deletedAt`) and never hard-delete — but this requires the rest of the schema to honour deletedAt, which it currently doesn't.

## P0 — Many optional User refs default to Restrict

- **Table/field:** `Site.assignedToId`, `Job.assignedToId`, `Job.signedOffById`, `Snag.assignedToId`, `Snag.resolvedById`, `Snag.contactId`, `HandoverChecklist.checkedById`
- **Schema location:** `prisma/schema.prisma:197, 335, 336, 889, 890, 892, 1308`
- **Issue:** Each declares an optional User/Contact relation with no `onDelete` clause. Prisma defaults to `Restrict`, so even nullable FKs block parent delete. The intent is obviously "if the User/Contact goes, null this column" — but the default is the opposite.
- **Risk:** Current bug. Same blocking pattern as P0 above. `Snag.contactId` (line 890) explicitly will refuse to delete a Contact that was ever assigned a snag — likely affects every contact in the system after a year of use.
- **Fix:** Add `onDelete: SetNull` to each. There's prior art: `Snag.job` line 888 has it. The omissions are inconsistent within the same model.

## P0 — `SiteDocument.contact` Cascade wipes RAMS when a contractor is deleted

- **Table/field:** `SiteDocument.contactId`
- **Schema location:** `prisma/schema.prisma:939`
- **Issue:** `onDelete: Cascade`. Per the field comment (929), contact-scoped SiteDocuments are exactly the contractor-level documents (RAMS, method statements) that apply across every site. Deleting the contact wipes them.
- **Risk:** Current bug. RAMS are compliance evidence — losing them on contact delete is a regulatory hole. Particularly bad because contact deletion is currently the only way to remove a stale contractor; managers do this when they replace a supplier.
- **Fix:** `onDelete: SetNull` and let an orphaned-RAMS sweep cron archive them; or refuse to delete a Contact with non-zero `documents` count (more conservative).

## P0 — `Job.originalStartDate` / `originalEndDate` set on every Job.create but never enforced unchanged

- **Table/field:** `Job.originalStartDate`, `Job.originalEndDate`
- **Schema location:** `prisma/schema.prisma:316-317`
- **Issue:** Field comment says "NOT NULL since May 2026 audit. Every job creation site must stamp these alongside startDate/endDate so reports never fall back to current dates and silently mix 'original' with 'actual' data." The constraint is enforced by the DB. But nothing prevents an `UPDATE` from overwriting them later — `parent-job.ts:127-128` actively writes `originalStartDate`/`originalEndDate` on the parent from its children's current min/max, which mutates "original" baseline data every time the rollup runs.
- **Risk:** Current bug at parent level — parent's "original" drifts because the rollup keeps re-aggregating from children whose own originals are stable. The rollup should be a read-only re-computation; instead it's persisting derived state into the same field used by reports as baseline. For child jobs the field is stable today because no other write path touches them after creation, but there's no contract preventing future writers from doing so.
- **Fix:** (a) On parent rollup, write to dedicated `originalStartDate_aggregated` cache fields, OR mark `Job.originalStartDate` truly immutable post-create via a Postgres trigger that rejects UPDATEs to that column unless transitioning from NULL. (b) Audit every Job.update site for inadvertent originalXxxDate writes.

---

## P1 — Missing index: `MaterialOrder.deliveredDate`

- **Table/field:** `MaterialOrder.deliveredDate`
- **Schema location:** `prisma/schema.prisma:459`
- **Issue:** Queried with range filters in `src/app/api/sites/[id]/calendar/route.ts:74` (`{ gte: rangeStart, lte: rangeEnd }`) and in supplier-performance / delay-trends analytics. No `@@index([deliveredDate])`.
- **Risk:** Latent. Will full-scan the orders table as orders accumulate. Hot path is "deliveries this week" on the calendar.
- **Fix:** Add `@@index([deliveredDate])` and corresponding migration script.

## P1 — Missing index: `PlotMaterial.plotId`

- **Table/field:** `PlotMaterial.plotId`
- **Schema location:** `prisma/schema.prisma:686`
- **Issue:** Plot has a `materials` back-relation but `PlotMaterial` has no `@@index` at all. Every Plot Detail page and the Site Quants report do `where: { plotId }`.
- **Risk:** Latent. Will scan as material counts grow per plot (10-20 rows typical, more for templates with many items).
- **Fix:** Add `@@index([plotId])` and migration.

## P1 — Missing index: `MaterialOrder.contactId`

- **Table/field:** `MaterialOrder.contactId`
- **Schema location:** `prisma/schema.prisma:444`
- **Issue:** Contractor Comms / Contractor Scorecard / Contact Detail page (`src/app/(dashboard)/contacts/[id]/page.tsx:108`) all do `where: { contactId }` on MaterialOrder. No index.
- **Risk:** Latent. Will scan as orders grow.
- **Fix:** Add `@@index([contactId])`.

## P1 — Missing composite index: `(plotId, status)` on Job

- **Table/field:** `Job.plotId`, `Job.status`
- **Schema location:** `prisma/schema.prisma:349-351`
- **Issue:** Indexes exist separately on `plotId` and `status` but the daily-brief / programme / reconcile cron do `where: { plotId: { in: [...] }, status: ... }`. Postgres can use only one index per scan (or do a bitmap merge which is slower). The pattern `plot → jobs by status` is the single hottest query in the system.
- **Risk:** Latent. Each individual index works; the composite would be faster for the multi-clause case.
- **Fix:** Add `@@index([plotId, status])` and consider dropping the standalone `[plotId]` (the composite covers it as a prefix).

## P1 — Missing index: `Job.parentId` already exists but no `(parentId, status)`

- **Table/field:** `Job.parentId`, `Job.status`
- **Schema location:** `prisma/schema.prisma:351`
- **Issue:** `recomputeParentFromChildren` does `findMany({ where: { parentId } })` then aggregates status — fine. But `Job.findMany({ where: { children: { none: {} } })` (leaf-job filter, used everywhere) translates to a `parentId IS NULL` plus other conditions in SQL. Index on parentId helps but doesn't cover the NULL case well.
- **Risk:** Latent. The `children: { none: {} }` filter is the hot leaf-jobs filter — `recomputePlotPercent`, daily-brief, programme.
- **Fix:** Add partial index `@@index([plotId], where: parentId IS NULL)` via raw SQL if Prisma supports it on Postgres (filtered indexes). Alternative: store `isLeaf` as a cached boolean and index on `(plotId, isLeaf)`.

## P1 — `LatenessEvent.attributedContactId` mislabelled — points at Contact, not Supplier

- **Table/field:** `LatenessEvent.attributedContactId`
- **Schema location:** `prisma/schema.prisma:1226, 1236`
- **Issue:** Field comment says "Which contractor or supplier carried the slip" but the FK is to `Contact`. Suppliers are a separate model (`Supplier`, line 403) and most material suppliers don't have a Contact row — the cron at `src/app/api/cron/lateness/route.ts:158` does `o.contactId ?? null` so material-late events have no attribution at all when the order is supplier-only. The Supplier Performance report can't cross-reference.
- **Risk:** Current bug. Order-driven lateness events never attribute the supplier; the "who's slipping" report is incomplete by design.
- **Fix:** Add `LatenessEvent.attributedSupplierId String?` with FK to `Supplier`, optionally a CHECK that at most one of `attributedContactId` / `attributedSupplierId` is set. Update cron to set the supplier one for material lateness, contact for everything else.

## P1 — `LatenessEvent.targetType` is a String, not an enum

- **Table/field:** `LatenessEvent.targetType`
- **Schema location:** `prisma/schema.prisma:1197`
- **Issue:** Comment says "'job' or 'order'" — but field is a plain `String`. A typo ("Order" vs "order", "Job" vs "job") in a future writer silently produces orphan rows that no consumer filters in.
- **Risk:** Latent. The unique key `(targetType, targetId, kind, wentLateOn)` is case-sensitive — a case mismatch produces duplicates.
- **Fix:** Add `enum LatenessTargetType { JOB ORDER }` and migrate. Alternative: keep String + Postgres CHECK `targetType IN ('job', 'order')`.

## P1 — `JobAction.action` is an unbounded String

- **Table/field:** `JobAction.action`
- **Schema location:** `prisma/schema.prisma:358`
- **Issue:** Plain string; in code there's an `ACTION_STATUS_MAP` and `ACTION_EVENT_MAP` (e.g. start/stop/complete/signoff/edit/note/cascade/order/delay/pull/request_signoff) — but nothing prevents a future writer from spelling "signOff" vs "signoff". The contractor-portal already queries `action: "request_signoff"` literally.
- **Risk:** Latent. Misspellings produce dark rows that don't surface in any filter. Reports double-count.
- **Fix:** Enum `JobActionType` + migration with backfill mapping observed values. Recommend doing this at the same time as enum-ing `targetType`.

## P1 — `MaterialOrder.orderType` is a free-text String

- **Table/field:** `MaterialOrder.orderType`
- **Schema location:** `prisma/schema.prisma:447`
- **Issue:** No clear semantic — the field reads either "automated"-ish category or just a free-text bucket. Consumers don't filter on it.
- **Risk:** P2 if unused, P1 if reports plan to bucket by it. Currently unused — drop it or enum-ise.
- **Fix:** Drop if unused; enum if used.

## P1 — `Job.weatherAffectedType` String contradicts `WeatherImpactType` enum

- **Table/field:** `Job.weatherAffectedType` (also `TemplateJob.weatherAffectedType`)
- **Schema location:** `prisma/schema.prisma:328, 726`
- **Issue:** Schema enum `WeatherImpactType` (line 87) has RAIN / TEMPERATURE — but the field comment on line 328 says `// "RAIN" | "TEMPERATURE" | "BOTH"`. The enum doesn't include BOTH. So writers pick the String column because the enum can't represent the third value; the cron reads from String, ignores enum.
- **Risk:** Latent. Two source-of-truths drift — RainedOffDay uses the enum, jobs use the String, and they can't be joined cleanly.
- **Fix:** Either expand the enum to include `BOTH` and convert the field to enum, OR document why BOTH is a job-level superset and rename the enum to `WeatherDayType` for clarity.

## P1 — `DelayReason.category` String should be an enum

- **Table/field:** `DelayReason.category`
- **Schema location:** `prisma/schema.prisma:1327`
- **Issue:** Comment (1322) says "must be one of: WEATHER_RAIN | WEATHER_TEMPERATURE | OTHER". It's `String @default("OTHER")`. Same shape as the `Job.weatherAffectedType` problem — narrow value space stored as text.
- **Risk:** Latent. A delay reason inserted with category="OTHER " (trailing space) becomes its own bucket on reports.
- **Fix:** Enum + migration.

## P1 — `Snag.notes` is a single TEXT field mixing internal + external

- **Table/field:** `Snag.notes`
- **Schema location:** `prisma/schema.prisma:883`
- **Issue:** A single field accumulates resolution notes, close notes, and re-inspection reminders (see `src/app/api/snags/[id]/route.ts:133-141` appending to the same field). The contractor portal renders this field verbatim (`src/app/contractor/[token]/SnagSignOffCard.tsx:98`) — so internal-only resolution metadata leaks to external parties when the snag is shared.
- **Risk:** Current bug. The contractor sees notes prefixed with `[DD/MM/YYYY] Re-inspection required` and any other internal commentary appended over time.
- **Fix:** Split into `Snag.internalNotes` + `Snag.externalNotes`, or model as a `SnagComment[]` child table with a `visibility` enum. Contractor portal renders only `externalNotes` / visibility=EXTERNAL.

## P1 — `OrderItem.totalCost` denormalised without invariant guard

- **Table/field:** `OrderItem.totalCost`
- **Schema location:** `prisma/schema.prisma:486`
- **Issue:** Stored as a separate column = quantity × unitCost. The two write paths (`src/app/api/orders/[id]/items/route.ts:73` and `[itemId]/route.ts:46`) recompute it correctly. But template clone, order split, and any future bulk path can forget — and no DB-level invariant catches it.
- **Risk:** Latent. Order-split route exists and would be a candidate to drift.
- **Fix:** Drop the column and compute on read, OR add a generated column (Postgres `GENERATED ALWAYS AS (quantity * unitCost) STORED`).

## P1 — `Snag.assignedToId` (User) and `Snag.contactId` (Contact) both nullable, neither enforced exclusive

- **Table/field:** `Snag.assignedToId` + `Snag.contactId`
- **Schema location:** `prisma/schema.prisma:878-879`
- **Issue:** Two assignee fields for two different types of person — internal User vs external Contact. Both can be set, and downstream UI has to pick which to render. No CHECK enforcing exclusivity or precedence.
- **Risk:** Latent. UI guesses which one to display first; reports double-count "assigned snags" by joining both columns.
- **Fix:** Either a single `assigneeRef` polymorphic field (with `assigneeType` enum), or a Postgres CHECK that at most one of the two is non-null.

## P1 — `JobContractor` pivot has no role / rate / pricing data

- **Table/field:** `JobContractor`
- **Schema location:** `prisma/schema.prisma:368-379`
- **Issue:** Pure (jobId, contactId) link. Real-world: multiple subcontractors per job, each with their own role (e.g. "lead bricky", "labourer"), agreed day-rate, scope of work. Currently all of that lives elsewhere or nowhere. Once Keith starts logging actual contractor day-rates or scope-of-work splits, this table has to grow.
- **Risk:** P1 (latent — current UI doesn't ask for the pivot data yet, but contractor scorecard / cost-overrun reports want it).
- **Fix:** Add `JobContractor.role String?`, `agreedDayRate Float?`, `scopeNote String?` (additive — no consumer breaks). Discuss with Keith before adding.

## P1 — `Plot.shareEnabled` defaults to `true` but shareToken defaults to null

- **Table/field:** `Plot.shareEnabled` + `Plot.shareToken`
- **Schema location:** `prisma/schema.prisma:254-255`
- **Issue:** A new plot is created with `shareEnabled=true` and `shareToken=null`. The /share/[token] route can't render anything with a null token. The "enabled with no token" state is semantically odd — both fields should agree on the initial state.
- **Risk:** P2 — confusing for a reader/debugger; no current bug since the UI is gated on shareToken presence.
- **Fix:** Default `shareEnabled=false` so the two fields agree. Flip to true only when the manager clicks "Get share link" (which also creates the token).

## P1 — `LatenessEvent.orderId` denormalises `targetId` when `targetType='order'`

- **Table/field:** `LatenessEvent.orderId` + `LatenessEvent.targetId`
- **Schema location:** `prisma/schema.prisma:1198, 1205`
- **Issue:** When `targetType='order'`, `targetId == orderId`. The schema header explains why (denormalised for "fast filtering") but the duplication invites drift if a writer sets one but not the other. Same shape for `jobId` when `targetType='job'`.
- **Risk:** Latent. Lateness writes are funneled through `openOrUpdateLateness` so consistency holds today, but ad-hoc inserts (test fixtures, scripts) won't get the symmetry right.
- **Fix:** Drop `targetType` and `targetId`; require `jobId XOR orderId` via Postgres CHECK. Filtering then uses the discriminator column directly. Alternatively keep both but add a CHECK that they agree.

## P1 — `RainedOffDay` index missing for "all sites this date range"

- **Table/field:** `RainedOffDay.date`
- **Schema location:** `prisma/schema.prisma:211-222`
- **Issue:** Unique `(siteId, date, type)` exists — serves per-site queries. The weather cron and several analytics routes ask "all rained-off days in date range X" cross-site; this scans the table.
- **Risk:** Latent. Weather data accumulates ~250 rows/year/site, so the absolute scan is small. Indexing scales better.
- **Fix:** Add `@@index([date])`.

## P1 — `TemplateMaterialConsumption.jobId` is nullable but never SetNull on Job delete

- **Table/field:** `TemplateMaterialConsumption.jobId`
- **Schema location:** `prisma/schema.prisma:645-653`
- **Issue:** No `Job?` relation declared — only the `TemplateMaterial` parent FK. So `jobId` is a dangling reference column with no FK constraint. If the Job is deleted, consumption rows keep a stale `jobId` pointer.
- **Risk:** Latent. Today the Quants Burn-Down report reads `jobId` defensively, but any join on it would produce nothing for deleted jobs.
- **Fix:** Either add a proper FK `job Job? @relation(fields: [jobId], references: [id], onDelete: SetNull)`, or drop the column.

## P1 — `Site.assignedToId` cascade to User missing, but Job.assignedToId cascade behaviour different

- **Table/field:** Site.assignedTo vs Job.assignedTo / signedOffBy
- **Schema location:** `prisma/schema.prisma:197, 335, 336`
- **Issue:** All three lack `onDelete` — Restrict default. But the site PUT in `route.ts:153-158` cascades `assignedToId` down to all jobs on the site when the site's assignee changes. There's no symmetric cleanup when a User is removed — the assignedToId column on Job stays, blocking User deletion.
- **Risk:** Current bug — see also the "Many optional User refs default to Restrict" finding.
- **Fix:** SetNull on all three.

---

## P2 — `Site.location` and `Site.address` overlap

- **Table/field:** `Site.location`, `Site.address`
- **Schema location:** `prisma/schema.prisma:182-183`
- **Issue:** Two nullable text fields with no clear distinction. UI tends to pick one for display.
- **Risk:** P2. Wastes a column; new engineers write to the wrong one.
- **Fix:** Pick one; migrate the other into `address`. Site has `postcode` separately, which is fine.

## P2 — `Supplier` has no unique constraint on `name`

- **Table/field:** `Supplier.name`
- **Schema location:** `prisma/schema.prisma:404-418`
- **Issue:** No `@unique`. Two "Travis Perkins" rows can coexist if the import script runs twice.
- **Risk:** Latent. Duplicates fragment supplier-performance reports.
- **Fix:** Add `@unique` to `name`, or a unique composite on (name, accountNumber). Existing duplicates need merge tooling first.

## P2 — `Contact.email` has no unique constraint

- **Table/field:** `Contact.email`
- **Schema location:** `prisma/schema.prisma:497`
- **Issue:** Same as Supplier — nullable email with no unique. Contacts can duplicate. Possibly intentional (one person can have multiple roles — supplier rep + contractor lead — across rows), but worth a deliberate decision.
- **Risk:** P2. Reports group by email and surface duplicates.
- **Fix:** Decide policy; add `@unique` if duplicates are accidental.

## P2 — `SnagPhoto` is anonymous; `JobPhoto` tracks uploader

- **Table/field:** `SnagPhoto.uploadedById` (missing)
- **Schema location:** `prisma/schema.prisma:900-911`
- **Issue:** JobPhoto records who uploaded each photo (`uploadedById`) but SnagPhoto doesn't. Asymmetric — snags are often more contentious than progress photos, so audit trail matters more.
- **Risk:** P2. Compliance review loses provenance.
- **Fix:** Add `SnagPhoto.uploadedById String?` + relation.

## P2 — `TemplateOrder.orderWeekOffset` + `deliveryWeekOffset` are denormalised caches, not flagged

- **Table/field:** `TemplateOrder.orderWeekOffset`, `deliveryWeekOffset`
- **Schema location:** `prisma/schema.prisma:748-749`
- **Issue:** Per `MEMORY.md`/`project_template_ssot.md`, these are derived caches recomputed from anchor fields. Schema doesn't mark them or comment them as such — readers will assume they're truth.
- **Risk:** P2. Reader confusion only — writers go through `template-order-offsets.ts`.
- **Fix:** Add inline comments mirroring the SSOT doc and pointing at the helper.

## P2 — Inconsistent use of `@id @default(cuid())` vs `@id @default("default")` for singletons

- **Table/field:** `AppSettings.id`
- **Schema location:** `prisma/schema.prisma:1140`
- **Issue:** Uses `@default("default")` for a singleton — fine pattern, but unique in the codebase. If a future writer creates a second row with a different id, all bets are off (no enforced singleton).
- **Risk:** P2 — Postgres CHECK is overkill; convention works.
- **Fix:** Document the singleton invariant in the model header; consider a CHECK `id = 'default'` for paranoia.

## P2 — Migration script discipline — schema fields without an `apply-*.ts`

- **Issue:** Several schema additions are visible (e.g. `Plot.shareToken`, `Job.originalStartDate`, `Plot.sourceVariantId`, `MaterialOrder.isSplit`) but the `scripts/` directory has a flat list of 16 apply scripts. There's no manifest mapping field→script. A field that landed in schema but missed the matching `apply-*.ts` is silently absent in prod.
- **Schema location:** project-wide — `scripts/apply-*.ts` inventory
- **Risk:** Latent. Already happened once with the variants rework (a follow-up `migrate-variants-to-fullfat.ts` was needed).
- **Fix:** Add `scripts/README.md` indexing each script → which fields/tables it covers, and a CI check that `prisma migrate diff` against prod returns empty after running all scripts.

## P2 — `EventLog.delayReasonType` is a String when SCHEDULE_CASCADED happens

- **Table/field:** `EventLog.delayReasonType`
- **Schema location:** `prisma/schema.prisma:1365`
- **Issue:** Comment says it's set when `type=SCHEDULE_CASCADED`. Field is `String?` with the same enum candidate as the proposed `WeatherImpactType` expansion (WEATHER_RAIN / WEATHER_TEMPERATURE / OTHER).
- **Risk:** P2. Filter queries on it are case-sensitive; the lateness inference helper compares uppercase (`r === "WEATHER_RAIN"`) so a writer setting lowercase silently breaks attribution.
- **Fix:** Enum or at least a CHECK constraint.

---

## Summary

P0: 8 findings (cascade choices destroying historical evidence — orders, RAMS; convention-only invariants — order target, EventLog immutability, originalDates; User-delete block via Restrict default on required and optional refs; documentation/code drift on Plot.completedAt).
P1: 16 findings (missing indexes — deliveredDate, PlotMaterial.plotId, MaterialOrder.contactId, (plotId,status) composite; LatenessEvent's supplier/contact mismatch + String discriminator; string columns that should be enums; Snag.notes internal/external mix; OrderItem.totalCost denormalisation; double-assignee on Snag; pivot table lacking role/rate; share defaults inconsistency; RainedOffDay range index; TemplateMaterialConsumption missing FK; cascade asymmetry on Site/Job assignee).
P2: 8 findings (Site.location/address overlap; missing unique on Supplier.name and Contact.email; SnagPhoto anonymous; cache documentation gaps; singleton pattern; migration discipline; delayReasonType String).

Total: 32 findings.
