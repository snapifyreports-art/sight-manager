# Sight Manager — Full System Audit
## Date: 31 March 2026

---

# REPORT 1: CAUSE & CONSEQUENCE
*"Every action traced — what should happen vs what actually happens"*

## Working Site Context

Imagine Keith's Site is mid-build: Plot 3 has just finished Groundworks, Plot 7 is starting Brickwork late, and a delivery from Jewson hasn't arrived. Here's where the system falls down:

---

### CRITICAL: System Would Fall Down Here

| Scenario | What Should Happen | What Actually Happens | Impact |
|---|---|---|---|
| **Contractor not told job is ready** | Baker Groundworks should get a notification when their next job starts | No notification sent to contractors on job start | Contractor doesn't show up. Work stalls. |
| **Job completed from job detail page** | PostCompletionDialog should ask about next job | Nothing — just refreshes the page | Next job sits idle. No cascade decision made. Plot stalls. |
| **Job completed from plot detail page** | Same PostCompletion flow | Nothing — just refreshes | Same stall. |
| **Plot progress stuck at 0%** | buildCompletePercent should update when jobs complete | Field is NEVER written to — always 0 | Heatmap, analytics show 0% progress even with completed jobs |
| **Pull forward loses original dates** | originalStartDate/End should be preserved before shifting | restart-decision API doesn't preserve originals | "Original vs Current" overlay shows wrong data. Can't track baseline. |
| **Multi-site security** | Contractor role should only see their assigned sites | No site-level access filtering | Any logged-in user can view any site's data |

---

### HIGH: Broken Flows That Cause Confusion

| # | Action | Expected Consequence | Actual Result | Severity |
|---|--------|---------------------|---------------|----------|
| 1 | Job Started | Contractor notified | No notification sent | HIGH |
| 2 | Job Started | Plot progress % updates | buildCompletePercent never written | HIGH |
| 3 | Job Completed (JobDetailClient) | PostCompletionDialog shown | Nothing — page refreshes silently | HIGH |
| 4 | Job Completed (PlotDetailClient) | PostCompletionDialog shown | Nothing — page refreshes silently | HIGH |
| 5 | Job Completed (JobWeekPanel) | PostCompletionDialog shown | DIFFERENT dialog shown (CompletionShiftDialog) | HIGH |
| 6 | Job Completed | Contractor for NEXT job notified | Only internal assignedTo user notified, not contractor | HIGH |
| 7 | Job Delayed | Contractor notified of new dates | No notification sent | HIGH |
| 8 | Job Delayed | All downstream order dates shift | Orders with null dateOfOrder silently fail | HIGH |
| 9 | Job Delayed | Cancelled orders excluded from cascade | Cancelled orders ALSO get shifted | MEDIUM |
| 10 | Pull Forward | Original dates preserved for overlay | restart-decision doesn't save originals | HIGH |
| 11 | Order Sent | Confirmation that email was delivered | mailto opens but no confirmation — status changes regardless | MEDIUM |
| 12 | Order Auto-Progressed on Job Start | User notified orders moved to ORDERED | No notification | LOW |
| 13 | Event Log | JOB_COMPLETED event type used | Maps to JOB_SIGNED_OFF instead | MEDIUM |

---

### What Updates vs What Doesn't (Matrix)

| Data Point | Job Start | Job Complete | Job Delay | Sign Off | Pull Forward |
|---|---|---|---|---|---|
| Job.status | YES | YES | no | no | no |
| Job.actualStartDate | YES | no | no | no | no |
| Job.actualEndDate | no | YES | no | no | no |
| Job.signedOffBy/At | no | no | no | YES | no |
| Job.originalStart/End | no | no | YES | no | **NO (BUG)** |
| Plot.buildCompletePercent | **NO** | **NO** | no | no | no |
| Orders auto-progress | YES | YES | partial | no | partial |
| Contractor notified | **NO** | partial | **NO** | no | no |
| PostCompletionDialog | n/a | 2 of 5 views | n/a | n/a | n/a |
| EventLog created | YES | YES (wrong type) | YES | YES | YES |

---

### Flow-by-Flow Detail

#### Starting a Job
- API correctly sets IN_PROGRESS, actualStartDate, auto-orders PENDING materials
- **Missing:** No push notification to the assigned contractor
- **Missing:** No programme auto-scroll to the started job
- **Missing:** buildCompletePercent not recalculated

#### Completing a Job
- API correctly sets COMPLETED, actualEndDate, delivers orders
- Sends NEXT_STAGE_READY to assignedTo (internal user) but NOT to the contractor
- PostCompletionDialog only shown from Walkthrough and Daily Brief — **missing from Job Detail, Plot Detail, and Programme**
- JobWeekPanel shows a completely different dialog (CompletionShiftDialog)

#### Delaying a Job
- Cascade shifts downstream jobs correctly
- originalStart/End preserved on first delay (good)
- **BUT:** cancelled orders still get shifted, null order dates silently fail
- **No notification** to any contractor about the delay

#### Pulling Forward
- restart-decision API shifts dates and cascades
- **Does NOT preserve originalStart/End before shifting** — overlay view breaks
- New orders created after restart don't get included in the cascade

---

# REPORT 2: DATA & OPTIONS GAP ANALYSIS
*"Where the data model is incomplete, unused, or inconsistent"*

---

### Weeks vs Days Disconnect

| Concept | Template Model | Runtime Model | Gap |
|---|---|---|---|
| Job duration | `startWeek`, `endWeek`, `durationWeeks` | `startDate`, `endDate` (dates only) | **durationWeeks is NEVER stored at runtime** — no way to know planned weeks |
| Order timing | `orderWeekOffset`, `deliveryWeekOffset` | `dateOfOrder`, `expectedDeliveryDate` | Offsets lost — only absolute dates remain |
| Lead time | `leadTimeAmount` + `leadTimeUnit` | `leadTimeDays` (integer) | Unit converted but original unit lost |
| Order anchoring | `anchorType`, `anchorAmount`, `anchorUnit`, `anchorDirection`, `anchorJobId` | Nothing | **5 fields completely unused — dead code** |

---

### Unused Database Fields

| Table | Field(s) | Status | Recommendation |
|---|---|---|---|
| Plot | `buildCompletePercent` | Never written to | Remove or auto-calculate |
| Plot | `reservationType`, `reservationDate`, `exchangeDate`, `legalDate` | Populated but never displayed | Implement in UI or remove |
| Plot | `approvalG`, `approvalE`, `approvalW`, `approvalKCO` | Never set, read, or displayed | Remove entirely |
| Job | `location`, `address` | Still in schema, removed from UI | Remove from schema |
| TemplateJob | `durationWeeks` | Defined but never referenced | Remove or populate at runtime |
| TemplateOrder | `anchorType`, `anchorAmount`, `anchorUnit`, `anchorDirection`, `anchorJobId` | Never used anywhere | Remove or implement anchored ordering |

---

### Event Log Gaps

| Event Type | Defined in Schema | Actually Created | Notes |
|---|---|---|---|
| JOB_STARTED | YES | YES | Working |
| JOB_COMPLETED | YES | **NO** | Job completion logs as JOB_SIGNED_OFF instead |
| JOB_STOPPED | YES | **NO** | Never logged |
| JOB_SIGNED_OFF | YES | YES (but misused) | Used for both completion and sign-off |
| ORDER_DELIVERED | YES | **NO** | Uses DELIVERY_CONFIRMED instead |
| All others | YES | YES | Working correctly |

---

### Permission & Access Gaps

| Check | Status | Detail |
|---|---|---|
| Role-based navigation | Partial | Backend has role defaults but frontend shows all pages to everyone |
| Permission enforcement on APIs | Partial | Only SIGN_OFF_JOBS and DELETE_ITEMS consistently checked |
| Multi-site access isolation | **None** | Any user can query any site — no filtering by assignedToId |
| Contractor role restrictions | Partial | CONTRACTOR role defined with limited permissions but not enforced in queries |

---

### Notification Gaps

| Type | Sent From | Missing From |
|---|---|---|
| Job ready (next stage) | Job completion API | Job start (contractor should know), job delay |
| Weather alert | Cron at 5am UTC | Only if bad weather + affected jobs. No daily summary of good weather. Oh wait — we added daily summary. |
| Sign-off requested | request-signoff API | No in-app notification bell — only push |
| Order placed | Never | No notification when orders auto-progress on job start |

---

### System Architecture Gaps

| Area | Issue | Risk |
|---|---|---|
| **No in-app notifications** | Only web push + email | Users without push enabled miss everything |
| **No real-time sync** | All data fetched on page load | Stale data if two managers work simultaneously |
| **No audit trail unification** | EventLog + JobAction are separate streams | Hard to build complete history of what happened |
| **No snag re-inspection tracking** | Text note only, no scheduled follow-up | Re-inspections get forgotten |
| **Budget terminology** | "Committed" vs "Delivered" vs "Actual" used inconsistently | Confusing financial reporting |
| **Cash flow accuracy** | Uses expectedDeliveryDate as fallback for delivered spend | Inaccurate if users don't mark deliveries |

---

## PRIORITY FIX LIST

### Must Fix (System Would Fall Down)
1. **PostCompletionDialog from all completion points** (JobDetail, PlotDetail, JobWeekPanel)
2. **Contractor notifications** on job start, complete, delay
3. **Preserve original dates** in restart-decision before pull-forward
4. **Multi-site access control** — filter queries by user's assigned sites

### Should Fix (Data Integrity)
5. Remove or auto-calculate `buildCompletePercent`
6. Fix event type mapping (JOB_COMPLETED vs JOB_SIGNED_OFF)
7. Exclude cancelled orders from cascade
8. Null-check order dates before shifting

### Nice to Have (Completeness)
9. Remove 10+ unused database fields
10. Add in-app notification centre
11. Unify EventLog + JobAction into single audit stream
12. Add snag re-inspection scheduled tasks
13. Implement permission enforcement on all API routes
