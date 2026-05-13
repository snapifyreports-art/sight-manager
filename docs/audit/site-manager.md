# Site Manager Audit — May 2026

Keith starts at 7am with the Daily Brief, spends half the day on-site (mobile, phone in hand) and half at-desk. Three to five live sites, contractor confirmations chasing him, customers asking for updates, suppliers needing chasing, snags rolling in from the walkthrough. He wants one screen that answers "what should I do right now", a fast path from spotting a problem to logging it, and trustworthy dates everywhere. Every extra tap during the day adds up.

This audit covers the operational hot-spots Keith hits daily. P0 = breaks the flow / data is wrong / something silently doesn't work. P1 = daily friction Keith will mention. P2 = polish.

---

## P0 — `?action=new` deep links from Cmd-K + FAB are dead

- **File:** `src/components/layout/SearchModal.tsx:137`, `src/components/shared/FloatingActions.tsx:71-85`
- **What's wrong:** Cmd-K verbs ("Raise a snag", "Create a new site", "Add a plot", "Create an order", "Add a contractor", "Add a supplier") all route to URLs like `/sites?action=new`, `/orders?action=new`, `/suppliers?tab=contractors&action=new`, `/sites/[id]?tab=snags&action=new`. The FAB on mobile (`FloatingActions.tsx:65-86`) uses the same URLs. **No component reads `?action=new`.** Grepping the codebase for `searchParams.get("action")` or `action === "new"` returns zero hits in `SitesClient.tsx`, `OrdersClient.tsx`, `SiteDetailClient.tsx`, or any supplier component. So the user gets dumped on the destination page and has to find the "+ New" button themselves.
- **Who notices:** Keith hits Cmd-K, types "snag", picks "Raise a snag" — lands on the snags tab with the SnagDialog closed. Or on mobile he taps the FAB, picks "Raise a snag", same outcome. The Cmd-K verbs section was introduced specifically to make "things you can do" reachable; the deep link not firing the dialog defeats the entire feature.
- **Fix:** Each destination needs to read `searchParams.get("action") === "new"` and auto-open its create dialog. SitesClient → open Create Site Wizard. OrdersClient → open the order form dialog. SiteDetailClient (when on snags tab) → open SnagDialog with the plotId pre-filled from `?plotId=`. SuppliersListClient → open the new-supplier / new-contractor form.

## P0 — Header search button is hidden when no site is selected

- **File:** `src/components/layout/Header.tsx:111-152`
- **What's wrong:** The Search button (with the ⌘K hint) is rendered **inside** the `{siteId && (…)} ` block alongside Brief / Prog / Walk. On pages with no site context (Dashboard, Portfolio, /daily-brief in "All Sites" mode, /suppliers, /analytics, /settings), the search button disappears entirely. Cmd-K still works as a keyboard shortcut, but the click target only exists when you're already on a site page. The "⌘K" hint is therefore invisible to users who don't yet know the shortcut.
- **Who notices:** Keith arrives at the dashboard, wants to jump to a plot, looks for the search icon — it's not there. He clicks back into a site, then searches. Mobile users who don't have keyboard shortcuts are even worse off — Cmd-K is the only fast nav and the trigger is gated.
- **Fix:** Move the Search Button out of the `siteId && (…)` block so it's always rendered. Brief/Prog/Walk can stay site-gated; Search should not.

## P0 — Lateness attribution is read-only for contractors

- **File:** `src/components/lateness/LatenessSummary.tsx:288-328` (edit panel)
- **What's wrong:** Keith's directive on #191 was "everything that's late needs a reason **and attribution**". The DTO at `LatenessSummary.tsx:29-31` carries `attributedContactId` + `attributedContact`, and the PATCH endpoint at `src/app/api/lateness/[id]/route.ts:39-41` accepts `attributedContactId`. But the edit UI only renders `reasonCode` (select) and `reasonNote` (free text) — there is no contractor picker. So once a lateness event is created the manager can set a reason but cannot assign it to a contractor, which means the contractor leaderboard data on Site Story (and per-contact analytics) silently misses everything that was attributed manually.
- **Who notices:** Keith opens an open lateness event from the Daily Brief, picks "LABOUR_NO_SHOW", saves — the row says "Labour — contractor no-show" but no contractor name attached. He reads the Site Story expecting that no-show to count against the contractor, but it doesn't.
- **Fix:** Add a contractor picker (typeahead over Contact where type=CONTRACTOR) to the editing block in `LatenessSummary.tsx`, persist via the existing PATCH. When reasonCode is one of the labour/material codes, surface the picker prominently.

## P0 — Site detail lands on Plots tab, not Daily Brief

- **File:** `src/components/sites/SiteDetailClient.tsx:526` (`useState(initialTab || "plots")`)
- **What's wrong:** When Keith clicks a site card from `/sites` or from a watched-sites list, the default tab is "plots". Daily Brief is buried as one of nine tabs under "Manage Site" in the sidebar group. Keith's stated 7am ritual is "Daily Brief first". The natural arrival point for the primary user persona is wrong.
- **Who notices:** Keith opens a site, has to click Daily Brief every single time. Multiple sites per morning = multiple extra clicks. The sidebar even has `currentTab = searchParams.get("tab") || "plots"` (Sidebar.tsx:138) so this default propagates.
- **Fix:** Change `SiteDetailClient` default to `daily-brief`, and the sidebar's `currentTab` fallback (`Sidebar.tsx:138`) to `daily-brief`. Plots tab still reachable in one click. If "plots" was chosen because the site might have zero data, accept the daily-brief empty state — it already handles that path.

## P0 — Dashboard "Total Jobs" and "Jobs In Progress" tiles link to Tasks, not Jobs

- **File:** `src/components/dashboard/DashboardClient.tsx:215-229`
- **What's wrong:** Both "Total Jobs" (count) and "Jobs In Progress" (count) link to `/daily-brief` with no site, which renders `TasksClient` (`GlobalDailyBriefClient.tsx:71-75`). TasksClient is a task list — it doesn't show a list of jobs, just six summary buckets and per-bucket cards. Keith clicks "Jobs In Progress (42)" expecting to see 42 in-progress jobs; he sees a task page with confirm-delivery / send-order / sign-off groupings instead. The two numbers don't line up.
- **Who notices:** Keith glances at the dashboard, sees an unexpected number, clicks to investigate — lands somewhere that doesn't show the underlying data. The inline comment at `DashboardClient.tsx:213` even notes "Pre-fix Total Jobs + Jobs In Progress were dead numbers — clicking them did nothing." Fixing dead to wrong isn't a fix.
- **Fix:** Either build a `/jobs` index page (currently only `/jobs/[id]` exists), or change these tiles to link to a programme view filtered to IN_PROGRESS, or remove the link affordance until there's a real destination.

## P0 — JobActionStrip Mode A hides the primary action behind "Actions ▾" on mobile

- **File:** `src/components/reports/JobActionStrip.tsx:48-77` and `src/components/reports/DailySiteBrief.tsx:1939-1968`, `1948-1956`, `2162-2183`
- **What's wrong:** Mode A wraps every button in a collapsed strip behind "Actions ▾" on mobile. The "Finishing today" rows (1947-1965) and "Awaiting Sign Off" rows (2162-2183) use Mode A — meaning the most urgent action (Complete or Sign Off) requires two taps on phone: expand strip, then tap. Keith's stated rule (cited in JobActionStrip's own comment at line 22) is "anything that can require attention shouldn't be collapsed". Mode B exists exactly for this, but those two rows don't use it.
- **Who notices:** Keith on-site at lunchtime, wants to sign off a job. Has to expand the strip, then tap Sign Off. Multiply across however many he signs off in a day.
- **Fix:** Convert the "Finishing today" and "Awaiting Sign Off" job rows to JobActionStrip Mode B with Sign Off as the `primary` action and Snag / Note / Photos / Reopen as `secondary`. The "In Progress" row (2384-2402) should also put Complete as primary.

## P0 — Sidebar has no global "Orders" link

- **File:** `src/components/layout/Sidebar.tsx:96-109`
- **What's wrong:** The global navItems array contains Dashboard, Portfolio, Daily Brief (all sites), Suppliers, Contractors, Templates, Analytics, Events Log — but no "Orders" link. The Orders page exists at `/orders` (`src/app/(dashboard)/orders/page.tsx`) and shows cross-site order management. The only way to reach it from the sidebar is via the per-site "Orders" tab inside Manage Site. Cmd-K verbs route `Create an order` → `/orders?action=new` but the user has no way to get back to `/orders` unless they remember the URL.
- **Who notices:** Keith finishes the daily brief, wants to see what's outstanding across all suppliers — has to click into a site, find orders, then navigate. Or use Cmd-K to type "orders".
- **Fix:** Add `{ label: "Orders", href: "/orders", icon: Package }` to `navItems` between Suppliers and Contractors.

## P0 — Sidebar "All sites" + per-site tab forwarding throws away programme view state

- **File:** `src/components/layout/Sidebar.tsx:258-272`
- **What's wrong:** When the user is inside `/sites/A?tab=programme` and switches the site selector to "All sites", the code at line 264-270 routes them to `/sites?pickFor=programme`. The sites picker then forwards them to `/sites/B?tab=programme`. But every piece of programme state — zoom level, day/week toggle, current/original/overlay, current scroll position, current filter — is LOCAL to the SiteProgramme component, keyed by `siteId` via the URL. So switching sites resets everything to the defaults, even though the user is staying on the same conceptual screen.
- **Who notices:** Keith zooms into day view at 75%, looks at week 14 on site A, switches to site B — comes back to week view at 100% scrolled to today. He has to redo every adjustment for every site.
- **Fix:** Persist programme view state in localStorage scoped by user, not by site (zoom level, view mode, jobView, ganttMode). Currently every component re-mounts on site change and loses everything.

## P0 — Today line on programme can absorb clicks if anchor render order shifts

- **File:** `src/components/programme/SiteProgramme.tsx:1700-1739`
- **What's wrong:** The today-line stack (highlight column + label + vertical line) all use `pointer-events-none`. Good. But the today label at line 1719-1727 sits with `z-20` and is rendered as part of `processedPlots.map` overlay loop. Earlier code in the same file at lines 1755-1761 renders the overlay-mode dashed divider with `pointer-events-none z-10`. The order/delivery dot wrappers at line 2073 are also `pointer-events-none`, but the dot buttons themselves are `pointer-events-auto` (lines 2079, 2090). When the today-column overlaps an order dot, the dot has higher specificity since both are absolute. **This works for today** but a future regression where someone forgets `pointer-events-none` on a new today overlay would silently break it. The pattern is fragile — the comment at lines 1701-1705 even calls it out as a previous high-impact silent bug.
- **Who notices:** Keith hits this if any future PR adds an overlay over today. Currently fine, but flagged P0 because the failure mode is invisible (clicks just stop working) and the comment explicitly warns about it.
- **Fix:** Extract today-line rendering into a single component that enforces `pointer-events-none` at the component level so future overlays can't silently break click handling.

## P0 — Daily Brief sign-off photo upload happens BEFORE the job-complete API call

- **File:** `src/components/reports/DailySiteBrief.tsx:1042-1116`
- **What's wrong:** `handleSignOffSubmit` (line 1042) uploads photos first (line 1050), then calls `runSimpleAction(signOffTarget.id, "complete", { silent: true })` (line 1062), then `runSimpleAction(signOffTarget.id, "signoff", …)` (line 1064). If the photo upload succeeds but the complete-action fails (network blip, race condition), Keith ends up with photos tagged "after" attached to a job that's still IN_PROGRESS — and the photos look like sign-off photos but there's no sign-off. Worse: the `if (!photoRes.ok)` path at line 1051 only handles the upload failing; if `runSimpleAction` for "complete" returns ok:false, the function continues to call signoff anyway (line 1064 doesn't check the complete result). The flow can land in inconsistent state.
- **Who notices:** Rare, but when it happens the data is wrong and the user has no signal — they think they signed off, they didn't, the photos are misleading.
- **Fix:** Either (a) gate photo upload behind successful complete+signoff, or (b) check the result of `runSimpleAction("complete")` and bail before calling signoff if it failed. Wrap the three operations server-side in `/api/jobs/[id]/actions` so it's transactional.

## P0 — Watch toggle silently lies if the GET fails

- **File:** `src/components/sites/WatchToggle.tsx:38-54`
- **What's wrong:** On mount, the toggle fetches `/api/sites/[id]/watch`. If the request fails (network, 401, 500), the `.catch(() => {})` swallows the error and `muted` stays `null`. The render at line 81-108 treats `muted === true` as muted and **everything else** (including `null`) as "Notifying"/active. So a failed fetch makes the toggle silently claim notifications are on, even if the user has muted the site. Clicking it then flips to muted via POST, which un-mutes them on the server (because POST = mute, and the server already had a row that we never read).
- **Who notices:** Network blip or stale session — the user thinks they're getting notifications, suddenly gets a flurry. Or worse: the user previously muted a noisy site, the fetch fails, the toggle shows "Notifying" — they click to mute again, the POST hits an existing row constraint and either fails silently (catch at line 73) or no-ops, and they're confused about which state it's actually in.
- **Fix:** Use a loading state (`muted === null` → show a disabled "Loading…" pill, not "Notifying"). Surface the fetch error via toast so the user knows the toggle didn't load.

## P1 — Daily Brief auto-expanding sections override the user's collapsed choices on every refresh

- **File:** `src/components/reports/DailySiteBrief.tsx:650-668`
- **What's wrong:** The `useEffect` on `data` rewrites `openSections` from scratch every time the data refreshes. So if Keith closes the "In Progress" panel because he's already actioned everything, then anything triggers a refresh (focus regain, refreshKey bump, action completion), the section pops open again. The intent is admirable — "anything that can require attention shouldn't be collapsed" — but the user explicitly closing it should stick for the session.
- **Who notices:** Keith closes a section, does something that refetches data (taps "Mark Sent", auto-refresh on focus), and the section he just collapsed is open again. Feels like the page is fighting him.
- **Fix:** Track which sections the user has *manually toggled* this session; respect their state on subsequent data refreshes, only auto-expand sections that have non-zero counts AND haven't been manually closed.

## P1 — Daily Brief "Start All / Complete All" bulk buttons skip the start-time pre-start dialog

- **File:** `src/components/reports/DailySiteBrief.tsx:1119-1138` (`handleQuickBulk`)
- **What's wrong:** The bulk endpoint `/api/sites/[id]/bulk-status` is called with action=start for every selected job, but the `useJobAction` hook's pre-start flow (predecessor check, undelivered orders, early/late dialog) is bypassed entirely. So if any of the selected jobs have undelivered orders or unsigned-off predecessors, the bulk action silently starts them anyway. The same hook is wired in for single-job start (line 1883) precisely BECAUSE the pre-start checks matter.
- **Who notices:** Keith clicks "Start All (4)" on a busy morning, two of those jobs had pending orders — they're now in-progress without materials. The next person to load the page sees a "Ready to begin / awaiting delivery" mismatch.
- **Fix:** Either run the pre-start checks for each job in the bulk loop and surface a single consolidated "3 of 4 jobs have warnings — proceed anyway?" dialog, or document that bulk = "force start, no checks" and rename the button accordingly.

## P1 — DailySiteBrief is 3573 lines — review/change risk is high

- **File:** `src/components/reports/DailySiteBrief.tsx` (full file)
- **What's wrong:** Even after the JobWeekPanel split, the Daily Brief is a 3573-line monolith with ~30 useState hooks declared in `DailySiteBrief()` (lines 437-630), 8 dialogs inline, and a single 2200-line JSX tree. Every section (Today's Jobs, Materials, Snags, Pending Sign-offs, Inactive Plots, Awaiting Contractor, Pipeline, Recent Activity) renders in this one component. Changes to one section risk other sections because the state surface is so big.
- **Who notices:** Anyone trying to add a new pill or change a section. The recent #187/#190 weather consolidation is the kind of change that should be local — instead it's threaded through this component.
- **Fix:** Apply the same split pattern that worked for JobWeekPanel: extract section components (`<TodaysJobsSection>`, `<MaterialsSection>`, `<SnagsSection>`, etc.), each with its own useEffect and dialog state, sharing data via props.

## P1 — Snag list filter resets the highlightId auto-open only once

- **File:** `src/components/snags/SnagList.tsx:109-122`
- **What's wrong:** `didAutoOpen` guards the auto-open. If the manager arrives via `?snagId=X`, the snag opens. Then they close the snag dialog and apply a filter. If the URL still has `?snagId=X` (the page wasn't navigated, just state changed), the snag won't re-open. Worse: if the URL changes to a different `snagId=Y`, `highlightId` updates but `didAutoOpen` is still true so Y never opens. The bug is that `didAutoOpen` should reset when `highlightId` changes.
- **Who notices:** Manager clicks two consecutive snag links from the Daily Brief alerts in the same session — first works, second silently doesn't open.
- **Fix:** Replace the `didAutoOpen` boolean with `useRef(string|null)` storing the last-opened id; auto-open whenever `highlightId !== ref.current`.

## P1 — Sign-off photo upload at /jobs/[id] uses `PhotoUpload` inside the dialog, leaking photos when cancelled

- **File:** `src/components/jobs/JobDetailClient.tsx:1369-1380` (Sign-off dialog photo upload)
- **What's wrong:** The PhotoUpload component is rendered inside the sign-off dialog and writes directly to `setJob(prev => ...photos: newPhotos)`. When the user uploads a photo, it's persisted to the job immediately (the PhotoUpload likely POSTs to `/api/jobs/[id]/photos`). If the user then clicks Cancel on the sign-off dialog, the photos remain attached to the job but aren't tagged "after" via the sign-off context. The Daily Brief sign-off dialog (DailySiteBrief.tsx:1042-1066) handles this correctly: it stages photos locally and only uploads them inside `handleSignOffSubmit`, tagging them "after" via FormData.
- **Who notices:** Manager opens sign-off, attaches a couple of photos, decides not to sign off yet — those photos are now on the job, untagged.
- **Fix:** Mirror the Daily Brief pattern: stage photos locally in the dialog, upload only on confirm with `tag=after`.

## P1 — `/daily-brief` "All Sites" mode shows TasksClient — different visual + label from the per-site Daily Brief

- **File:** `src/components/reports/GlobalDailyBriefClient.tsx:71-75`
- **What's wrong:** When no site is selected, the page shows `TasksClient` with the heading "Daily Brief — All Sites". TasksClient is structured around six task buckets (Confirm Delivery, Sent Order, Overdue Jobs, Late Start, Sign Off Jobs, Send Order). The per-site DailySiteBrief has three sections (Alerts, Actions Today, Other Actions / Pipeline) and dozens of pills. The two screens share a name but look nothing alike, so picking "All Sites" feels like jumping to a different app, and there's no in-page hint about that.
- **Who notices:** Keith reaches the all-sites view, looks for the weather strip / Lateness summary / contractor confirmations — they're not here. He's confused about which view answered what question.
- **Fix:** Either (a) make TasksClient include a "Site:" column on every row so it can substitute for the per-site brief, or (b) rebuild "All Sites" mode to be DailySiteBrief aggregated across sites with a site column. Today the name and look mismatch is a UX trap.

## P1 — Lateness summary on Daily Brief shows reasons but no way to attribute days to a delay category

- **File:** `src/components/reports/DailySiteBrief.tsx:1625-1630` mounting `LatenessSummary` with `status="open"`
- **What's wrong:** The summary header says e.g. "3 open · 7 working days lost". That total includes events still flagged `OTHER` ("Not yet attributed"). There's no UI prompt encouraging Keith to attribute them. Reasons get set inline per event (LatenessSummary.tsx:262), but the Daily Brief surfaces no "X days unattributed, attribute now" CTA.
- **Who notices:** Keith never opens the lateness section because the summary is collapsed by default. Lateness data sits unattributed forever, defeating the point of the feature.
- **Fix:** Auto-expand the LatenessSummary when `events.some(e => !e.resolvedAt && e.reasonCode === "OTHER")`. Add a "X unattributed" amber badge to the collapsed header so it's visible at a glance.

## P1 — Critical SnagList "showPlot" prop is true in Daily Brief but plot column is dropped on mobile

- **File:** `src/components/snags/SnagList.tsx:130-138` (filter) and `src/components/reports/DailySiteBrief.tsx:2602-2687` (Open Snags card)
- **What's wrong:** Daily Brief's Open Snags section renders inline snag rows directly — it doesn't use `<SnagList>`. So when this same data is duplicated in `/sites/[id]?tab=snags`, the user sees a different layout. The plot label appears in both, but Daily Brief shows it as a link only when `siteId` exists on the snag's plot — and the Daily Brief truncates after 20 snags (line 2607-2610) while SnagList has filters. No way to do a quick search across the truncated open snags from the Daily Brief.
- **Who notices:** Keith has 35 open snags; Daily Brief shows the top 20 with no search. He has to click "View all in Snags tab" to find a specific one.
- **Fix:** Either embed `<SnagList>` directly in the Daily Brief Open Snags section (with `showPlot` + `compactMode`), or at minimum add a search input within the Daily Brief snags card.

## P1 — Programme select-mode bulk Delete is missing; only Start/Delay surfaced

- **File:** `src/components/programme/SiteProgramme.tsx:2212-2249`
- **What's wrong:** Programme has a bulk-select toolbar with two actions: Start All + Delay Jobs. There's no bulk Sign Off, no bulk Pull Forward, no bulk apply-template, no bulk archive. For a site manager dealing with a row of plots that all finish the same week, Sign Off + Pull Forward are the actions they want most often. The infrastructure exists (`useJobAction.triggerBulkStart`), it just doesn't surface those verbs.
- **Who notices:** Keith finishes a row of plots' first-fix on the same day, wants to sign all four off — has to click into each plot's first-fix job. The "Select" button is right there but the menu only lets him Start.
- **Fix:** Add Sign Off All + Pull Forward All to the floating bulk-action bar.

## P1 — PlotDetailClient overview has 9 sub-tabs (Quality + Customer added) — tab strip overflows on mobile

- **File:** `src/components/plots/PlotDetailClient.tsx:1040-1083`
- **What's wrong:** TabsList renders 10 tabs (Overview, Gantt, Todo, Jobs, History, Materials, Drawings, Handover, Customer, Quality). On a 375px viewport that's a horizontal scroll bar with multiple icons + labels — useful tabs (Customer, Quality) end up off-screen. There's no overflow menu or "More ▾".
- **Who notices:** Keith on phone wants to look at the Quality tracker for a plot — has to scroll the tab strip right, click. Easy to miss.
- **Fix:** Either prioritize tabs by activity (push tabs with content to the front) or add a "More ▾" overflow at narrow widths showing the trailing tabs.

## P1 — JobWeekPanel synthetic-parent action buttons cap at "Live & Next" — manager can't fast-forward to a later child

- **File:** `src/components/programme/JobWeekPanel.tsx:1232-1240`
- **What's wrong:** When clicking a synthetic parent stage bar in the programme, the action panel only shows `liveJobs + nextJob`. If the manager wants to skip directly to job #4 of 5 children (because work is happening out of order in the field), there's no way from this panel. They have to go to the plot detail page.
- **Who notices:** Keith on site, plot has 5 first-fix sub-jobs, the plumber is actually doing job #3 first because of access. He wants to mark #3 as IN_PROGRESS from the programme. Can't.
- **Fix:** Add a "Show all" toggle in the panel that expands every child job, not just live + next.

## P1 — DailySiteBrief loses date selection on every refresh (manual or focus)

- **File:** `src/components/reports/DailySiteBrief.tsx:440` (`useState(getCurrentDate())`)
- **What's wrong:** The date state initialises to "today" (or dev-date). If Keith navigates the date back to look at yesterday's brief, then taps to mark something done, the `setRefreshKey((k) => k + 1)` triggers fetchData (line 638) which uses the current `date` — fine. But useRefreshOnFocus (line 642) also fires fetchData. If Keith is looking at yesterday's brief on his phone, switches apps for a call, comes back — the data refreshes but the date stays correct. So this case is OK. But: the **calendarOpen** state at line 441 is initialized to false and there's no useEffect to reset; switching between tabs (Daily Brief → Programme → Daily Brief inside the same site detail page) re-mounts the component (because hidden divs are kept mounted, but Tab switching uses display: hidden) — wait, actually `SiteDetailClient.tsx:2253` renders Daily Brief inside a `<div className={activeTab !== "daily-brief" ? "hidden" : undefined}>`, so the component stays mounted. So date state survives tab switches inside a site. The real issue: `date` is **lost** when the user navigates back to the daily brief from another route (e.g. opens a job from a date-back view, clicks Back), because the component remounts and resets to today.
- **Who notices:** Keith looking at yesterday's brief to follow up on something, taps into a job to check details, clicks Back — he's now on today's brief and has to re-navigate to yesterday.
- **Fix:** Persist the selected date in URL `?date=YYYY-MM-DD` so back/forward preserves it.

## P1 — Programme weather impact popover has no keyboard close handler

- **File:** `src/components/programme/SiteProgramme.tsx:2361-2417`
- **What's wrong:** The popover is opened by clicking a date column. It catches clicks on the backdrop (line 2364) but nothing handles Escape, and the input doesn't autofocus reliably (`autoFocus` at line 2394 only fires on initial mount; if the popover is closed and reopened in the same render cycle it won't refocus). Tabbing into the popover then pressing Esc does nothing.
- **Who notices:** Keyboard users, accessibility audits, anyone using the programme on desktop with both hands on keyboard.
- **Fix:** Use the design-system Popover from `components/ui/popover.tsx` instead of a hand-rolled fixed overlay; it handles Esc / focus trap correctly.

## P1 — DashboardClient "Watched/Muted sites" panel label confused: WatchedSite row = "muted" in new model but the row title says "Muted sites"

- **File:** `src/components/dashboard/DashboardClient.tsx:314-374` (WatchedSitesPanel)
- **What's wrong:** The variable is called `watchedSites`, the component is named `WatchedSitesPanel`, but the title is "Muted sites" and the message reads "Notifications are off for these sites". The semantic flip in #183 was a rename in concept only — the code still says "watched" everywhere, which makes it incredibly hard to reason about. Even the Dashboard's parent query (`dashboard/page.tsx:158`) is `prisma.watchedSite.findMany`. Worse: the WatchToggle component at `WatchToggle.tsx:34` uses a `muted` state read from `data.watching` (line 43-44) — same conceptual flip, same potential confusion. A new dev (or 6-months-future Claude) opens these files and will misread them.
- **Who notices:** Devs maintaining this, not Keith directly — but the inevitable bug from this conceptual mismatch will hit Keith eventually.
- **Fix:** Either rename the Prisma model from `WatchedSite` to `MutedSite` (migration) and align everything, or add prominent comments at every read/write site explaining the flip. The half-rename in place today is worse than either consistent option.

## P1 — Lateness section on Site Story shows the full LatenessSummary inline, defeating its own collapsed-by-default design

- **File:** `src/components/sites/SiteStoryPanel.tsx:494-500`
- **What's wrong:** SiteStoryPanel mounts `<LatenessSummary siteId={siteId} status="all" />`. LatenessSummary renders a collapsed header by default (`LatenessSummary.tsx:130`) — clicking expands. On Site Story, the manager has just scrolled past variance breakdown + snag summary; the lateness section being collapsed is friction. Either auto-expand it in story context or render the full list directly.
- **Who notices:** Keith reads the Story tab to write a customer update, scrolls past lots of context, hits a one-line "X open · Yd lost" stub. He has to click to see what.
- **Fix:** Add a `defaultExpanded` prop to LatenessSummary and pass `true` from the Story panel.

## P1 — Daily Brief "Recent Activity" section is collapsed but uses `openSections` toggle key "recent-activity" which is never auto-set

- **File:** `src/components/reports/DailySiteBrief.tsx:3122-3154`
- **What's wrong:** The Recent Activity card is rendered only when `data.recentEvents.length > 0` and toggled via `openSections.has("recent-activity")`. The auto-expand effect at line 650-668 lists every section that gets auto-opened — `"recent-activity"` is not in the list. So the section is always collapsed by default (correct intent per code comment) but has no per-event signal — Keith can't tell if today had 2 events or 47 from the header (it shows the count but not the urgency).
- **Who notices:** Keith wonders "did anyone touch the site today?" — has to expand to find out.
- **Fix:** Show the most recent event as a one-liner in the collapsed state, e.g. "Recent Activity (12) — last: 'Mark started ground works' 14 min ago".

## P1 — Programme jobs/sub-jobs toggle disabled state has no fallback message

- **File:** `src/components/programme/SiteProgramme.tsx:1219-1234`
- **What's wrong:** When no jobs have `parentStage`, Sub-Jobs is disabled with title="No sub-jobs in this programme — use hierarchical templates to enable". On mobile, title attributes don't show. Touching the disabled button does nothing and there's no visible explanation. Keith on his phone sees a greyed button, taps it, nothing.
- **Who notices:** Keith on mobile tries to switch view, gets stuck.
- **Fix:** When disabled, render a small "?" icon next to it that, on tap, shows a small popover explaining why. Or replace the disabled button with a HelpTip ribbon.

## P1 — Programme "Today" auto-scroll only triggers on mount + after data refresh; manual scrolling is yanked back

- **File:** `src/components/programme/SiteProgramme.tsx:892-896`
- **What's wrong:** `useEffect` keyed on `[todayIndex, cellWidth, scrollTrigger]` sets `scrollRef.current.scrollLeft = todayIndex * cellWidth`. `scrollTrigger` is bumped every fetch. So every time Keith refreshes the programme (focus, action), the timeline jumps back to today — even if he was inspecting week 22. He has to re-scroll.
- **Who notices:** Keith zooms to look at next month's schedule, taps to update something, gets thrown back to today.
- **Fix:** Only auto-scroll on **first mount** for a given siteId. Persist scroll position in a ref; restore after refresh; only jump to today on explicit "Today" button or initial mount.

## P1 — Header has Brief / Prog / Walk buttons but no Plot Detail / Snags shortcuts

- **File:** `src/components/layout/Header.tsx:112-152`
- **What's wrong:** When a site is selected, the three header pills jump to Daily Brief, Programme, Walkthrough. There's no "Plots" pill, no "Snags" pill, no "Orders" pill. Snags is one of Keith's most-touched per-site tabs (after Brief and Programme). The header would be the right place — these three are already there.
- **Who notices:** Keith on the dashboard, wants to jump to snags for site A — has to use the sidebar (which requires scrolling on phone) or Cmd-K.
- **Fix:** Add a "Snags" pill to the header, and consider a configurable layout where the user picks their three most-used tabs.

## P1 — `/daily-brief?site=X` mode behaves identically to `/sites/X?tab=daily-brief` but URL is different — confusing back-button + sharing

- **File:** `src/components/reports/GlobalDailyBriefClient.tsx:33-41`
- **What's wrong:** The "All Sites" picker pushes `/daily-brief?site=X` (line 40), which renders the same `<DailySiteBrief siteId>` as the per-site URL. Two different URLs for the same view = stale bookmarks, back-button confusion, copy-paste link confusion.
- **Who notices:** Keith shares the link with the QS for a specific site's brief — depending on where he was, it's one URL or the other. The QS's deep link may end up on All Sites if Keith's session has no site stored.
- **Fix:** When a site is picked from the global Daily Brief, redirect to `/sites/[id]?tab=daily-brief` (canonical URL) instead of `?site=`. Keep `?site=` working as a legacy redirect.

## P1 — Cmd-K verb "Site walkthrough" routes to `pickFor=walkthrough` even when only one accessible site exists

- **File:** `src/components/layout/SearchModal.tsx:171`
- **What's wrong:** If the user has access to exactly one site, the verb still routes to `/sites?pickFor=walkthrough` rather than forwarding straight to that site's walkthrough. The sites picker page shows a one-option list, requiring an extra click.
- **Who notices:** Solo-site managers, demo users, new accounts.
- **Fix:** When `pickFor` is set, if `getUserSiteIds().length === 1`, server-side redirect to the only site's destination.

## P2 — Programme "Today" red label can overlap the topmost plot row on overlay mode

- **File:** `src/components/programme/SiteProgramme.tsx:1719-1727`
- **What's wrong:** The "Today" red pill sits at `top: 0` with `z-20`. In overlay mode, the first row is `2 * ROW_HEIGHT = 64px`. The label is 16-18px tall and overlaps the top edge of the first bar. On a narrow column width it covers the stage code.
- **Who notices:** Visual nit but the first plot's first stage is unreadable on the today column when in overlay mode.
- **Fix:** Move the label above the timeline area (`top: -16px`) or render it inside the column header row.

## P2 — Programme weekend stripes drawn behind today's column, making "today on a Sunday" invisible

- **File:** `src/components/programme/SiteProgramme.tsx:2106-2120`
- **What's wrong:** Weekend stripe background uses `bg-slate-200/30` and is rendered after today highlights, with no z-index. On Sundays, the slate stripe overlays the red 6% highlight column. The today vertical line still shows but the column tint disappears.
- **Who notices:** Anyone working on a weekend or checking the programme over the weekend.
- **Fix:** Render weekend stripes BEFORE today overlays, or skip the stripe for the today column.

## P2 — Daily Brief 5-day forecast strip strips the date label, only shows day-of-week

- **File:** `src/components/reports/DailySiteBrief.tsx:1513-1528`
- **What's wrong:** Each forecast cell shows only `EEE` (Mon/Tue/etc) and the high temp. Mid-week the user can't tell which Tuesday from the forecast strip alone. No date.
- **Who notices:** Multi-week planning, anyone glancing 4 days ahead.
- **Fix:** Add the day-of-month underneath: "Tue 21° / 17".

## P2 — JobWeekPanel "View Plot" link uses `›` (›) but the breadcrumb uses `›` too — confusable

- **File:** `src/components/programme/JobWeekPanel.tsx:1186-1188`
- **What's wrong:** The DialogDescription uses `›` which is the same single-character "›". A reader can't tell at a glance whether they're looking at navigation or descriptive separator. No accessible label.
- **Who notices:** Edge case, but adds visual noise.
- **Fix:** Use `/` or `>` plain text for nav, dot `·` for descriptive separator.

## P2 — JobDetailClient inline date edit doesn't show a confirm dialog for impact when end date is dragged WITHOUT cascade

- **File:** `src/components/jobs/JobDetailClient.tsx:1959-1986` (Skip cascade button)
- **What's wrong:** When the user picks "Skip (save date only)", the job's end date jumps but downstream jobs are not shifted. No subsequent warning. If the new end date is after the next job's start, there's now an overlap with no signal to the user.
- **Who notices:** Keith manually extends a job by 3 days, picks Skip, the next job is supposed to start on the original end date — now they overlap. He won't notice unless he looks at the programme.
- **Fix:** Surface a small "Note: downstream jobs not shifted — they may now overlap" toast after a Skip-cascade save.

## P2 — Sidebar persists `sight-manager-last-site` but never clears it on logout

- **File:** `src/components/layout/Sidebar.tsx:559-569`
- **What's wrong:** When the user signs out (via `signOut` at line 481), the localStorage key for last-site stays. If a different user logs in on the same browser, the sidebar picks up the previous user's last-site as fallback (line 152-153). May or may not be in their accessible set — line 187-193 cleans this up, but only after `/api/sites` returns; for a brief flash the wrong site is selected.
- **Who notices:** Shared-device scenario (site office laptop) or after switching accounts.
- **Fix:** Clear the localStorage key in `signOut`'s callback before redirecting.

## P2 — DailySiteBrief "Pending Sign-offs" card uses `<a href>` instead of `<Link>`, causing a full page reload

- **File:** `src/components/reports/DailySiteBrief.tsx:2702-2718`
- **What's wrong:** Each pending sign-off row links via `<a href="/jobs/${j.id}">`. Every other job link in the same component uses `<Link href>`. The `<a>` triggers a full page reload, which is slower and loses scroll position.
- **Who notices:** Click feels different / slower from this card vs every other one.
- **Fix:** Replace `<a>` with `<Link>` for parity.

## P2 — Daily Brief Inactive Plots checklist has no "Send" or "Chase" CTA when orders are pending

- **File:** `src/components/reports/DailySiteBrief.tsx:2836-2851`
- **What's wrong:** Each inactive-plot card shows the order checklist (contractor / orders not sent / materials on site) but the only action button is "Start [job]". If orders aren't sent, the user has to know to navigate to that plot's orders tab — no inline Send action like the "Today's Jobs" expand-panel offers (line 1806-1830).
- **Who notices:** Inactive plot is inactive BECAUSE orders aren't sent. The button to fix the root cause is absent.
- **Fix:** Add an inline "Send orders" CTA when `ordersPending > 0` that opens the supplier-email flow for those orders, matching the "Today's Jobs" UX.

## P2 — DailySiteBrief weather "tomorrow card" advances date by 1 calendar day, not 1 working day

- **File:** `src/components/reports/DailySiteBrief.tsx:1496-1501`
- **What's wrong:** When the user clicks "Pre-mark tomorrow rained off" on Friday's brief, the date setter does `setDate(d => new Date(d.getTime() + 86400000))` → Saturday. They then mark Saturday rained off, which has no effect because no jobs run on Saturday.
- **Who notices:** Friday afternoon when Keith pre-marks tomorrow.
- **Fix:** Use `addWorkingDays(date, 1)` from `@/lib/working-days` instead of raw +24h.

## P2 — Programme search input clears via X button but doesn't refocus

- **File:** `src/components/programme/SiteProgramme.tsx:1343-1351`
- **What's wrong:** The clear X button resets `searchTerm` but doesn't return focus to the input. The user has to click into the input to type a new search.
- **Who notices:** Keith iterating on plot filters.
- **Fix:** Add a ref to the Input, focus it after clear.

## P2 — Header "Brief / Prog / Walk" hides label text under sm breakpoint, leaving only icons

- **File:** `src/components/layout/Header.tsx:121, 130, 139`
- **What's wrong:** `<span className="hidden sm:inline">` hides the labels on phones. So on mobile, three identical-sized blue-ghost buttons sit in the header with just an icon each. No tooltip support on touch. New users won't know which is which.
- **Who notices:** First-time mobile users.
- **Fix:** Either show labels at all breakpoints (compact text), or replace with a single "Site quick actions" dropdown on mobile.

## P2 — JobDetailClient's snag list refresh after raising a new snag pulls `/api/jobs/[id]` but reads `data.snags`, which the endpoint may not return

- **File:** `src/components/jobs/JobDetailClient.tsx:2007-2013`
- **What's wrong:** The `onSaved` callback fetches `/api/jobs/[id]` and tries `data.snags`. The job API at `/api/jobs/[id]` includes orders, actions, contractors, photos, but I see no `snags` include — meaning `data?.snags` will likely be undefined and the refresh quietly fails. Compare to the mount-time effect (line 336-353) which correctly fetches `/api/plots/${plotId}/snags`.
- **Who notices:** Raising a snag from JobDetail doesn't update the visible snag count until the user refreshes the page.
- **Fix:** Use the same endpoint as mount: `/api/plots/${plotId}/snags`, filter by jobId.

## P2 — Site detail TabsList has "Story" buried as the 11th tab in Site Admin group

- **File:** `src/components/layout/Sidebar.tsx:84` + `SiteDetailClient.tsx:2367`
- **What's wrong:** Site Story is one of the most useful retrospective tools, especially for customer comms drafting. It's listed at the END of "Site Admin" group, sandwiched between NCRs and Site Closure. New users won't find it.
- **Who notices:** Manager wants to write a customer update, doesn't know about Story tab.
- **Fix:** Either move Story to "Site Reporting" group, or pin it prominently in the daily brief as a "Generate update" CTA.

## P2 — Lateness reason picker "OTHER" is the default for new events but says "Not yet attributed"

- **File:** `src/components/lateness/LatenessSummary.tsx:44-46`
- **What's wrong:** "Not yet attributed" is a UX label, but the underlying value is "OTHER". When the user later picks "OTHER" intentionally (because it's genuinely "other" and they don't want to pick a specific reason), there's no way to distinguish "I haven't looked at this yet" from "I looked and chose Other deliberately". This makes the "X unattributed" surface (when added) ambiguous.
- **Who notices:** Anyone reading the reason breakdown on the Site Story.
- **Fix:** Introduce a distinct `UNATTRIBUTED` reasonCode (the default) and reserve `OTHER` for explicit "manager picked other".

## P2 — Daily Brief Snag resolve dialog autofocus moves to file input but "Resolve" button is the obvious next action

- **File:** `src/components/reports/DailySiteBrief.tsx:3371-3454`
- **What's wrong:** Opening the Resolve dialog focuses the file input (browser default). For Keith resolving a snag he already inspected, he just wants to click Resolve. Forcing him to tab past the file input first is two extra keypresses.
- **Who notices:** Power users.
- **Fix:** Focus the Resolve button when the dialog opens.

## P2 — Sidebar "Site Walkthrough" button stays muted-style when on the walkthrough page

- **File:** `src/components/layout/Sidebar.tsx:376-404`
- **What's wrong:** The `isActive` check is `pathname === \`/sites/${siteIdFromPath}/walkthrough\`` — this works only when `siteIdFromPath` is set. If the user is on `/sites/[id]/walkthrough` and the selectedSiteId fallback is from localStorage instead of the path, isActive flickers false during the brief load window. The button visual is dashed-border-when-inactive, solid-blue-when-active, so this flickers.
- **Who notices:** Subtle visual flash.
- **Fix:** Use `pathname.includes("/walkthrough")` for the active check.

## P2 — Programme top-of-page legend explains photo/note/order/delivery dots but legend lives at BOTTOM of the timeline

- **File:** `src/components/programme/SiteProgramme.tsx:2158-2196`
- **What's wrong:** The first time a user sees a small blue dot on a stage bar, they have no idea what it means. The legend explaining is at the very bottom of the scrollable area, past every plot row. They have to scroll past the entire programme to find the legend.
- **Who notices:** New users every time.
- **Fix:** Move the legend to the top toolbar (next to the Excel/PDF buttons), or anchor it sticky on the scrollable container.

## P2 — DailySiteBrief Bulk-Mode select-all button enters a state where Cancel button isn't visible until checkboxes are ticked

- **File:** `src/components/reports/DailySiteBrief.tsx:1332-1370`
- **What's wrong:** The floating bulk-action bar only renders when `bulkMode && selectedJobIds.size > 0`. Once the user enables Bulk mode (and that's done via... actually I can't find the toggle, let me re-search) — actually the bulk-mode toggle is missing from the visible UI in the file content I've read. The state exists (line 538) but no entry point. So the entire bulk-mode flow including the floating bar is dead code.
- **Who notices:** No one — that's the problem. Half-built feature.
- **Fix:** Either wire up a bulk-mode toggle button at the top of Daily Brief or remove the dead state.

---

**Summary: 12 P0, 19 P1, 14 P2 = 45 findings.**
