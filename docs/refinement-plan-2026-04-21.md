# Refinement Plan — Full Browser Smoke Test (2026-04-21)

This plan captures the **major** bugs and UX refinements surfaced during Keith's
full-pass browser smoke test. Small visual tweaks and easy one-liners are listed
but the bulk of this document is larger pieces of work that require a proper
design pass, not inline hacks.

**Accompanying file**: `docs/test-bugs-found.md` — raw bug list, in discovery
order, with repro steps.

---

## What the test covered

1. Template creation
   - Template #1: SMOKE_TEST — Simple Semi (3 stages, 4+2+2 sub-jobs, Jewson order on Groundworks)
   - Template #2: SMOKE_TEST — Flat Conversion (2 atomic stages, no sub-jobs)
2. Site creation
   - SMOKE_TEST — Staggered Six, 6 plots across 2 plot groups with staggered starts (27 Apr / 4 May)
   - 3 plots on Template #1 (Simple Semi) + 3 plots on Template #2 (Flat Conversion)
3. Actions exercised end-to-end
   - Pull Forward (with pending-order preflight, with clean-week-start default, with custom date)
   - Delay (by working days, with rain reason)
   - Expand (via Start > "Expand This Job" option)
   - Early Order (bulk Mark Sent from the Orders tab)
   - Custom Order (4-step wizard with plot + stage + details + late-delivery review)
   - Walkthrough (mobile-first) — pagination, Add Note with quick-chip
   - Notes (inline on job page + via Walkthrough)

## Headline: things that are working really well

- **Walkthrough screen**. The quick-note chips, the big Start button, the
  one-page-per-plot pagination — exactly right for a site manager on their
  phone. Don't regress this.
- **Pull Forward preflight with pending orders**. The "jewson hasn't been
  ordered yet — 28 day lead time" block is a real feature that caught a real
  problem. Keep the pattern.
- **Custom Order wizard's late-delivery warning**. "Delivery date (6 May) is
  after the job start date on 1 plot: Plot 4 — job starts 30 Apr 2026" — nails
  the problem without scolding.
- **Orders grouping**. Three Jewson Groundworks orders across P1/P2/P3
  collapsed into one card with plot chips. Clean, fast to scan.
- **4-tier Pull Forward options** (Today / Clean Monday / Keep original /
  Custom date) is a gorgeous UX pattern. It makes the right thing easy.

## Priority 1 — fix this week

### P1.1 — Pull Forward stores dates 1 day earlier than the user picked

**Severity: critical, data integrity.**

User clicks "Start Mon 27 Apr" → DB stores `2026-04-26` (Sunday). All
downstream dates (Delay preview, Action History, Order due dates,
programme view) then work off the wrong date. We confirmed:
- Detail page shows "Start Date: 26 Apr 2026"
- Action History logs `new start 2026-04-26`
- Subsequent Delay correctly adds +3 working days, landing on Thu 30 Apr

**Likely cause**: the option label builds a label string from a local Date, but
the API payload serialises the same Date via `.toISOString()`, which in BST
(UTC+1) shifts midnight local → 23:00 previous day UTC. Prisma/Postgres
stores it; the UI then renders it as "previous day" in the UK timezone.

**Fix path**: in `src/hooks/useJobAction` (or wherever the Pull Forward PATCH
is built), always send the date as an explicit `YYYY-MM-DD` string derived
from `toLocaleDateString("en-CA")` on the local Date, not `.toISOString()`.
Same treatment everywhere a user-chosen *date* (not instant) crosses the
wire. Add a unit test.

### P1.2 — Pricelist review dialog has no CONFLICT state

**Severity: medium, silently pollutes the pricelist.**

When a user types a custom order item whose **name** matches an existing
pricelist entry but **price/unit** differs, the review dialog offers
"add to price list" as a plain checkbox. Checking it creates a duplicate
row, defeating the whole point of the review. The feature we designed
earlier — radio group with "Update existing price" vs "Add as separate
item (type a distinguishing name)" — isn't wired in.

**Fix path**: look at `useReviewSupplierMaterials` — the conflict detection
helper likely only fires when the user **clicked** a pricelist bubble and
then changed the price. Extend it to also detect by **name match** on custom
items. Render the radio group for those.

### P1.3 — Expand doesn't update displayed Start Date

**Severity: high, breaks user's mental model.**

Clicking Start > "Expand This Job" flips status to In Progress but leaves
Start Date showing the planned date. The user can't tell from the page that
Expand worked — only Action History reveals it. Minimally we need one of:
- Overwrite planned Start Date with today when Expand fires, OR
- Add a subtitle under Start Date: "Started 22 Apr · planned 30 Apr"
- Best: both — update the field AND show the variance.

### P1.4 — Atomic stage duration change doesn't reshape the template timeline

**Severity: medium, confusing in the editor.**

Setting a stage's duration to 15 working days saves `durationDays` but the
stage's stored `startWeek`/`endWeek` stay at 1-week defaults. The Timeline
Preview keeps showing "Wk 2-2". The data is correct *when applied to a
plot* (Plot 4's Refurbishment span was right) — but the editor lies.

**Fix path**: after PATCHing `durationDays` on a top-level atomic stage,
trigger a sibling-stage recompute (the `/bulk-stages` endpoint already
exists, or add an endpoint that recalculates all top-level stage weeks
from their durations in sortOrder).

### P1.5 — Notes page crash on Add Note ✅ ALREADY FIXED

Fix committed `adcae47` and pushed. Root cause: `handleAddNote` prepended
the PATCH response (a `Job`) to `job.actions`; the render code then tried
`action.action.charAt(0)` on an object with no `.action` field and brought
down the whole page. Also hardened the render with a fallback key.

## Priority 2 — same sprint, smaller fixes

### P2.1 — "Start today" is blocked with misleading reason

"Start today Wed 22 Apr 2026 · Blocked: Can't start in the past"

Today is not in the past. The message is wrong *even though* the logic is
probably right (it snaps to start-of-current-week Mon 20 Apr, which *is*
past). Correct the user-facing reason: "Blocked: week already started —
next clean Monday is [dd Mmm]."

### P2.2 — Supplier name capitalisation in preflight

"jewson hasn't been ordered yet" — pass `.name` through, don't lowercase.

### P2.3 — Atomic stages show as "Ungrouped" on the Plot overview

Plot 4 (atomic-only template) lists its stages under "Ungrouped 0/2 done".
The grouping logic looks for sub-jobs and falls back when none exist;
instead, treat any stage-code-bearing job as its own group.

### P2.4 — Job detail page doesn't auto-refresh after Delay

After clicking "Delay 3 days" the dialog closes but the page keeps the old
dates. Hard reload shows the new dates. Add `router.refresh()` to the Delay
hook's success handler (same pattern we just applied to Add Note).

### P2.5 — Week range visual readability

- "Wk 1–5" renders as "Wk 1--5" at 10px font because the en-dash turns into
  two short strokes. Swap to a hyphen at small sizes, or use a wider
  separator.
- For single-week stages, `Wk 1-1` reads awkwardly. Render just "Wk 1" when
  `startWeek === endWeek`.

### P2.6 — Custom-stage atomic flow is five clicks deep

Today, to make a 3-week atomic stage, the user must: add stage with default
1 week → click edit pencil → tick "This job has no sub-jobs" → type
duration → hit Update. Put the duration field directly in the Add Stage >
Custom Stage form and let the user declare atomic-ness up front.

### P2.7 — "Hardcore Type 1" bubble click didn't persist pricelistItemId

First pricelist bubble click (C16 Timber) → review shows "already in list".
Second bubble click (Hardcore Type 1) → review shows "add to price list".
Intermittent. Likely a state/race bug in how the click handler stamps
`pricelistItemId` onto the items array when the supplier materials panel
has re-rendered (scroll, catalogue filter, etc.). Needs reproduction with
browser devtools to confirm.

## Priority 3 — nice-to-haves, next iteration

- **"Next order" hint in preflight.** The current "jewson hasn't been ordered
  yet — 28 day lead time" is great. Going one better: offer a "Mark ordered
  now" button inside the preflight so the user can unblock the Pull Forward
  without navigating away.
- **Action History filters.** Today all actions live in one stream. With
  heavy use (we already have 3 per job) a filter chip-row — `All · Delays ·
  Notes · Status changes` — will stop the list becoming a wall.
- **Pull Forward "custom date" — weekend guard.** Give the user a friendly
  nudge if they pick Sat/Sun, or silently snap to nearest working day.
- **Expand — "started early by N days" badge** next to the status pill.

## Non-issues noted during testing

- "Wk 1--5" stage badges are actually en-dash `–` at 10px — confirmed with
  `codePoint` check — not doubled hyphens in source. Readability fix only.
- Click handler for the HelpTip ? icon works, but doesn't dismiss via `ref`
  `form_input` (can only be triggered by `computer left_click`). Automation
  nit, not a user-facing bug.
- Dialog close button can be flaky with ref clicks; Escape is the reliable
  way to dismiss. Automation nit.

## Deliverables for the sprint

1. **Must ship**: P1.1 (timezone date drift), P1.2 (conflict state), P1.3
   (Expand visual), P1.4 (atomic editor recalc).
2. **Should ship**: P2.1–P2.6.
3. **Regression net**:
   - A unit test for the Pull Forward date builder that asserts
     `YYYY-MM-DD` is stored for BST, GMT, and a TZ-crossing midnight.
   - A snapshot test for the pricelist review dialog covering NEW / EXACT /
     CONFLICT.
   - An integration test: create atomic stage → set 15 days → open
     Timeline Preview → assert span is Wk 1-3, not Wk 1-1.
   - Playwright flow: Add Note on a job (protects against P1.5 recurring).

## How I ran the test

Browser-only, driving Keith's Chrome via MCP. Full transcript preserved in
the April session JSONL (see repo logs). Screenshots captured at each
assertion point. Inline fix for P1.5 committed + pushed
(`adcae47`), which deployed while the rest of the test continued on the
old build.
