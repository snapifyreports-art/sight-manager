# Sight Manager — day-to-day audit

_May 2026. Written after batches 90-96._

This audit isn't a comprehensive walk through every file — it's a focused
look at the manager's daily workflow, the data we collect, and where we
can do better. Organised around what to **fix**, **collect**, and
**ship**.

---

## 1. A day in the manager's life

I traced the natural Keith-flow through the app:

**07:00 — Morning brief.** Opens Daily Brief on phone. Sees what's
starting today, what's overdue, deliveries due. → Mostly good. Friction
on switching between sites (sidebar dropdown vs in-page picker is
duplicated and confuses the muscle memory).

**07:30 — Site arrival.** Opens Programme tab for the site. Pulls
forward a job that needs to start today. Override dialog now offers
"send orders now URGENT" (batch 94) — good. → Friction: still requires
desktop or wide-screen. The mobile programme is a card list, not a
true Gantt, so the manager can't see _when_ in the week things slot.

**08:00 — Walking the plots.** Spots a defect. Today's flow: tap Raise
Snag (only on operational tabs now — batch 96a) → SnagDialog → fills
description / priority / location / contractor / job / photos. → Works,
but heavy for a quick "this is broken" note. Photo-first capture would
beat form-first capture.

**10:00 — Material delivery arrives.** Goes to Orders tab on phone →
finds the order → Mark Delivered. → Currently this is buried in a card
list. The "deliveries due today" panel on Daily Brief has the right
context but doesn't have a swipe-to-confirm action.

**12:00 — Lunch admin.** Logs a toolbox talk. Now supports an attached
doc (batch 96c). Reviews snag list, signs off completed jobs.

**14:00 — Email batch.** Goes to Orders tab → uses the "Send Order"
button to fire supplier emails for tomorrow's needs. → Most reliable
workflow in the app. Email batching by supplier is great.

**16:00 — Subcontractor calls.** Pulls Contractor Comms tab to see
who's working what. Calls Travis Perkins about a late delivery. There's
no place to log _what was said_ — only the resulting status flip.

**17:00 — Evening review.** Opens Story tab for retrospective view of
the day. Now shows snag summary (batch 96b). → Useful but
read-only — no way to add a "what happened today" note that doesn't
require attaching to a specific job/plot.

**18:00 — Customer chat.** Buyer for Plot 4 asks "what's happening?".
Manager opens the customer page link (auto-generated now — batch 95).
Customer sees their progress. → Works. Could be better: customer page
has no way to message the manager back.

**End of day — handover.** Site Closure → Generate Handover ZIP at
project end. Untested in production but architecturally complete.

---

## 2. What works well (don't fix)

Recognise before criticising:

- **Cascade engine** — the cascade-spec invariants (I1-I7) are tight.
  Working-day math is correct, parent rollups don't independently
  shift, conflicts are surfaced not silently clamped. This is the heart
  of the app and it's solid.
- **Daily Brief** — the cross-section of "starting today / due today /
  late starts / blocked" is genuinely the right slice for a morning
  scan. The brief is the single best entry point in the app.
- **Programme + auto-pull-forward dialog** — the three-option early
  start flow (Pull / Expand / Pull to Event) is a great UX, and the
  override + urgent-email branch shipped this session closes the last
  obvious gap.
- **Push fan-out architecture** — `sendPushToUser` / `sendPushToSiteAudience`
  / `sendPushToPlotCustomers` / `sendPushToAll` cleanly separate
  audiences. Notification preferences UI lets users dial in what they
  want.
- **Order grouping + bulk send** — one supplier email covers N plots'
  orders. This is a real productivity win over "one order at a time".
- **iCalendar feed** — every site's programme as a subscribable
  calendar feed. Underadvertised feature; should be on a "share with
  subcontractor" call-to-action.
- **Pull-forward override + delivery follow-up** (batch 90/94) —
  finally bridges the "I need to start anyway" case without the manager
  having to clean up half-flipped orders manually.

---

## 3. Concrete friction points

Things that hurt every day, in order of severity:

### High

**3.1. Snag raising is form-first, not photo-first.**
SnagDialog has 8+ fields when usually the manager just wants "here's
what's broken, here's a photo". Recommend: rapid-capture mode — tap
button, opens camera immediately, snap, optional 5-word caption,
priority defaults to MEDIUM, location defaults to "Plot N", everything
else inferred from context. The full form stays available as "More
detail" expansion.

**3.2. No "decision log" outside jobs.**
A site manager makes 20-50 micro-decisions a day: "we're going to use
brick X instead", "verbal agreement with sparky on the price", "told
plumber to skip the second-fix today". Currently these live in heads
or texts. The PlotJournalEntry model exists per-plot but the UX surface
is thin — buried inside Plot Detail. Recommend: a site-level
"Decisions / Notes" tab that's frictionless to add to ("just say what
happened"), optionally tag a plot / job / contact, becomes
ContractorComms history automatically.

**3.3. Phone vs desktop divergence.**
Programme on phone is a card list (good for status), but managers also
want to see "what's happening this week" on phone. The desktop Gantt is
unusable on mobile. Recommend: a "this week strip" view on mobile —
horizontal scroll showing day columns with job pills, more compact than
the full Gantt but more informative than the plot card list.

**3.4. Switching sites is two pickers.**
Sidebar dropdown + per-page picker (Daily Brief has its own). Picking
in one doesn't always update the other. Mental model leakage. Already
partially fixed (batch 93) — the sidebar now preserves tab context.
Next step: collapse to ONE site picker visible everywhere — the
sidebar one — and remove the per-page pickers.

### Medium

**3.5. Snag photo capture quality is inconsistent.**
Photos compress correctly but the upload flow doesn't tag the photo
with the snag's location or auto-prefix the filename. Result: looking
at snag photos in the Photos tab they look like random images.

**3.6. "Late" definitions are inconsistent.**
- Daily Brief uses `endDate < today AND status != COMPLETED`.
- Tasks uses `status == "IN_PROGRESS" AND endDate < today`.
- Dashboard uses similar but with a take-12 limit.
Net result: a job that's been NOT_STARTED for 5 days past its planned
start shows differently across views. Recommend: a `lateness.ts`
helper with a single definition (`late = computed status`, and `late
type = "start" | "end" | "both"`), used everywhere.

**3.7. Customer communication is one-way.**
The customer page shows them progress. They can't message back. This
is fine until a buyer wants to ask "is the kitchen finalised yet?" and
has no obvious channel — they end up calling the office. Recommend:
add a tiny "Send a question" form on /progress/[token] that creates a
PlotJournalEntry tagged `source=CUSTOMER` and pushes the manager a
notification. No PII risk because the token is plot-scoped.

**3.8. Toolbox Talks doesn't capture attendance signatures.**
Now supports a doc attachment (batch 96c) which can be the signed
register — but if there's no doc, attendance is just a freeform string.
For audit-trail purposes recommend an optional "sign-in" mode where
attendees sign on the phone (canvas) and we save the signature image
per attendee.

**3.9. No "snag-to-photo" cross-link.**
You can attach photos to snags. You can't easily go from a job photo
to "raise a snag from this photo" — the JobPhotoLightbox has the
button but it's not discoverable.

### Low

**3.10. ContractorComms shows assigned contacts but not what they said.**
Currently a list of jobs/snags assigned. Doesn't show: phone log,
email thread, message history. Tied to 3.2 (decision log).

**3.11. The dashboard mixes too many widgets.**
Stats + Job Health + Recent Events + At-Risk + Watched Sites + Plots
Over Budget. Each useful, together overwhelming on mobile. Recommend:
collapsible sections OR a "what needs my attention today" computed
priority list above everything else.

**3.12. No undo on cascade.**
Pull-forward writes 30+ records. If you misclick, no rollback button.
The Site Log has the EventLog row, but reverting is manual.
Recommend: a "Revert last cascade" button on the Site Log entry for 60
minutes after it fires.

---

## 4. Data we collect but underuse

Things the schema captures that the UI doesn't surface:

**4.1. `Job.originalStartDate / originalEndDate`** — set on first
cascade. Used for delay reporting but not surfaced as "this job has
drifted X days from its original plan" on the job card. Easy win.

**4.2. `Job.actualStartDate / actualEndDate`** — captured on start/
complete actions. Compared to plan in DelayReport but not on the
JobDetailClient page itself. A simple "plan: Mon 5 May • actual: Tue 6
May (+1 WD)" strip would make variance visible without the report.

**4.3. EventLog as a per-plot timeline.** EventLog stores everything
(JOB_STARTED, ORDER_DELIVERED, SCHEDULE_CASCADED, SNAG_CREATED, etc.)
but there's no UI that just shows "everything that ever happened on
this plot, newest first" as a single feed. The Story tab approximates
this for the site level but plot-level zoomed-in is missing.

**4.4. `MaterialOrder.leadTimeDays`** — recorded but only used by the
cascade engine's pull-forward earliest-start calculation. Could power
a Supplier Performance leaderboard: "Supplier X's actual lead time is
2 days worse than quoted on average."

**4.5. `JobContractor` (the join row)** — records contact→job
assignments. We have a `contractorPerformance` aggregation in the
Story panel. We don't have a contact-detail-page leaderboard ("Bob's
on-time rate is 73%; he's late by 1.5 WD on average; his snags-per-job
is 0.8").

**4.6. RainedOffDay** — captured for weather impact. Surfaced in
DelayReport. Not surfaced on the day's Daily Brief ("Yesterday was
rained off — Plot 4's first fix moved to Wednesday").

**4.7. `Site.completedAt`** — set when site flips to COMPLETED. Used
as the Story end date. Could be the trigger for an automatic "Ready
to generate Handover ZIP?" prompt + "Send buyer their completion
bundle" flow.

**4.8. `Snag.resolvedAt`** — captured. Used for the new Median resolve
time (batch 96b). Could also drive an SLA chart per priority ("HIGH
snags resolved in 1.2d avg, MEDIUM in 4.5d, LOW in 12d").

---

## 5. Data we should be collecting

Things that, if captured, unlock useful views:

**5.1. Structured delay reasons.**
Currently `EventLog.delayReasonType` is a freeform string accepting
`WEATHER_RAIN | WEATHER_TEMPERATURE | OTHER`. That last bucket eats
the most interesting reasons. Recommend an enum:

```
WEATHER_RAIN | WEATHER_TEMPERATURE | WEATHER_WIND
MATERIAL_LATE | MATERIAL_WRONG | MATERIAL_SHORT
LABOUR_NO_SHOW | LABOUR_SHORT
DESIGN_CHANGE | SPEC_CLARIFICATION
PREDECESSOR_LATE
ACCESS_BLOCKED
INSPECTION_FAILED
OTHER
```

Surfaces immediately on DelayReport ("36% of delays this quarter were
MATERIAL_LATE — top supplier is Travis Perkins") and gives Keith real
ammunition in contract negotiations.

**5.2. Time-of-day on actions.**
JobAction has `createdAt` (timestamp), but reports treat them as date
not datetime. A "what time did the brick gang actually arrive on
site?" trend chart would matter for productivity discussions.

**5.3. Cost-vs-quote per OrderItem.**
`OrderItem.unitCost` is stored. We never compare to a supplier
pricelist (`Supplier.pricelist` exists) to flag "you got charged more
than your quoted price". Easy win when materials margins get tight.

**5.4. Site visitor sign-in / out.**
Construction sites require visitor logging for insurance. Currently a
paper sign-in book. A tap-in / tap-out flow tied to a Visitor model
(`name, company, in, out, plotsVisited[]`) gives Keith an audit trail
and a who-was-on-site-when when something goes wrong.

**5.5. Subcontractor invoices.**
Currently we know orders + draw schedule (revenue). We don't track
subcontractor invoices (cost paid out). Without that, true plot
profitability is invisible. A `SubcontractorInvoice` model (job-linked,
status: pending/paid, amount, dueDate) would close the loop.

**5.6. Weather forecast → programme integration.**
We pull current weather (cron). We could fetch a 7-day forecast and
auto-flag externally-exposed jobs (`category in (groundworks,
brickwork, roofing)`) with high-rain probability. "Heads up — Tuesday
looks bad for brickwork."

**5.7. Photo OCR + auto-categorisation.**
JobPhotos already store URL + caption. Running them through a basic
caption-from-image model would auto-categorise: "external brickwork
progress", "snag — chipped tile", "delivery", "completed first
fix". Helps the Story tab tell richer narratives.

---

## 6. Quick wins (under 2 hours each)

Cheap, high-leverage:

- **6.1** Job card variance strip (4.1/4.2) — show "Plan: dd MMM →
  Actual: dd MMM (+N WD)" on JobDetailClient header.
- **6.2** Plot-level EventLog feed (4.3) — new "History" tab on Plot
  Detail showing all EventLog rows for the plot.
- **6.3** Single `lateness.ts` helper (3.6) — unify the three
  different "late" computations.
- **6.4** Revert-last-cascade button (3.12) — 60-min window on the
  Site Log entry.
- **6.5** Customer "Send a question" form (3.7) — small textarea on
  `/progress/[token]` → PlotJournalEntry + push.
- **6.6** Snag fast-capture (3.1) — minimal-fields modal: photo,
  caption, priority, defaults for everything else.
- **6.7** Discoverable "snag-from-photo" (3.9) — promote the existing
  JobPhotoLightbox button into a labelled action.
- **6.8** Weekly digest email enhancement — already exists; just add a
  "snags raised this week" section using the Story-tab snag data.
- **6.9** ContractorContact scorecard tile on Contact Detail — already
  have the data, just need the render.

---

## 7. Bigger ideas (worth designing)

Need product thinking, not just code:

**7.1. Decision Log (3.2).** Frictionless add: voice memo → transcribe →
attach a tag. Site-level feed. Becomes the source of truth for "what
did the site manager decide about X". Would replace 80% of WhatsApp
threads. The VoiceNote model already exists schema-wise; just needs
the recording + transcription + thread UI.

**7.2. Predictive completion banner v2.**
The current banner is velocity-based. Next step: surface "if you keep
the current weekly burn rate, the site finishes on _date_, which is
+N days vs plan and the customer's expected handover is _date_."
Real-time projection on the dashboard would make slippage visible
before it's a problem.

**7.3. Subcontractor performance feedback loop.**
We track jobs assigned + on-time + delays attributed. After site
completion, prompt the manager to rate each contractor on 3-5 axes
(quality, attendance, communication, on-time). Aggregate into a public
(within the company) scorecard. Cross-site, cross-time.

**7.4. The "Site Owner's portal".**
For the buyer/owner (not the manager). One page per site (collection
of plots they own — most own ONE plot but speculators own many).
Combines progress, decisions awaiting input, payments due, completion
forecast. The CustomerPushSubscription model already supports per-plot
push; this would aggregate.

**7.5. Programme template versioning + diff.**
Templates evolve. When you apply Template v2 to a new plot, you can't
see "what changed since Template v1 that Plot 4 was built from". A
template version + diff view would help. (The `TemplateVariantJob`
schema scaffolding suggests this was considered and parked.)

**7.6. Bulk-edit jobs across plots.**
"Move the brickwork start date on Plots 1-8 forward by 3 days" right
now requires 8 individual pull-forwards. A multi-select on
SiteProgramme + a single shift-all action would save hours.

---

## 8. Tech debt (housekeeping)

Things worth a periodic cleanup:

**8.1. Orphan schema models.** Some are in the schema with thin or no
UI exposure:
- `TemplateVariantJobOverride` / `TemplateVariantMaterialOverride` —
  appear to be a deprecated override mechanism. Confirm and delete.
- `VoiceNote` / `PhotoAnnotation` — schema-ready for features
  explicitly dropped per Keith's directive. Leave for now (cost is
  zero), but document as "schema parked".
- `PlotDrawSchedule` — schema there, minimal UI. The Profitability
  widget reads it. Could be fleshed out into a real "stage-payment
  tracker" tab.

**8.2. SiteDetailClient is 2400 LOC.** Same problem JobWeekPanel had
before we split it. Some tabs (`SiteSnags`, `SiteDocuments`) are
defined inline as sub-components rather than imported. Lifting these
into separate files would mirror the JobWeekPanel cleanup.

**8.3. TemplateEditor is 3575 LOC.** The biggest single component in
the codebase. Hasn't been touched in a while. Worth a structural
review before adding more template features.

**8.4. Two date utilities.** `src/lib/dates.ts` (`toDateKey`,
`parseServerDateToLocal`) and `src/lib/working-days.ts`
(`addWorkingDays`, etc.) — both exist, both used. Boundaries are
clear but worth a brief readme.

**8.5. EventLog discriminator strings.** `delayReasonType` is a string
(see 5.1). Several other `description` patterns are
"`"${verb} ${quoted}"`" — searching them is fragile. Adding a
structured `meta JSON?` column on EventLog for the things downstream
queries actually need would be cleaner than parsing descriptions.

---

## 9. Recommended priorities (next 4 weeks)

If I were Keith and had to pick:

**Week 1 — Quick wins.** All of section 6. They're each small but the
cumulative effect on day-to-day feel is meaningful. Especially 6.6
(snag fast-capture) and 6.3 (unified lateness).

**Week 2 — Decision log foundation (7.1).** Site-level "what
happened" tab with voice-memo capture + transcription. Frictionless
add, threaded view. Even without rich features, becomes the most-used
tab within a fortnight.

**Week 3 — Structured delay reasons + supplier performance (5.1 + 4.4).**
Migrate the enum. Backfill what we can. Add the Supplier Performance
leaderboard. Real numbers to put in front of suppliers when
negotiating.

**Week 4 — Customer two-way comms (3.7) + Owner portal (7.4).**
Buyer can ask questions. Owner of multiple plots gets an aggregated
view. Sets up future buyer-experience differentiation.

---

## 10. Closing thought

The architecture is in good shape. The cascade engine, push fan-out,
helper library, schema model — all solid. The unfinished surfaces are
small, the friction is mostly in micro-flows (snag capture, site
switching, decision capture) rather than in the structural design.

The biggest opportunity isn't a feature — it's making the existing
data more visible. We capture a lot. The UI only surfaces a fraction.

— audit by Claude, May 2026
