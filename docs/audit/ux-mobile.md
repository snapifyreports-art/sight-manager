# UX + Mobile Audit — May 2026

Audit of visual consistency, mobile usability, accessibility, and interaction polish across Sight Manager. Findings refer to the codebase as of 2026-05-13, 111 batches shipped, Daily Brief redesign + JobWeekPanel split + mobile FAB landed.

Findings are prioritised P0 (unusable / accessibility blocker) → P1 (inconsistent / friction) → P2 (polish). Many P0s come from a single pattern — text-[10px] action buttons in tightly-packed rows — that is repeated across Daily Brief, PlotDetail, Walkthrough, and SnagList.

---

## P0 — Daily Brief action buttons drop to 24px tall on mobile width below ~640px

- **File:** `src/components/reports/DailySiteBrief.tsx:378-398`, `:1290-1305`, `:1882-1903`, `:1948-1965`, `:2389-2400`, `:2451-2463`
- **What's wrong:** All quick-action buttons (Start / Complete / Extend / Delay / Pull / Note / Snag / Photos) use `h-9 sm:h-6` and `text-xs sm:text-[10px]`. The class string reads as "mobile gets h-9, desktop sm: collapses to h-6 + 10px text". But the `sm:` breakpoint in Tailwind is `min-width: 640px`, which fires on landscape phones too — and `h-6 = 24px` is well under the WCAG AA 24×24 minimum once you subtract the visual padding from the 44px hit zone (the `before:` pseudo extends the tap target, but the *visible* button is what users aim for). Combined with `text-[10px]` (10px) labels, the resulting button on tablets/landscape is a 24px-tall sliver with sub-legibility-threshold text.
- **Where visible:** Today's Jobs section, Late Starts, Overdue, Awaiting Sign Off, In Progress, Delayed — landscape iPhones, tablets, every browser ≥640px.
- **Fix:** Use `h-7 sm:h-7 text-xs` (28px / 12px) as floor across the board. The `h-9 sm:h-6` inversion goes against the "mobile gets bigger" intent. Touch budget is the same on landscape phone as portrait. Adopt a `<DailyBriefActionButton>` wrapper to centralise these classes — they're literally identical across ~15 sites.

## P0 — DailySiteBrief.tsx has zero dark mode coverage

- **File:** `src/components/reports/DailySiteBrief.tsx` (entire file)
- **What's wrong:** Grep for `dark:` returns 0 hits across 3,573 lines. Cards use `bg-white` / `bg-red-50` / `bg-amber-50` / `bg-blue-50` / `bg-slate-100` / `text-slate-700` etc. with no dark variants. When a user toggles dark mode (the `.dark` variant exists in `globals.css:85-117`) the entire Daily Brief renders as bright white pillows on a near-black body.
- **Where visible:** Daily Brief tab in dark mode — every site, every day.
- **Fix:** Either route all colour classes through tokens (`bg-card`, `text-foreground`, `bg-muted/30`) or add explicit `dark:bg-*` variants. Same applies to `LatenessSummary.tsx` (lines 102, 130, 152, 264 all use `bg-white` / `bg-slate-50` with no dark counterpart) and `PlotTodoList.tsx`.

## P0 — Walkthrough snag picker `<select>` is native — works but selects shown rotated on iOS landscape

- **File:** `src/components/walkthrough/SiteWalkthrough.tsx:1283-1294`, `:1347-1356`, `:1382-1400`
- **What's wrong:** Three native `<select>` elements with `h-9 px-3 py-2 text-sm` rounded styling. Native selects on iOS Safari ignore custom styling for the dropdown wheel UI but accept the height — at h-9 (36px) the touch target is fine, but `text-sm` (14px) inside `py-2` truncates the chevron icon. More importantly, only this walkthrough flow uses native `<select>` while every other dropdown across the app uses Base UI's `<Select>` primitive — inconsistent dropdown behaviour between the Walkthrough Modal and (say) Daily Brief's job picker.
- **Where visible:** Walkthrough "Change job" picker in snag/note modal, raise-snag priority.
- **Fix:** Migrate to the `<Select>` primitive from `src/components/ui/select.tsx`. iOS-friendly with consistent styling. If native is intentional for mobile speed, at minimum bump to `h-10` and keep the rest of the modal forms styled the same way.

## P0 — Snag list filter `<select>` height 24px violates touch target minimum

- **File:** `src/components/snags/SnagList.tsx:279-307`, `:321-328`
- **What's wrong:** Two filter `<select>` elements and the search `<input>` are all `h-6` (24px tall). Below WCAG AA touch target (24×24) once you account for the visible vs tappable area, especially given dense `gap-1.5` packing. On a phone the contractor / plot dropdowns sit in a single horizontal row at 24px — very fiddly.
- **Where visible:** Sites → Snags tab on mobile, especially when there are >5 contractors.
- **Fix:** `h-8` (32px) minimum for native form controls, `h-10` (40px) ideal. Stack the filter bar in a 2-col grid on `<sm` rather than horizontal scroll.

## P0 — JobWeekPanel dialog max-height `85vh` traps content on mobile keyboard

- **File:** `src/components/programme/JobWeekPanel.tsx:1170`
- **What's wrong:** `DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[85vh] overflow-y-auto"`. On mobile when the photo file picker or note textarea opens, the soft keyboard takes ~50vh — leaving the user with `85vh - 50vh = 35vh` of working content area. The 15% bottom margin means buttons (Start / Sign Off / Save) can sit *behind* the keyboard with no way to reach them except keyboard dismissal.
- **Where visible:** Programme tab → tap any week cell → keyboard interactions; same issue inherently affects SnagDialog (line 615).
- **Fix:** Use `max-h-[100dvh]` or `max-h-[100svh]` (small viewport height) with `pb-safe` (env(safe-area-inset-bottom)). Alternatively stick a sticky-bottom action footer outside the scroll region. Same pattern in `SnagDialog.tsx:615`.

## P0 — Color-only status indicators on stat dots without aria description

- **File:** `src/components/programme/SiteProgramme.tsx:1520-1528`
- **What's wrong:** Per-plot status dots `<span className="size-2 rounded-full bg-amber-400" title="Deferred" />` rely on the `title` attribute alone for semantic meaning. Safari/VoiceOver does not announce `title` reliably; colour is the only conveyance for sighted users and colour-blind users get five near-identical greys. The audit comment at `PlotDetailClient.tsx:618-635` correctly used `role="img" aria-label` for the analogous JOB_STATUS_DOT — the programme grid hasn't received the same treatment.
- **Where visible:** Site Programme left column — the colour pip beside each plot number.
- **Fix:** Add `role="img"` + `aria-label="Plot 12: ahead of schedule"` to each dot; mirror the pattern from `PlotDetailClient.tsx:627`.

## P0 — Native checkbox inputs in DailySiteBrief escape touch target via `size-3.5`

- **File:** `src/components/reports/DailySiteBrief.tsx:1240-1245`, `:3187-3193`
- **What's wrong:** `<input type="checkbox" className="size-3.5 ..." />` renders a 14×14 checkbox. Native checkboxes can't be expanded with a `before:` pseudo (they don't accept `::before`); the visual control + tap target are the same 14px. In Bulk Mode the user has to land on a 14px square repeatedly. Same pattern in rained-off dialog.
- **Where visible:** Daily Brief → toggle Bulk Mode → checkboxes on every job row.
- **Fix:** Wrap each checkbox in a `<label className="flex p-2 -m-2 cursor-pointer">` so the entire 40px padded area accepts the tap, or use `accent-blue-600 size-5`.

## P0 — Today highlight bar on programme grid not labeled for screen readers

- **File:** `src/components/programme/SiteProgramme.tsx:1707-1738`
- **What's wrong:** The vertical "Today" line and the red label `<div>Today</div>` are decorative `pointer-events-none` overlays with no `aria-label` or `role="separator"`. A screen reader user navigating the grid has no announcement of which column is current — same problem as the colour-only stat dots, scaled up.
- **Where visible:** Site Programme on any screen reader, every site.
- **Fix:** Add `role="separator" aria-label="Today {date}"` on the vertical line div; the label div should also be `aria-hidden="true"` since it's redundant once the separator has aria.

## P0 — Mobile horizontal scroll in Programme view traps the entire page on iOS

- **File:** `src/components/programme/SiteProgramme.tsx:1457`
- **What's wrong:** `<div className={isFullscreen ? "flex-1 overflow-x-auto overflow-y-auto" : "overflow-x-auto"}>` — this is the only scroll container, so swipes get absorbed by horizontal pan and there's no vertical scroll on the inner container without entering fullscreen. The fullscreen affordance is a tiny icon button (`size-3.5`) hidden in a long toolbar with no mobile-specific styling — most mobile users won't find it. The MEMORY notes #181 deliberately removed the mobile-specific programme — fine, but the Gantt at iPhone 13 width (390px) shows ~9 plot-meta columns hogging the whole viewport before a single timeline column appears, forcing users to scroll horizontally first to see any work.
- **Where visible:** Site Programme on any mobile device.
- **Fix:** Collapse left panel to `LEFT_PANEL_COLLAPSED` (52px) by default on `<md` viewports; provide an "Expand details" mobile-FAB-style control. Today's `expanded={false}` default is good but `width: 52px` still leaves ~75% of a phone showing one plot's number — that's not useful.

## P0 — DailySiteBrief contractor `<select>` and assignee `<select>` are tiny native elements

- **File:** `src/components/reports/DailySiteBrief.tsx:1837-1864`, `:2576-2588`
- **What's wrong:** Inline contractor / assignee pickers use raw `<select>` with `text-[10px] px-2 py-1` — that's an 8-10mm tall control on a phone. Crucial mid-flow assignment ("you can't start this job without a contractor") and the user has to manage a 22px-tall native dropdown. Combined with the `h-6` confirm button at `:1844-1846`, the entire inline-assign row is below the touch minimum.
- **Where visible:** Daily Brief → Today's Jobs → tap "Contractor" or "Assignee" missing-checklist item.
- **Fix:** Use the design system Select (h-8 / h-10 minimum) and a `h-9` confirm button. The whole inline-pick row should grow to ~44px on mobile.

## P1 — Daily Brief sections use inline-defined sub-section header colors that don't match a token system

- **File:** `src/components/reports/DailySiteBrief.tsx:1735-1737`, `:1922-1924`, `:1973-1975`, `:2016-2017`, `:2084-2085`, `:2144-2146`, `:2208-2210`, `:2239-2240`
- **What's wrong:** Sub-section heading rows mix `text-green-700`, `text-emerald-700`, `text-red-700`, `text-slate-500`, `text-amber-700`, `text-blue-700`, `text-violet-700`, `text-indigo-700` in `text-[11px] font-semibold uppercase` — eight unrelated colours for what is essentially the same visual element (a section divider). The hierarchy doesn't communicate priority; it just communicates "different things". Compare to `LatenessSummary` (lines 153, 209) which uses a single muted style.
- **Where visible:** Daily Brief — every page when expanded.
- **Fix:** Use `text-muted-foreground` for all sub-section headings; reserve coloured pills (already in place) for the count badges. Reduces visual noise by ~70%.

## P1 — Daily Brief uses three different toast systems

- **File:** `src/components/reports/DailySiteBrief.tsx:586-594`
- **What's wrong:** Mixes `useToast()` (global), a `localToast` bottom-banner, and `showToast()` legacy function. The component comment explicitly flags this ("legacy, kept for the many pre-existing showToast call sites"). New code mostly uses `toast.error()` but the file's own paths still call `showToast()` (e.g. `:733`, `:751`, `:777`). Users get either a top-right toast or a bottom inline banner depending on which code path triggered. Inconsistent surface area.
- **Where visible:** Daily Brief — any error path.
- **Fix:** Replace all `showToast(msg, "error")` / `showToast(msg, "success")` with `toast.error(msg)` / `toast.success(msg)` and delete the local banner. Single source.

## P1 — JobActionStrip buttons inconsistent between `bg-emerald-600` (solid) and `border-emerald-200` (outline)

- **File:** `src/components/reports/DailySiteBrief.tsx:1951-1956`
- **What's wrong:** "Complete" and "Sign Off" appear as adjacent solid emerald buttons of different shades (`bg-emerald-600` vs `bg-emerald-700`), while in another row "Start" is `variant="outline" border-green-200`. Inconsistent treatment for primary actions across nearby rows. Two solid buttons next to each other dilute the primary-action signal — neither stands out.
- **Where visible:** Today's Jobs → Finishing rows.
- **Fix:** Pick one primary per row (Sign Off probably) and keep Complete as outline; or make all action-strip buttons outline since this is a dense list view.

## P1 — Inline mailto link wrapped around `<a>` with `<button>`-like styles loses focus ring

- **File:** `src/components/reports/DailySiteBrief.tsx:1816-1822`
- **What's wrong:** `<a href="mailto:..." onClick={...} className="rounded border border-violet-200 ...">Send</a>` — anchors styled as buttons but missing `focus-visible` ring (Tailwind utility shipped on the design-system Button is absent here). Keyboard users tabbing to the Send link see nothing.
- **Where visible:** Daily Brief → pending orders panel.
- **Fix:** Use `<Button render={<a href="..." />}>` or add `focus-visible:ring-3 focus-visible:ring-ring/50`.

## P1 — JobWeekPanel synthetic-job nested action buttons are slightly different from main panel

- **File:** `src/components/programme/JobWeekPanel.tsx:1294-1349`
- **What's wrong:** Child-job action buttons inside synthetic parents use `bg-blue-600 hover:bg-blue-700 text-white` direct classes, while the parent's action buttons at `:1393-1417` use the same intent through Button's `variant="default"` (which resolves to the primary token, not raw blue-600). When tenant branding changes the `--brand-primary` CSS variable (see `app/(dashboard)/layout.tsx:33`), the primary buttons follow but the child synthetic buttons stay hard-blue.
- **Where visible:** Synthetic stage panel → child-job action row.
- **Fix:** Replace `bg-blue-600 hover:bg-blue-700` with `bg-primary hover:bg-primary/80` or use `<Button>` directly. Same for `bg-emerald-600` sign-off buttons at `:1343-1348`.

## P1 — JobWeekPanel buttons in modal use plain `<button>` not `<Button>` — emoji-as-icon

- **File:** `src/components/programme/JobWeekPanel.tsx:1735-1781`, `:1797-1830`, `:1869-1881`
- **What's wrong:** Programme-impact dialog uses raw `<button>` elements with hand-crafted `rounded-xl border-2 border-blue-200 bg-blue-50` classes and embedded emoji (`⏩`, `📐`, `📋`) for icons. This violates the design system in two ways: (1) emoji rendering varies by OS (Windows uses flat colour, iOS uses skeuomorphic 3D), (2) emoji don't size with `size-*` and aren't accessible the same way as lucide icons. Action grid in PostCompletionDialog at `:1734-1781` has the same issue.
- **Where visible:** Job completion → programme impact dialog.
- **Fix:** Replace `⏩` with `<Zap className="size-4" />`, `📐` with `<Maximize2 />`, `📋` with `<ClipboardList />`. Wrap in `<Button variant="outline" className="h-auto p-4 flex-col">` for consistent focus state.

## P1 — `<SnagList>` filter pills don't match `<Tabs>` styling used elsewhere

- **File:** `src/components/snags/SnagList.tsx:246-258`, `:262-274`
- **What's wrong:** Status / Priority filter chips use bespoke `rounded-full bg-blue-600 text-white` / `bg-slate-100 text-slate-600` — visually different from the project's TabsList primitive which would handle this with `data-active:bg-background data-active:text-foreground`. Pills also can't be keyboard-navigated as a group (no `role="tablist"`).
- **Where visible:** Sites → Snags tab filter bar.
- **Fix:** Convert to `<Tabs variant="line">` from `src/components/ui/tabs.tsx` — already used for site sub-nav. Existing fade-mask + keyboard support comes for free.

## P1 — `text-[10px]` and `text-[11px]` arbitrary sizes used 200+ times instead of `text-xs`

- **File:** Across `src/components/reports/DailySiteBrief.tsx`, `src/components/plots/PlotTodoList.tsx`, `src/components/walkthrough/SiteWalkthrough.tsx`, etc. (212 total occurrences in DailySiteBrief alone)
- **What's wrong:** Arbitrary text sizes break the type scale. The `globals.css` doesn't define `--text-10px` or `--text-11px` — these are inline literals. Tailwind's `text-xs` (12px) is the smallest sanctioned size in the design system; anything smaller is below the WCAG 1.4.4 readable threshold (most browsers don't allow scaling arbitrary px values via user-zoom UI controls in older versions).
- **Where visible:** Every counter pill / sub-heading / metadata strip.
- **Fix:** Mass-replace `text-[10px]` → `text-xs`, `text-[11px]` → `text-xs`. Reserve `text-[8-9px]` (47 occurrences) for badge-counter only and only on desktop (`md:text-[9px]`).

## P1 — Header per-site action buttons collapse to icons-only on mobile but contractor-pill text remains

- **File:** `src/components/layout/Header.tsx:114-149`
- **What's wrong:** The four context buttons (Brief / Prog / Walk / Search) collapse via `hidden sm:inline` on the label but keep the icon at `size-4 sm:size-3.5` — icon gets *bigger* on mobile (good) but the buttons are `size="sm"` (`h-7`). At narrow widths the 4 icons live in a 7×4 = 28×28 footprint per icon-button row including padding — borderline tap target especially when adjacent to the avatar dropdown.
- **Where visible:** Top header on mobile.
- **Fix:** Bump `size="sm"` to `size="default"` (h-8) on mobile, or use `size="icon"` (size-8 native) with `md:size-sm` so desktop stays compact. Header is the most-tapped UI in the app — worth the pixels.

## P1 — Sidebar Walkthrough button has gradient + dashed border + multiple icons fighting for attention

- **File:** `src/components/layout/Sidebar.tsx:381-403`
- **What's wrong:** The walkthrough item uses `border-dashed border-border/60` and `bg-gradient-to-r from-blue-600/[0.12] to-blue-600/[0.04]` plus a Footprints icon at `size-[18px]` plus an animated `transition-all duration-150`. It's visually shoutier than the active state of every other nav item — making the *currently-active* item less prominent than walkthrough.
- **Where visible:** Desktop left sidebar.
- **Fix:** Drop the dashed border and gradient; use the same nav-item style as everything else, perhaps with a subtle "Quick action" label above it.

## P1 — Sidebar mobile sheet uses 75% width vs SheetContent's `data-[side=right]:sm:max-w-sm` default

- **File:** `src/components/layout/Sidebar.tsx:633`, `src/components/ui/sheet.tsx:56`
- **What's wrong:** `<SheetContent side="left" className="w-[260px] p-0">` overrides the default `w-3/4` — fine — but inside the sheet, `SidebarNav` uses `min-h-screen` and the close affordance is hidden via `showCloseButton={false}`. Users on Android with no Back gesture need to swipe-left or tap outside to close, but the design's "MEMORY notes" say swipe-right opens and swipe-left closes — only works because of a touch listener at lines 608-621 that doesn't account for vertical scroll start within the sheet. Mid-sheet drag attempts may not register.
- **Where visible:** Mobile sidebar dismissal.
- **Fix:** Show the close button (`showCloseButton` defaults to true if removed) or add a visible "Close" link at the bottom. Test swipe-to-close on Android.

## P1 — DashboardClient stat cards: hard-coded color tokens override the design system

- **File:** `src/components/dashboard/DashboardClient.tsx:140-172`, `:206-269`
- **What's wrong:** `STATUS_CONFIG` defines hex colors (`#22c55e`, `#3b82f6`) used by recharts; the card backgrounds use Tailwind `bg-emerald-50`. Recharts colors won't shift in dark mode; cards have `bg-emerald-50` but no `dark:bg-emerald-950/30`. Stat cards at `:287-292` use `bg-gradient-to-br ${card.gradient}` with raw `from-blue-500 to-blue-600` instead of a token. When tenant branding lands, these still show blue.
- **Where visible:** /dashboard page on any tenant whose primary isn't blue.
- **Fix:** Either route all 8 stat cards through brand variables or accept that these are "icon decoration only" and document it.

## P1 — FloatingActions hides on `md+` but Cmd-K isn't discoverable on tablet

- **File:** `src/components/shared/FloatingActions.tsx:91`
- **What's wrong:** FAB is `md:hidden` (hidden on ≥768px). Comment claims Cmd-K covers desktop, but on iPad (1024px landscape) users have no keyboard and no FAB — so quick raise-snag / new-order is gated behind navigating to the Sites list and finding the action. Tablet UX falls through both nets.
- **Where visible:** iPad / Android tablet in landscape.
- **Fix:** Show FAB up to `lg-` (`lg:hidden` instead of `md:hidden`) — or detect touch device via `@media (pointer: coarse)` and show regardless of width.

## P1 — Daily Brief "Print" button hides label on mobile, keeping just icon — but the icon is `size-3.5` (14px)

- **File:** `src/components/reports/DailySiteBrief.tsx:1319-1328`
- **What's wrong:** `<Printer className="size-3.5" /><span className="hidden sm:inline ml-1">Print</span>` — a 14px icon-only button on mobile gives a near-invisible affordance. Most managers won't try to print from a phone, but the button still takes up screen space at a hostile size.
- **Where visible:** Mobile top of Daily Brief.
- **Fix:** Hide the button entirely on `<md` (`hidden md:inline-flex`) since printing from a phone isn't a realistic flow; or bump to `size-4` minimum with clear `aria-label="Print daily brief"`.

## P1 — Plot stage groups percent bar conflates colour and progress state

- **File:** `src/components/plots/PlotDetailClient.tsx:606-636`
- **What's wrong:** Progress bar fills with `bg-green-500` regardless of whether the stage is on-track or behind schedule. The status dots beside the bar do encode state — but green-on-green-on-green (bar + completed dots) tells a user nothing they didn't already know. A behind-schedule stage with 50% complete looks identical to an ahead-of-schedule stage with 50% complete.
- **Where visible:** Plot detail → Overview → Jobs by Stage.
- **Fix:** Tint the bar by status: `bg-emerald-500` when ahead, `bg-blue-500` on-track, `bg-amber-500` behind. Or remove the bar entirely if the dot strip is the SSOT.

## P1 — Walkthrough Modal uses a different shape from app-wide Dialog

- **File:** `src/components/walkthrough/SiteWalkthrough.tsx:136-161`
- **What's wrong:** Custom `<Modal>` component bypasses the design-system `<Dialog>` to get a bottom-sheet mobile pattern. Comment says "NOT a duplicate" but in practice it IS duplicating the Sheet component (which already supports `side="bottom"` — `src/components/ui/sheet.tsx:56`). Maintaining two modal codepaths is friction; the Sheet does this natively.
- **Where visible:** Walkthrough modals.
- **Fix:** Migrate to `<Sheet side="bottom">` from the design system. Eliminates the bespoke `<Modal>` and gets accessibility primitives (focus trap, escape key, scroll lock) for free.

## P1 — Tasks page urgency colors (`urgencyColors`, `urgencyBadge`) duplicate STATUS_CONFIG-style maps

- **File:** `src/components/tasks/TasksClient.tsx:150-160`
- **What's wrong:** Defines local colour maps `{ overdue: "bg-red-50 ...", today: "bg-amber-50 ...", upcoming: "bg-blue-50 ..." }` that aren't shared with Daily Brief (which has its own ad-hoc colour decisions). Three or more "urgency palettes" exist in the codebase.
- **Where visible:** /tasks page.
- **Fix:** Extract a `<UrgencyPill>` component or a `urgencyClass()` helper in `src/lib/ui-tokens.ts` (which doesn't exist yet — create it).

## P1 — `Avatar` component used in Header has no fallback alt on the avatar image — but only the fallback initials shown

- **File:** `src/components/layout/Header.tsx:165-169`, `src/components/ui/avatar.tsx`
- **What's wrong:** Avatars in header + sidebar always render `<AvatarFallback>` with initials, never actual photo. Going through `src/components/ui/avatar.tsx` confirms there's no `AvatarImage` use anywhere in the codebase. The fallback initials look fine but screen readers receive `<span aria-label?>` with no description.
- **Where visible:** Header avatar dropdown trigger.
- **Fix:** Wrap fallback in `<span role="img" aria-label="${user.name}">` or rely on the dropdown button having a sensible accessible name.

## P1 — Programme view selectMode "All" / "None" buttons have no aria-pressed state

- **File:** `src/components/programme/SiteProgramme.tsx:1289-1326`
- **What's wrong:** Select-mode toggle button at `:1289-1302` uses `selectMode ? "border-blue-300 bg-blue-50 text-blue-700" : "..."` for visual state but no `aria-pressed`. Screen reader announces it as a normal button without conveying that it's a toggle.
- **Where visible:** Programme tab toolbar.
- **Fix:** Add `aria-pressed={selectMode}`. Same applies to zoom/fullscreen/gantt-mode toggle buttons at `:1239-1255`, `:1259-1276`, `:1281-1286`.

## P1 — DailySiteBrief lateness summary mounted twice in some flows

- **File:** `src/components/reports/DailySiteBrief.tsx:1630`, `src/components/plots/PlotDetailClient.tsx:502`
- **What's wrong:** `<LatenessSummary siteId={...} status="open" />` is rendered on Daily Brief; the same component with `plotId` is rendered on Plot Detail. If a user navigates Daily Brief → tap plot, then back, two instances briefly mount. Component fetches `/api/lateness?...` each time. Mostly aesthetic but the dashed-border "Nothing late here." empty state then flashes on plot pages where lateness data hasn't fetched yet.
- **Where visible:** Plot Detail → Lateness card flicker on navigation.
- **Fix:** Use the `compact` prop on Plot Detail's mount so the empty state is `null` (line 108 already handles this case) — current usage passes `status="all"` and `compact` is not set, so users see the empty-state pill flash.

## P1 — `Today` programme highlight uses 6% opacity which fails 3:1 ratio against white

- **File:** `src/components/programme/SiteProgramme.tsx:1711`
- **What's wrong:** `bg-red-500/[0.06]` — that's ~6% red on white background, barely above pure white. The red vertical line at `:1729-1737` is solid 2px red with shadow, so the line is fine — but the "highlight column" doesn't actually highlight anything visible.
- **Where visible:** Programme grid today-column tint.
- **Fix:** Either bump to `bg-red-500/[0.12]` (still subtle) or remove the highlight rectangle entirely — the red line + label do the work.

## P1 — DialogContent always centers — bad pattern for tall mobile forms

- **File:** `src/components/ui/dialog.tsx:65`
- **What's wrong:** `fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ... max-w-[calc(100%-2rem)]`. On a phone with a tall form (SnagDialog, JobWeekPanel) the dialog opens centered, content overflows top and bottom, and the user must scroll within the modal — but the scroll handle is the entire modal so accidental drag-down dismisses it on Android Chrome's pull-to-refresh.
- **Where visible:** SnagDialog on a phone, JobWeekPanel on a phone.
- **Fix:** Add a mobile-specific class: `sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-b-none max-sm:rounded-t-xl` — bottom-sheet pattern on small screens, centered on larger.

## P1 — Forms in PlotDetail's AddJobDialog lack required-field markers

- **File:** `src/components/plots/PlotDetailClient.tsx:132-200`
- **What's wrong:** The form has `if (!name.trim()) return;` so "name" is required, but the input lacks `required` attribute and no asterisk/label indicates it. User clicks Submit, nothing visible happens, no error message. SnagDialog gets this right (line 1051 has `Description *`); AddJobDialog doesn't.
- **Where visible:** Add Job dialog form.
- **Fix:** Add `<span aria-hidden="true" className="text-red-500"> *</span>` to labels of required fields + `required` to the inputs + an explicit "Name is required" inline error.

## P1 — DailySiteBrief "lateness" pill not surfaced in the same row as other status pills

- **File:** `src/components/reports/DailySiteBrief.tsx:1560-1622`
- **What's wrong:** Three pill rows (Jobs / Materials / Issues) — but the LatenessSummary widget renders separately *below* the pill rows (line 1630). Lateness count belongs in the Issues row as a pill ("3 Late · 12 days lost"). Disconnect between LatenessSummary's own count and the Jobs row's `Late` pill (line 1566).
- **Where visible:** Daily Brief top summary.
- **Fix:** Merge the LatenessSummary header into a pill in the Issues row; expand on click instead of always-rendered.

## P1 — JobWeekPanel "View Plot" link uses `text-blue-600` instead of `<Link>` with design-system styling

- **File:** `src/components/programme/JobWeekPanel.tsx:1551-1569`
- **What's wrong:** Two `<Link>`s with `flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800` — manually styled. No `focus-visible:ring` so keyboard users can't see when they tab to them. Should be `<Button variant="link" render={<Link href=... />}>` to inherit focus state.
- **Where visible:** Bottom of JobWeekPanel after photo/notes sections.
- **Fix:** Use Button with link variant.

## P2 — JobWeekPanel "Start Job" button is 100% width blue solid, blocks the eye from secondary content

- **File:** `src/components/programme/JobWeekPanel.tsx:1392-1399`
- **What's wrong:** Full-width primary button at the top of the panel is visually dominant — almost certainly correct UX for "Start Job" — but the same shouty treatment is used at line 1402-1419 for "Pause + Sign Off" pair. Two full-width buttons stacked + a "Delay Job" / "Pull Forward" 50/50 row below = four loud primary-action buttons in 100px of vertical space. Even on desktop this dominates.
- **Where visible:** JobWeekPanel for IN_PROGRESS jobs.
- **Fix:** Pause should be `variant="ghost"` (it's a destructive-ish micro-action), or render the four buttons in a 2×2 grid with consistent height.

## P2 — Sidebar collapse button is a -3px floating circle that overlaps content

- **File:** `src/components/layout/Sidebar.tsx:585-598`
- **What's wrong:** `absolute -right-3 top-[22px]` — the collapse handle sits half-outside the sidebar. At zoom levels above 100% or fonts above default it can collide with whatever's in the main content area at the top-left. Common Z-index workaround (`z-30`) but still aesthetically awkward when the page header has its own border-bottom.
- **Where visible:** Desktop sidebar.
- **Fix:** Move inside the sidebar bottom or place as a top-corner button. The current position is a common pattern but breaks at high font sizes.

## P2 — Toast viewport at top-right covers Daily Brief's date row on narrow screens

- **File:** `src/components/ui/toast.tsx:90`
- **What's wrong:** `fixed right-4 top-4 z-[9999] max-w-md` — on a ~375px phone the toast sits over the page title. With multiple toasts stacked (e.g. bulk-action) the entire header area is obscured.
- **Where visible:** Bulk action triggering multiple toasts, mobile.
- **Fix:** Move toasts to `bottom-4` on mobile (`max-sm:bottom-4 max-sm:top-auto`), keep top-right on desktop. Avoid overlapping the FAB by using `max-sm:bottom-24`.

## P2 — Filter chips in SnagList lack visible focus indicator

- **File:** `src/components/snags/SnagList.tsx:247-273`
- **What's wrong:** `<button className="rounded-full px-2.5 py-0.5 text-[11px] ...">` — no focus-visible ring. The design-system `<Button>` would add it but these are raw `<button>` elements.
- **Where visible:** Sites → Snags → tab keyboard navigation.
- **Fix:** Add `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`.

## P2 — Many icon-only buttons missing aria-label

- **File:** `src/components/sites/SiteDetailClient.tsx:1003-1009`, `src/components/programme/SiteProgramme.tsx:1162-1178`, `src/components/programme/SiteProgramme.tsx:1244, 1253` (zoom-in/out icons)
- **What's wrong:** Several icon-only buttons rely on `title` attribute alone for accessible name. `title` is not consistently announced by screen readers across browsers — `aria-label` is more reliable. There are 46 files using `aria-label` according to grep, but many components still don't.
- **Where visible:** Random Site Programme zoom controls, etc.
- **Fix:** Audit `<button><Icon /></button>` without text inside. Add `aria-label`. Existing example to copy: `FloatingActions.tsx:114`.

## P2 — Daily Brief progress bar lacks `role="progressbar"` and ARIA values

- **File:** `src/components/reports/DailySiteBrief.tsx:1591-1597`, `src/components/plots/PlotDetailClient.tsx:517-522`
- **What's wrong:** Progress bars are pure decorative divs with width-style. No `role="progressbar"`, no `aria-valuenow`, no `aria-valuemax`. Screen readers see two unrelated divs.
- **Where visible:** Daily Brief progress card, Plot Detail progress card.
- **Fix:** Wrap: `<div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Completion">`.

## P2 — `getCurrentDate` ignores time zone; rendered date strings might be off by one in late-evening UK

- **File:** `src/components/reports/DailySiteBrief.tsx:1317`
- **What's wrong:** UI-level — `format(date, "EEEE, d MMMM yyyy")` is a local-time format, but the API call uses `format(date, "yyyy-MM-dd")` (line 630). UK transitions through BST and the dev-date helper midnight-snap (per MEMORY) handles this, but in places like the calendar popover the date selected via `<Calendar>` will be a `Date` object whose ISO conversion can disagree with the displayed text. Not a pure UX issue but a long tail of "I picked Wed but the URL says Tue" reports.
- **Where visible:** Daily Brief date picker.
- **Fix:** Use `toDateKey()` helper (referenced in JobWeekPanel as a fix for the same class of bug) — consistent.

## P2 — Top of DailySiteBrief uses `text-sm sm:text-lg` for date, no `<h1>`

- **File:** `src/components/reports/DailySiteBrief.tsx:1316-1318`
- **What's wrong:** Date heading renders as `<p>` with size jumping from `text-sm` to `text-lg`. The Daily Brief is a top-level reporting page; there's no `<h1>` for assistive tech to land on. Header.tsx renders the page title as `<h1>` (line 109) but that's the chrome title "Dashboard" or "Sites" — not the per-site brief title.
- **Where visible:** Daily Brief on every site.
- **Fix:** Replace `<p>` with `<h1 className="text-base sm:text-xl">`. The site name should also feature.

## P2 — `<select>` in PreStart dialog has 4px tap target between options

- **File:** `src/components/reports/DailySiteBrief.tsx:1837-1843`
- **What's wrong:** `<select className="flex-1 rounded border px-2 py-1 text-[10px]">` — 10px text in a `py-1` (4px padding) wrapper. Options inside a native picker on mobile are fine (OS-native), but the trigger itself is sub-tappable.
- **Where visible:** Daily Brief contractor inline-assign.
- **Fix:** `h-9 text-sm px-3 py-2`.

## P2 — Tasks page urgency-color palette assumes light-mode only

- **File:** `src/components/tasks/TasksClient.tsx:150-160`
- **What's wrong:** `bg-red-50 border-red-200 text-red-700` — no dark variants. Pattern repeats throughout the file (10+ uses).
- **Where visible:** /tasks page in dark mode.
- **Fix:** Add `dark:bg-red-950/30 dark:border-red-900 dark:text-red-300` companion classes (same shape across each colour).

## P2 — Handover progress bar uses bare hex / fixed-color logic without dark mode

- **File:** `src/components/handover/HandoverChecklist.tsx:206-213`
- **What's wrong:** `bg-slate-100` track + `bg-green-500` / `bg-blue-500` fill — no dark mode + no `aria-valuenow`. Same pattern as Daily Brief / Plot Detail.
- **Where visible:** Plot → Handover tab.
- **Fix:** Token-based + role="progressbar". Could extract `<ProgressBar value={pct} variant={complete ? "success" : "info"} />` as a primitive.

## P2 — Avatar gradient in Header is hardcoded `from-blue-500 to-indigo-500`

- **File:** `src/components/layout/Header.tsx:166`, `src/components/layout/Sidebar.tsx:461`
- **What's wrong:** User avatar gradient never matches tenant branding. With white-label rolling out (per MEMORY), every tenant's manager has the same Anthropic-blue avatar.
- **Where visible:** Sidebar + header user avatar.
- **Fix:** Route through `bg-primary` or compute from username hash.

## P2 — DialogFooter has fixed `flex-col-reverse sm:flex-row` — primary action below on mobile

- **File:** `src/components/ui/dialog.tsx:119`
- **What's wrong:** On mobile, footer is `flex-col-reverse` so Cancel appears first (top), Confirm second. Convention varies (iOS prefers Confirm right-most, Android prefers Confirm bottom-most), but the current pattern means *primary* lives at the bottom of the dialog — fine on iOS, less so on web where the bottom edge is keyboard-distance.
- **Where visible:** Most dialogs on mobile.
- **Fix:** Acceptable as-is, but document the convention. Verify against Android Chrome with keyboard open.

## P2 — `text-[8px]` literal text in Approval column (programme grid)

- **File:** `src/components/programme/SiteProgramme.tsx:149`
- **What's wrong:** `text-[8px]` in `ApprovalDot` is illegible at standard zoom — 8px is below the 9px floor most fonts maintain hinting at. The visual relies on the colored cell, but the embedded "✓" character may not render.
- **Where visible:** Programme G/E/W/K approval cells.
- **Fix:** Remove the inline character, use a `<Check />` icon at `size-2.5` (10px) — vector renders at any zoom.

## P2 — Walkthrough action buttons use `active:scale-95` but no `:focus-visible` ring

- **File:** `src/components/walkthrough/SiteWalkthrough.tsx:1038-1042`, `:1048-1056`
- **What's wrong:** Primary action buttons (Sign Off, Start) use `active:scale-95` for tap feedback (good) but skip `focus-visible:ring` (bad — keyboard users get no indication).
- **Where visible:** Walkthrough on keyboard.
- **Fix:** Add `focus-visible:ring-3 focus-visible:ring-ring/50`.

## P2 — Programme view filter selects placeholder hardcoded as "House Type" / "Stage" / "Status"

- **File:** `src/components/programme/SiteProgramme.tsx:1357`, `:1374`, `:1389`
- **What's wrong:** `<SelectTrigger size="sm" className="h-7 text-xs">` — 28px tall trigger. The visual indicator is the placeholder; once a value's selected the chevron disappears into the 28px container. Below the touch-target floor on mobile and visually cramped.
- **Where visible:** Site Programme filter row.
- **Fix:** Use `size="default"` (h-8) for filters.

## P2 — SnagDialog Close button uses red text on hover, but the action is benign

- **File:** `src/components/snags/SnagDialog.tsx:993-997`
- **What's wrong:** "Close" button (dismiss the dialog) styled as `variant="outline"` — fine. But the adjacent Delete button at `:965-971` uses `text-red-500 hover:text-red-600` with no `variant="destructive"`, making both red. User can't easily distinguish "close this dialog" from "permanently delete this snag" at a glance.
- **Where visible:** Snag detail dialog footer.
- **Fix:** Use `<Button variant="destructive">` for Delete. The destructive variant in design system has higher contrast and clearer signaling.

## P2 — Daily Brief Print stylesheet doesn't hide the FAB

- **File:** `src/app/globals.css:212-241`
- **What's wrong:** `@media print` hides `aside, nav, header, .no-print` but not `.fixed` elements like FAB (which is in `<FloatingActions>` with no class hook into print rules). Printing the Daily Brief shows the giant blue Plus button on every page.
- **Where visible:** Print preview of Daily Brief on mobile.
- **Fix:** Add `print:hidden` to `FloatingActions.tsx:91` outer div. Same for the toast viewport (already done at `toast.tsx:90`).

## P2 — Daily Brief printout includes "Reopen" / "Sign Off" buttons that don't make sense on paper

- **File:** `src/components/reports/DailySiteBrief.tsx` — all `JobActionStrip` instances
- **What's wrong:** Print stylesheet (globals.css:230-235) forces collapsibles open and hides shadows, but doesn't hide action-strip buttons. A printed Daily Brief will show "Start", "Complete", "Extend" etc. as static text-only chips — confusing on paper.
- **Where visible:** Print preview of Daily Brief.
- **Fix:** Add `print:hidden` to `JobActionStrip.tsx` wrapper (file `src/components/reports/JobActionStrip.tsx`), or render a print-specific summary instead.

## P2 — `<Tooltip>` content in Sidebar collapsed-mode requires hover — mobile users can't access

- **File:** `src/components/layout/Sidebar.tsx:543-549`
- **What's wrong:** Collapsed sidebar uses `<Tooltip>` to show labels — only fires on `:hover`. Touch-only devices never see labels. Sidebar is `md:flex` so this only applies to small-laptop touchscreens, but still a class of users that won't see what icons do.
- **Where visible:** Collapsed sidebar on touch-laptops.
- **Fix:** Detect coarse pointer and force-expand; or set `aria-label` on each link so screen-readers + long-press hint covers it.

## P2 — `getCurrentDate()` polled per-render in many components; date string flicker on re-render

- **File:** `src/components/reports/DailySiteBrief.tsx:440`, others
- **What's wrong:** Not strictly UX but cascades to UX: rapid date changes between render and effect-fire can cause a flicker in the "Today" pill / today-date header when `devDate` cycles in DevModeToolbar. Cosmetic.
- **Where visible:** Switching dev date.
- **Fix:** Move date calculation into `useMemo` or component prop.

---

## Summary

**P0:** 11 — touch targets, dark mode, native controls, viewport handling, color-only signals
**P1:** 22 — visual inconsistency, design-system bypass, dark mode gaps, focus indicators, header/sidebar polish
**P2:** 20 — labels, print, decorative inconsistencies, animations
