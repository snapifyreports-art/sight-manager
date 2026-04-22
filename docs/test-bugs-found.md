# Smoke Test Bugs Found — 2026-04-21

## CRITICAL

### 1. Pull Forward — Date shift by 1 day
- **Repro**: Plot 4 > Strip-out > Pull Forward > click "Start Mon 27 Apr"
- **Expected**: Start Date = Mon 27 Apr 2026
- **Actual**: Start Date = Sun 26 Apr 2026 (weekend!)
- **Impact**: All Pull Forward actions store dates 1 day earlier than labelled
- **Likely cause**: Option label formats date as local (Mon 27 Apr) but PATCH body sends `new Date(2026, 3, 27)` which serialises to UTC midnight, then API parses and stores as `2026-04-26T23:00:00Z` (BST offset) → displays as 26 Apr in UK TZ.
- **Fix direction**: use `toLocaleDateString("en-CA")` or explicit `YYYY-MM-DD` string at the call site, not `.toISOString()` on a local Date.

### 2. Pricelist Review dialog — CONFLICT not detected
- **Repro**: Add order to template stage, pick Jewson, type custom item "Ready-mix C25 concrete" @ £110/m³ (pricelist has it at £95). Save order.
- **Expected**: Review dialog shows CONFLICT state with radio group {Update existing price / Add as separate item (with name)}.
- **Actual**: Review dialog shows simple "add to price list" checkbox — would create a DUPLICATE row in the pricelist.
- **Impact**: Defeats the whole point of the conflict detection. Silently creates duplicates.

### 3. Pricelist Review dialog — EXACT match not detected when clicked from bubble
- **Repro**: Add order to stage, pick Jewson. Click "Hardcore Type 1 £32.00/tonnes" bubble in Materials panel. Save order.
- **Expected**: Review dialog shows "already in list" (green, no action).
- **Actual**: Review dialog offers "add to price list" — would create a duplicate.
- **Note**: First bubble click (C16 Timber) DID register as "already in list". Second bubble click (Hardcore Type 1) did not. Intermittent? Or an issue with how pricelistItemId is persisted when the bubble is clicked after scroll/re-render.

### 4. Atomic stage duration save doesn't propagate to startWeek/endWeek
- **Repro**: Template editor > Edit atomic stage > tick "This job has no sub-jobs" > set Duration = 15 (days) > Update Stage. Reopen the dialog.
- **Expected**: Timeline shows stage spanning 3 weeks (Wk 2-4) and Jobs list shows Wk 2-4.
- **Actual**: Duration 15 saved correctly in form but Timeline Preview + Jobs list still show Wk 2-2 (1 week). Data correct when the template is APPLIED to a plot (Plot 4's Refurbishment does span 3 weeks / 15 working days) — so it's a template-editor DISPLAY-only bug.
- **Fix direction**: after `durationDays` PATCH on a top-level atomic stage, client must trigger a bulk-stages recalc OR the API should recompute startWeek/endWeek from durationDays.

## MEDIUM

### 5. "Ungrouped" label for atomic stages on Plot overview
- **Repro**: Plot 4 (uses atomic-only template) > Overview > Jobs by Stage section.
- **Actual**: Shows "Ungrouped 0/2 done" as the only group.
- **Expected**: Show "Strip-out" and "Refurbishment" as separate rows (they're stages, even if they have no sub-jobs).
- **Root cause**: grouping logic likely looks for sub-jobs and falls back to "Ungrouped" when none exist.

### 6. Pull Forward — "Start today" label mismatch
- **Repro**: Plot 4 > Strip-out > Pull Forward.
- **Actual**: "Start today Wed 22 Apr 2026 · Blocked: Can't start in the past"
- **Issue**: "Today" is not "in the past" — today is today. The blocked-reason string is misleading. Likely the system snaps to start-of-current-week (Mon 20 Apr), which IS in the past relative to today, but the user-facing reason should explain the snap, not lie about the date.

### 7. Supplier name capitalisation
- **Repro**: Pull Forward preflight with pending order: "This job can't be pulled forward — **jewson** hasn't been ordered yet — 28 day lead time."
- **Expected**: Capitalised "**Jewson**".
- **Fix**: pass the supplier's `.name` field directly rather than lowercasing it somewhere.

## MINOR

### 8. "Wk 1–5" badge — en-dash looks like "--" at 10px
- Not a data bug. At 10px font, en-dash renders as two short lines, reads like double-hyphen.
- UX: consider wider separator at small sizes (e.g. "Wk 1 to 5" or "Wk 1/5") or use a cleaner hyphen.

### 9. Stage range "Wk 1-1" for single-week stages
- Visually awkward. For stages with startWeek == endWeek, display "Wk 1" not "Wk 1-1".

### 10. Atomic stage editor — no duration field in Add Stage dialog
- Currently: user must (a) create the stage with default 1 week (b) click Edit pencil (c) tick "This job has no sub-jobs" (d) set duration (e) hit Update.
- Five steps for a very common operation. Would be cleaner to have a "Duration (working days)" field directly in the Add Stage > Custom Stage form, OR default to atomic when subJobs is empty.

## Additional bugs found in action tests

### 11. Expand doesn't update displayed Start Date
- **Repro**: Plot 4 > Strip-out (planned 30 Apr) > Start > "Expand This Job".
- **Expected**: Start Date shows "22 Apr 2026" (today, the actual start).
- **Actual**: Start Date still shows "30 Apr 2026" after reload. Job is In Progress but the "planned 30 Apr" date is shown as if nothing changed.
- **Impact**: User can't tell from the page that Expand worked — has to scroll to Action History.
- **Fix direction**: either overwrite planned Start Date with today when Expand fires, OR show both (e.g. "Started: 22 Apr · Planned: 30 Apr").

### 12. Detail page doesn't auto-refresh after Delay
- **Repro**: Delay a job. Page stays on the old dates until manual reload.
- **Fix**: call `router.refresh()` in the hook after successful PATCH.

### 13. Pull Forward + Delay action history — supplier lower-case confirmed in logs too
- Action history shows "Pulled forward 6 working days — new start 2026-04-26" — 2026-04-26 is the wrong date (Sunday). Same root cause as bug #1.
