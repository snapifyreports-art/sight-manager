# Template ↔ Plot SSOT Audit — May 2026

**Trigger:** Keith asked, after a chain of small template-editor bugs (sub-job duration not propagating, lead time hidden in order-mode, order dots misplaced) whether the bugs could leak through to live plots — orders, alerts, contractor comms, analytics. And: "remember what we said about one source of truth? Do it."

This doc is the audit. It's read-only — no code changed yet. Keith approves the canonical model in §6, then we execute §7.

---

## 1. Headline answer

**Live plots are NOT in danger from the template-editor bugs.** Every downstream surface (Daily Brief, Programme, Dashboard, Orders tab, alerts, Contractor Comms, Analytics, Notifications, push) reads concrete plot-level date fields (`Job.startDate`, `Job.endDate`, `MaterialOrder.dateOfOrder`, `MaterialOrder.expectedDeliveryDate`). They do **not** re-cross-reference into the template. Once a plot is applied, its dates are baked.

So the worry "template-editor bugs ripple into a running site" is — happily — wrong. A bug in the editor only affects **newly applied plots**.

**Where the system IS fragile:** inside the template subsystem itself, the same business value (a sub-job's duration, an order's lead time, an order's anchor) is stored multiple ways. Different code paths read different fields. That's how we ended up with the bugs Keith just hit.

---

## 2. The redundancy map (what's stored more than once)

### TemplateJob

| Concept | Stored as | Used by |
|---|---|---|
| Sub-job duration | `durationDays` | `apply-template-helpers.ts` (preferred) |
| Sub-job duration | `durationWeeks` | `apply-template-helpers.ts` (fallback, ×5) |
| Sub-job duration | `startWeek` / `endWeek` | TemplateEditor + TemplateTimeline rendering |
| Atomic-stage duration | `durationDays` | Apply, recalculate-stages |
| Atomic-stage duration | `durationWeeks` | Same, fallback |
| Atomic-stage duration | `startWeek` / `endWeek` | Editor render only |
| Sub-job ordering | `sortOrder` | Apply (cascade), editor drag-and-drop |
| Sub-job ordering | implicit in `startWeek` | Editor render |

So a sub-job's duration is in **three** places, and its position is in **two**. Whenever the user edits one, recalculate endpoints try to keep the others in sync — and that's where bugs creep in. Today's symptom was sub-jobs all snapping to whole-week slots because the recalc fallback was `durationWeeks ?? 1`.

### TemplateOrder

| Concept | Stored as | Used by |
|---|---|---|
| When to place order | `orderWeekOffset` (weeks before/after owner job start) | apply-template-helpers (canonical at apply) |
| When to place order | `anchorType` + `anchorAmount` + `anchorUnit` + `anchorDirection` + `anchorJobId` | TemplateEditor UI only |
| Lead time | `deliveryWeekOffset` (delivery offset in weeks from order date) | apply-template-helpers (legacy fallback) |
| Lead time | `leadTimeAmount` + `leadTimeUnit` | apply-template-helpers (preferred), TemplateEditor UI |

The newer "anchor" fields (`anchorType`, `anchorJobId`, etc.) are saved but **never read at apply time** — they exist only so the editor can re-populate the dialog. The legacy `orderWeekOffset` and `deliveryWeekOffset` are what apply actually consumes.

If someone changes `anchorJobId` in a future edit but the editor's `computeOffsets` doesn't run (e.g. a partial save bug), the order applies against the OLD anchor. That's the kind of silent drift Keith was right to be worried about.

---

## 3. Apply path (template → plot) — current state

`src/lib/apply-template-helpers.ts:createJobsFromTemplate` is THE canonical apply. Both single-plot and batch-plot apply funnel through it. Duration is read in this precedence order on every job/sub-job:

```
const days = durationDays > 0
  ? durationDays
  : durationWeeks > 0
    ? durationWeeks * 5
    : 5;
```

`startWeek`/`endWeek` are **only** consulted for the legacy "flat job, no children" branch. For modern templates with sub-jobs they are ignored at apply time. Good — apply is correct.

Order dates are computed at apply time from `orderWeekOffset` + `leadTimeAmount`/`leadTimeUnit` (or `deliveryWeekOffset` legacy fallback). Stored as concrete `dateOfOrder` and `expectedDeliveryDate` on `MaterialOrder`. After apply, the template offsets are forgotten — orders are absolute dates from then on.

---

## 4. Cascade & live-plot mutations — current state

`src/lib/cascade.ts` is the single canonical engine. Everything else (Pull Forward, Delay, the early-start "Pull Programme Forward" option) routes through it. The engine:

- Computes a working-day delta
- Shifts every job in scope (downstream of trigger) by that delta — preserves duration by construction
- Shifts every non-historical order on those jobs by the same delta — preserves order-to-delivery gap
- Re-derives parent dates from children
- Returns conflicts (job_in_past, order_in_past) for the caller to display

This is rock-solid. The audits found one wrinkle: the auto-reorder block in `actions/route.ts` (when a job is started, if its template has an order, and we don't already have an automated order from that supplier) creates a NEW MaterialOrder using `dateOfOrder = now` and `expectedDeliveryDate = now + leadTimeDays`. **That's inconsistent** with apply-time, which uses `dateOfOrder = jobStart + orderWeekOffset`. Same template + same job can produce different order dates depending on whether the order was created at apply or at job-start.

---

## 5. Where bugs CAN leak (the actual risk surfaces)

Out of everything audited, only these three spots can let a template-editor mistake affect a live system:

1. **Apply-time order math** — if `orderWeekOffset` / `deliveryWeekOffset` get set to wrong values because the editor's `computeOffsets` was buggy or the new anchor fields weren't translated, the resulting MaterialOrder dates on every newly-applied plot are wrong. Existing plots are fine; new applies inherit the bug.

2. **Auto-reorder on job start** — reads `templateJob.orders` and the `leadTimeAmount`/`leadTimeUnit`. If those are stored wrong, the auto-created order is wrong. Same blast radius — only fires for new applies and not-yet-started jobs.

3. **Pull-Forward preflight** — uses the JOB's stored `expectedDeliveryDate` and `leadTimeDays` (NOT template fields), so it's safe from editor bugs. Listed here only for completeness.

Everything else is plot-coupled. The audit found:

- **Daily Brief**, **Dashboard**, **Programme**, **Orders tab**, **Contractor Comms**, **Analytics**, **Notifications**: all read concrete plot/order dates only.
- **Cash-Flow**: uses `Job.originalStartDate`/`originalEndDate` which are snapshotted at apply — immune to subsequent template changes.
- **Budget-Report**: reads `TemplateJob.orders` for variance baseline only, not for any timeline math.

---

## 6. Proposed canonical model (Keith approves before §7)

### 6.1 Sub-job duration: **`durationDays` is the source of truth.**

- Editor's inline duration field is `d` (days). That's already the canonical input.
- `durationWeeks` and `startWeek` / `endWeek` become **derived caches** for the editor's grid layout. Any code that needs them computes from `durationDays` + `sortOrder` + parent's `startWeek`.
- Recalculate endpoints stop maintaining the cache on individual sub-jobs — instead, the Timeline component derives layout on the fly from `durationDays + sortOrder` for the parent. Each sub-job's `startWeek`/`endWeek` becomes effectively dead (kept in schema for legacy templates that never had `durationDays`).
- Migration: a tiny script that fills `durationDays` from `durationWeeks * 5` for any legacy sub-job missing days. Run once.

**Effect on live plots:** none. Apply already prefers `durationDays`. Editor renders correctly. No reapply needed.

### 6.2 Atomic stage duration: **`durationDays` is the source of truth.**

Same model as sub-jobs but at the parent level for stages with no children. Already mostly correct since the recalculate-stages fix shipped today.

### 6.3 Stage span (parent with children): **derived, never stored.**

Parent `startWeek` / `endWeek` are computed from children at every read. We already have `normaliseTemplateParentDates()` in `template-includes.ts` that does this. Make it the only way the editor ever displays parent span. Drop attempts to keep the parent's `startWeek`/`endWeek` row up to date in the DB — those writes become no-ops.

### 6.4 Order timing: collapse anchor fields → offset fields → delete the duplication.

Two options. Pick one:

**Option A — anchor fields are the source of truth.**

- `anchorType` (`order` / `arrive`), `anchorAmount`, `anchorUnit`, `anchorDirection`, `anchorJobId`, `leadTimeAmount`, `leadTimeUnit` are canonical.
- `orderWeekOffset` / `deliveryWeekOffset` become **derived** at apply time, not stored. Apply logic reads anchor fields, computes offsets, computes dates.
- Migration: re-derive anchor fields for any legacy order that has only offsets (currently in `populate` logic, line 1064+).

**Option B — offset fields are the source of truth.**

- `orderWeekOffset` / `deliveryWeekOffset` / `leadTimeAmount` are canonical.
- Anchor fields go away. Editor's natural-language inputs (arrive 0 weeks before Brickwork, lead 4 weeks) are converted to offsets on save and back on load — no anchor fields persisted.

**My recommendation: Option A.** Anchor fields express the user's intent ("arrive 0 weeks before Brickwork") in a way that survives the anchor job moving. If `Brickwork` is later shifted, an anchor-based order tracks it; an offset-based order is frozen. Long-term Keith wants anchor semantics anyway.

But Option B is faster to ship. And right now apply only reads offsets — going Option A means changing apply to read anchor fields and re-compute offsets on each apply.

### 6.5 Auto-reorder on job-start: align with apply-time math.

`actions/route.ts` currently sets `dateOfOrder = now` for auto-reorders. Change it to compute `dateOfOrder` from the SAME formula apply uses (`jobStart + orderWeekOffset`, snapped to a working day in the past, but never before today). That way the same template produces the same order timing whether the order is created at apply-time or auto-created at job-start.

---

## 7. Execution plan (after Keith picks 6.4 Option)

Each step is its own commit. Each is reversible.

### Step 1 — Editor renders sub-job layout from `durationDays + sortOrder` directly
Frontend-only. Timeline component takes `parentJob.children`, walks in `sortOrder`, accumulates a day cursor, places each bar at `(dayCursor / 5) * weekPixels` width `(days / 5) * weekPixels`. Bars span partial weeks. In Days view bars span Mon-Wed for a 3-day sub-job. This is the actual fix for today's screenshot.

### Step 2 — Recalculate endpoints become idempotent stubs
The endpoints still exist (legacy clients call them) but stop fighting the editor. They just refresh parent `endWeek` to `parent.startWeek + ceil(totalDays / 5) - 1`. Sub-job `startWeek`/`endWeek` are no longer touched.

### Step 3 — One-time migration script
Fills `durationDays` for any sub-job that has only `durationWeeks`. Doc'd as a one-shot. Idempotent.

### Step 4 — Order timing rework (depends on 6.4 choice)
If Option A: apply-time and auto-reorder both read anchor fields + compute offsets in-flight. Drop `orderWeekOffset` / `deliveryWeekOffset` columns OR keep them as caches updated on every save.
If Option B: drop anchor fields, save converts on submit. Apply unchanged.

### Step 5 — Auto-reorder alignment
Patch `actions/route.ts` to use the same `dateOfOrder` formula as apply. One commit, ~10 lines.

### Step 6 — End-to-end smoke
Verify in browser:
- Edit a sub-job from 5d → 20d → bars + stage span all reflect immediately
- Create plot from template → plot's job dates match expectation
- Move the plot's job → orders shift consistently
- Delete one of the redundant fields (durationWeeks for example) on a legacy template via dev-tools → editor still renders correctly because durationDays is canonical

### Step 7 — Documentation
Update `docs/master-context.md` and `docs/cascade-spec.md` to declare the canonical model (one paragraph each).

---

## 8. What's NOT in scope

- Live-plot orders re-anchoring when the template is edited later. The current "frozen at apply" behaviour is intentional — Keith confirmed earlier that he wants templates to be snapshots, not live-linked. If we want to surface "this template differs from your live plots" warnings, that's a separate piece.
- Renaming/changing the schema columns. Even if `durationWeeks` becomes derived, we don't drop the column — it stays for backward compat with legacy data. New writes just stop touching it.
- Anything related to plots already in flight. They're already concrete dates, immune.

---

## 9. Sign-off needed from Keith

1. Pick **Option A** or **Option B** for §6.4 (order anchor vs offset).
2. Confirm the execution order in §7 — happy to start with Step 1 (editor render fix) immediately, hold the rest pending review.
3. Confirm "one source of truth" means **`durationDays` for durations, anchor fields for order timing** (Option A) — or override.

Once you say go, I execute. Won't make schema changes without explicit nod.
