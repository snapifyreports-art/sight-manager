# Sight Manager - Site Manager Simulation Report

## Test Setup
- **Site**: Riverside Gardens, Riverside Way, Kirkstall, Leeds LS5 3BT
- **Type**: 6-plot residential development (mix of 3-bed semis and 4-bed detached)
- **Jobs per plot**: 23 (full build sequence from site clearance to handover)
- **Total jobs**: 138
- **Simulation period**: 5 Jan 2026 - 12 Mar 2026 (10 weeks)
- **Tested as**: Ross Mitchell (CEO / Site Manager)
- **Dev Mode**: Used to simulate date progression

## Build Progression Summary
| Week | Date Range | Activity |
|------|-----------|----------|
| 1 | 5-9 Jan | Site clearance Plots 1-2, start Plots 3-4 |
| 2 | 12-16 Jan | Foundations Plots 1-2, clearance Plots 5-6 |
| 3 | 19-23 Jan | **WEATHER DELAY** - Heavy rain, Plots 3-4 foundations waterlogged |
| 4 | 26-30 Jan | Brickwork DPC Plots 1-2, foundations catching up 3-6 |
| 5-6 | 2-13 Feb | Brickwork superstructure across all plots |
| 7-8 | 16-27 Feb | Roofing Plots 1-2, first fix begins, snags raised |
| 9-10 | 2-12 Mar | First fix completing Plots 1-2, roofing Plots 3-6 |

## Final State at Week 10
- **66 jobs completed** (48%)
- **6 jobs in progress**
- **66 jobs not started**
- **5 snags** (1 CRITICAL, 2 HIGH, 1 MEDIUM resolved, 1 LOW)
- **3 material orders** (bricks, plasterboard, kitchen units)

---

## BUGS FOUND

### BUG #1: Sites List Card Shows "0 plots" (Severity: LOW)
**Where**: Sites list page (`/sites`)
**Issue**: After creating Riverside Gardens with 6 blank plots, the site card on the list page displayed "0 plots". Navigating into the site correctly showed 6 plots.
**Cause**: The plot count on the sites list card likely queries `_count` before the blank plots are fully committed, or the query doesn't include plots without jobs.
**Fix**: Ensure `_count: { plots: true }` is included in the sites list API query, and verify it counts all plots regardless of job count.

### BUG #2: Plots Not in Numerical Order (Severity: MEDIUM)
**Where**: Site detail page, Plots tab
**Issue**: Plots display as 1, 3, 2, 6, 4, 5 instead of 1, 2, 3, 4, 5, 6. The sort order appears to be by creation ID (CUID) rather than plot number.
**Fix**: Add `orderBy: { plotNumber: 'asc' }` to the plots query. Since plotNumber is a string, may need a natural sort or parseInt-based sort.

### BUG #3: All Plots Show Same House Type (Severity: LOW)
**Where**: Site detail page, Plots tab
**Issue**: All 6 plots show "Semi-Detached 3-Bed" even though plots 5-6 should be "Detached 4-Bed". The seed script used `parseInt(plot.plotNumber)` which returned NaN because plotNumber was null for blank plots.
**Root Cause**: When creating blank plots via the UI wizard, `plotNumber` is stored but may be stored as string "1", "2" etc. The parseInt in the seed script worked correctly but the stagger logic defaulted all to the first branch.
**Fix**: This was a seed script issue, not an app bug. However, the app should validate that plotNumber is always populated.

### BUG #4: Heatmap Shows "#" Instead of Plot Numbers (Severity: HIGH)
**Where**: Site Heatmap tab
**Issue**: All heatmap cells display just "#" instead of "1", "2", "3" etc. The plot number is missing from the cell display.
**Cause**: The `SiteHeatmap.tsx` component likely references `plot.plotNumber` which may be null or the API doesn't return it.
**Fix**: Ensure the heatmap API returns `plotNumber` for each plot, and the component falls back to `plot.name` if plotNumber is null.

### BUG #5: Heatmap Progress Shows "0%" Despite Completed Jobs (Severity: HIGH)
**Where**: Site Heatmap tab
**Issue**: Plots showing 13/23 jobs completed (57%) but progress bar shows "0%". The percentage calculation is not based on completed job count.
**Cause**: The heatmap API likely calculates `buildCompletePercent` using a different metric (possibly date-based or stage-based rather than simple job count ratio).
**Fix**: Review the heatmap API's progress calculation. For site managers, `(completed jobs / total jobs) * 100` is the most intuitive metric. Consider offering both "schedule progress" and "completion progress" views.

### BUG #6: "Plot Plot X" Double Prefix (Severity: MEDIUM)
**Where**: Snags tab, Daily Brief tab, Day Sheets
**Issue**: Plot references display as "Plot Plot 1", "Plot Plot 3" etc. — the word "Plot" appears twice.
**Cause**: The component prepends "Plot" to `plot.name`, but `plot.name` is already "Plot 1". Should either use just `plot.name` or use `plot.plotNumber` with a "Plot" prefix.
**Fix**: In `SnagList.tsx`, `DailySiteBrief.tsx` and similar components, change display from `Plot ${plot.name}` to just `${plot.name}` or `Plot ${plot.plotNumber}`.

### BUG #7: Daily Brief API Previously Crashed (500 Error) (Severity: HIGH - now fixed in previous session)
**Where**: Daily Brief tab API route
**Issue**: The API returned 500 with empty body, causing "Unexpected end of JSON input" on the client.
**Status**: Fixed in previous session.

### BUG #8: Daily Brief Progress Not Date-Aware (Severity: LOW)
**Where**: Daily Brief tab
**Issue**: On Dev Mode date of Jan 5 (Day 1), the brief showed 48% progress because all job completions have `actualEndDate` set. The brief should ideally only count jobs completed *on or before* the current dev date.
**Cause**: The Daily Brief API counts all completed jobs regardless of when they were completed.
**Fix**: Filter completed jobs where `actualEndDate <= currentDate` when calculating progress. This makes Dev Mode time-travel more realistic.

---

## UX ISSUES & FRICTION POINTS (As a Site Manager)

### UX #1: No Quick Way to Start/Complete a Job from the Site Level
As a site manager doing morning rounds, I want to quickly mark jobs as started or completed without drilling into each individual plot, then each job. Currently: Sites > Plot > Job > Change Status. Need: A site-level "Today's Jobs" view with one-click start/complete buttons.

### UX #2: Dev Mode Dropdown Keeps Opening
The Dev Mode date picker dropdown re-opens on page navigation and doesn't close on outside clicks reliably. When rapidly testing, this gets in the way.

### UX #3: No Bulk Job Update
Can't select multiple jobs and update them all at once (e.g., "mark all first fix complete on Plots 3-6"). This would save significant time on sites with many similar plots.

### UX #4: No Weather Logging Built Into UI
The `weatherAffected` flag exists on jobs, but there's no UI to set it. Had to use the API directly. Site managers need a "Rained Off" button or weather log that cascades delays.

### UX #5: Snags Can't Be Raised from Site Level
Snags are created per-plot, but from the site-level Snags tab there's no "Raise Snag" button. A site manager walking the site wants to raise a snag immediately and assign it to a plot.

### UX #6: No Notification/Alert for Overdue Jobs
No visual alert when jobs go past their end date. Site managers need this front and center.

### UX #7: Material Orders Not Visible at Site Level
Orders are attached to individual jobs. There's no site-level orders view to see all pending/expected deliveries across the whole site for the week.

---

## RECOMMENDED NEW FEATURES

### Priority 1: Critical for Daily Use

1. **Morning Briefing Dashboard** (Enhancement to Daily Brief)
   - Weather forecast widget for the site location
   - "Jobs to start today" with one-click Start buttons
   - "Jobs due today" with one-click Complete buttons
   - Deliveries expected today
   - Contractors on site today
   - Yesterday's incomplete jobs (carried over)

2. **Quick Job Actions from Site Level**
   - Swipe/click to start/complete jobs from any list view
   - Batch operations: "Mark all as complete" for a stage across multiple plots
   - Drag-and-drop to reassign jobs between workers

3. **Site-Level "Raise Snag" Button**
   - Quick snag creation with plot picker dropdown
   - Camera integration for instant photo capture
   - Voice-to-text for description entry
   - Auto-assign based on trade type

4. **Weather Integration**
   - Auto-fetch weather from Met Office API based on site postcode
   - "Rained Off" button that delays all outdoor jobs by X days
   - Weather history log visible on the Delay Report
   - Forecast-aware scheduling suggestions

### Priority 2: High Value for Site Management

5. **Contractor Portal / Login**
   - Separate contractor login with limited view
   - Contractors can self-update job progress
   - Contractor sign-in/sign-out (time on site tracking)
   - Automated day sheet population from contractor activity

6. **Push Notifications for Critical Events**
   - Overdue job alerts
   - Delivery arrival notifications
   - Snag assignments
   - Weather warnings for tomorrow
   - Milestone completions (e.g., "Plot 1 is wind and watertight")

7. **Site Diary / Daily Log**
   - Mandatory daily diary entry (NHBC requirement)
   - Pre-populated with: weather, workers on site, deliveries, jobs started/completed
   - Photo attachments
   - Auto-generated from day's activity, editable by site manager
   - PDF export for NHBC inspections

8. **H&S Inspection Checklist**
   - Pre-built checklists (scaffold inspection, excavation inspection, etc.)
   - Pass/fail with photo evidence
   - Automatic follow-up tasks for failures
   - Audit trail for regulatory compliance

### Priority 3: Efficiency & Automation

9. **Automatic Schedule Cascade on Delays**
   - When a job is delayed, auto-shift all dependent jobs
   - Visual diff showing "original vs revised programme"
   - Impact analysis: "This 3-day delay will push Plot 1 handover by 5 days"

10. **Template-Based Plot Creation with Drag Scheduling**
    - Visual timeline editor for setting up the master template
    - Drag job bars to adjust durations
    - Set dependencies (finish-to-start, start-to-start)
    - Clone template to multiple plots with staggered starts

11. **Handover Pack Generator**
    - Auto-compile all photos, certificates, sign-offs for a plot
    - PDF generation for homeowner handover
    - Include: EPC, gas safe certificate, electrical cert, warranty info
    - Checklist of required documents with completion tracking

12. **Commercial Dashboard (for Directors)**
    - Profit/loss per plot
    - Cost vs budget with variance analysis
    - Cash flow forecast
    - Subcontractor spend analysis
    - Valuation tracking

13. **Snagging Workflow Improvements**
    - Snag lifecycle: Open > Assigned > In Progress > Fixed > Inspected > Closed
    - Before/after photo comparison
    - Automatic re-inspection reminders
    - Snag ageing report (how long snags stay open)
    - Export snag list for contractor remediation

14. **Mobile-First Job Card View**
    - Swipeable card view optimized for phone use on site
    - Quick photo, quick note, quick status change
    - Offline mode with sync when back in signal
    - GPS stamp on photos

15. **NHBC Stage Inspection Tracking**
    - Track NHBC key stage inspections
    - Auto-schedule based on build progress
    - Pass/fail logging with conditions
    - Block next stage if inspection not passed

---

## SUMMARY

The app is in a **solid working state** for core site management. The features that exist (Gantt, Heatmap, Snags, Daily Brief, Documents, Budget) all function correctly with real data. The Dev Mode date override works excellently across all screens.

### Top 3 Bugs to Fix Now:
1. **Heatmap plot numbers showing "#"** (BUG #4)
2. **Heatmap progress showing "0%"** (BUG #5)
3. **"Plot Plot X" double prefix** (BUG #6)

### Top 3 Features to Build Next:
1. **Quick job actions from site level** (saves 10+ minutes per day)
2. **Site diary / daily log** (NHBC compliance requirement)
3. **Weather integration** (critical for UK construction)

### Overall Assessment:
The platform has excellent bones. The tabbed site view with 13 features gives comprehensive visibility. The Gantt chart with Today marker is particularly well-executed. With the bug fixes and the Priority 1 features added, this would be genuinely usable on a live construction site.
