# Onboarding + External Users Audit — May 2026

Focused walk through three personas: a brand-new user logging in for the
first time, a contractor on a token portal, and a buyer on a customer
progress page. The site-manager daily flow, internal SSOT/bug-tester
concerns, director reports and general authenticated UI polish are
explicitly out of scope.

Findings cover login/signup, password reset, contractor portal
`/contractor/[token]`, customer page `/progress/[token]`, the QR plot
redirect `/q/[plotId]`, the share page `/share/[token]`, customer push
notifications, the iCalendar feed, and the email layer (Resend +
templates). 35 findings total: 12 P0, 14 P1, 9 P2.

---

## P0 — No viewport meta tag, breaks mobile rendering for every external page
- **File:** `src/app/layout.tsx:11` (the `metadata` export has no `viewport` field, and no `export const viewport = ...`)
- **Persona:** contractor, customer, new user
- **What's wrong:** Next 16 does NOT auto-inject `<meta name="viewport" content="width=device-width, initial-scale=1">` — you have to add it. Without it, mobile Safari and Android Chrome render the page at a desktop ~980px viewport and shrink-to-fit. The contractor portal (`max-w-2xl`), customer page (`max-w-2xl`), login page (`max-w-[400px]`), forgot-password page (`max-w-md`) and reset-password page all visually centre fine on desktop but ship to phones as a tiny shrunk-down page where tap targets are 6-8px and text is unreadable. This is the single biggest blocker for any mobile external user.
- **Fix:** Add `export const viewport: Viewport = { width: "device-width", initialScale: 1 };` to `src/app/layout.tsx` (or merge into the `metadata` object — Next 16's recommended split is to put viewport in its own export).

## P0 — New user gets no welcome / invite email after admin creates their account
- **File:** `src/app/api/users/route.ts:39` (the POST handler that creates a user)
- **Persona:** new user (Day 1)
- **What's wrong:** Admin fills in name/email/password/role and POSTs. A `User` row is created with the admin-typed plaintext password hashed. **No email is sent.** The new user only finds out by being told the password verbally / via WhatsApp. The handover memo claims a "magic invite" path exists, and `share-token.ts:93` comments mention "admin-triggered Resend invite" — but the UI and the POST handler don't trigger it. A `request-reset` POST mints + emails a token (24-hour exp), but it's gated by the user already existing AND clicking the public Forgot Password page.
- **Fix:** After `prisma.user.create`, mint a reset token via `signResetToken` and send an email with subject "Welcome to Sight Manager — set your password". Optionally accept a `sendInvite: true` flag in the POST body so admins can choose between "I'll tell them the password verbally" and "send the magic-link email". Drop the requirement for the admin to type a password; generate a random throwaway hash if no password supplied.

## P0 — No "Resend invite" or "Send password reset" action wired up in the Users UI
- **File:** `src/components/users/UsersClient.tsx` (no grep matches for `resend`, `invite`, `reset`)
- **Persona:** new user (Day 1) — when an admin tries to help them
- **What's wrong:** The `/api/auth/request-reset` endpoint at line 16 doubles as an admin-triggered "resend invite" per its docstring. But the Users management page has no button for the admin to fire it. The only way for a stuck new user to get a reset link is for THEM to navigate to the public `/forgot-password` page and type their email — which is hard if they don't even know they have an account yet.
- **Fix:** Add a "Send password reset / invite link" row action in `UsersClient.tsx` next to each user. Either reuse `POST /api/auth/request-reset` with the target user's email, or add a `POST /api/users/[id]/send-invite` endpoint that only requires `MANAGE_USERS`.

## P0 — Brand-new dashboard with zero sites shows numbers/charts but no "do this first" guidance
- **File:** `src/components/dashboard/DashboardClient.tsx:755` (the `DashboardClient` component renders unconditionally regardless of `data.stats.totalSites === 0`)
- **Persona:** new user (Day 1)
- **What's wrong:** A first-time user lands on `/dashboard` and sees an array of `0` stat cards, an empty traffic-light grid, an empty pie chart that says "No job data available", and no orientation about what to do next. The Sites page (`SitesClient.tsx:203`) has a beautiful "No sites yet — Create Site" empty state, but the dashboard never points the user there. The natural first action ("Create your first site") is two clicks away on a page they have no reason to click into.
- **Fix:** In `DashboardPage` (or `DashboardClient`) detect `totalSites === 0` and render a dedicated welcome card: "Welcome to Sight Manager — let's get started. Step 1: Create a site. Step 2: Add plots. Step 3: Apply a template." with a primary CTA button linking to `/sites?new=1` (or open the CreateSiteWizard inline). Hide the stat/chart widgets entirely while empty — they're just noise.

## P0 — Public progress page silently fails for buyers when VAPID env vars are unset
- **File:** `src/app/progress/[token]/CustomerNotifyToggle.tsx:78`
- **Persona:** customer
- **What's wrong:** If `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is missing in production env the toggle's `subscribe()` returns silently with no error — the button stays in "prompt" state and the buyer can tap it forever. They'll think notifications are broken. Worse, `lib/push.ts:8` uses non-null assertions on `VAPID_SUBJECT`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, and `VAPID_PRIVATE_KEY` — so the moment any push fan-out tries to fire and a var is missing, the call throws. The buyer-facing route would then 500 instead of degrading.
- **Fix:** Guard `configureWebPush()` against missing env. If `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is empty, `CustomerNotifyToggle` should hide itself (return null from the component instead of rendering a tap-target that does nothing).

## P0 — Contractor portal shows the full `snag.notes` field including timestamped internal admin notes
- **File:** `src/app/contractor/[token]/SnagSignOffCard.tsx:95-99` reads `snag.notes` directly; the page query at `src/app/contractor/[token]/page.tsx:90` selects `notes: true`
- **Persona:** contractor
- **What's wrong:** `Snag.notes` is a single TEXT column. Multiple write paths append to it: re-inspection reminders (`api/snags/[id]/route.ts:133`), admin sign-off responses, and the contractor's own sign-off via `api/contractor-share/[token]/snag-action/route.ts:124`. Internal admin notes ("Bob always disputes these — push back hard", "third time this contractor's missed it") end up in the same field that's rendered verbatim to the contractor when they expand a snag card.
- **Fix:** Either (a) split `Snag.notes` into `internalNotes` + `publicNotes` (schema change), or (b) restrict the contractor-share `notes` rendering to only show entries that match the `[dd/mm/yyyy] Contractor notes (via share link):` prefix. Option (a) is cleaner. In the meantime, omit `notes` from the contractor page's snag select.

## P0 — Customer page leaks data if `Plot.shareEnabled = true` but the plot has no jobs yet
- **File:** `src/app/progress/[token]/page.tsx:276` (empty state condition uses `completed === 0 && !inProgress`)
- **Persona:** customer
- **What's wrong:** A buyer who scans the QR before plots have been templated lands on a page that says "Your home" / "0 of 0 stages complete" / "Currently: ..." (undefined) and may show photos if any non-job photos got `sharedWithCustomer = true` (e.g. one site-wide hero image on a job that was later deleted but with cascade-set-null). Not strictly a security leak but a confusing first impression for "I just bought a house, what's going on".
- **Fix:** Treat `plot.jobs.length === 0` as "build hasn't started" and render only the existing "Your build hasn't started yet" empty state; ignore the photos block in that case so an orphan photo doesn't appear without context.

## P0 — Contractor portal `notFound()` for missing contact/site swallows the real error
- **File:** `src/app/contractor/[token]/page.tsx:61`
- **Persona:** contractor
- **What's wrong:** If the contractor's `Contact` row is deleted (or the `Site` is hard-deleted) the token is still valid signature-wise, but the page returns `notFound()` which surfaces Next's generic 404 ("404 — Page not found"). The contractor has no idea their access was revoked / they need to contact the site manager. Compare to `share/[token]/page.tsx:30` which renders a friendly "Link Expired or Invalid" card.
- **Fix:** Replace the `notFound()` calls at lines 46 and 61 with a friendly rendered card matching the `share/[token]` pattern — "This link is no longer active. Please contact the site team." (no token/contact details echoed back).

## P0 — Contractor portal silently 401s when token is expired with no UI message
- **File:** `src/app/contractor/[token]/page.tsx:45-46`
- **Persona:** contractor
- **What's wrong:** `verifyContractorToken` returns null for expired tokens (the May 2026 fix at `share-token.ts:65` now correctly enforces `Date.now() > payload.exp`). But the page calls `notFound()`, which serves a generic 404. The contractor sees "Page not found" with no hint that the link expired. They likely think the site manager mistyped the URL.
- **Fix:** Distinguish "invalid signature" from "expired" by inspecting the token (or the payload after a permissive decode), and render specific copy: "This link has expired — ask the site team to send a fresh one."

## P0 — Calendar token URL relies on Origin header that's often stripped in production
- **File:** `src/app/api/sites/[id]/calendar-token/route.ts:48`
- **Persona:** site manager subscribing on a calendar app (still touches external workflow)
- **What's wrong:** The URL is built from `req.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "https://sight-manager.vercel.app"`. In production, `Origin` is set only for CORS requests — same-origin POST from the in-app SubscribeButton (fetch with credentials: same-origin) sends `Origin` but Vercel's edge can strip it for `/api/*` routes depending on config. If `NEXTAUTH_URL` is also unset (it commonly is on Vercel for projects using `VERCEL_URL`), the fallback is a hardcoded vercel.app URL — fine for the canonical deploy but breaks for any preview/branch URL or white-label.
- **Fix:** Prefer `req.headers.get("host")` + protocol detection (`x-forwarded-proto`), and fall back to `process.env.VERCEL_URL` before the hardcoded string.

## P0 — Resend default sender means production password reset / invite emails get sent from `onboarding@resend.dev`
- **File:** `src/lib/email.ts:14`
- **Persona:** new user, contractor (when getting their share link), customer (when emailed a progress link)
- **What's wrong:** `FROM_ADDRESS = process.env.EMAIL_FROM || "Sight Manager <onboarding@resend.dev>"`. If `EMAIL_FROM` isn't set in Vercel, every email goes from the Resend default sandbox address. Gmail / Outlook spam filters will trash these. The user clicks "Forgot password", waits, never receives the email, and assumes the system is broken.
- **Fix:** Either throw at startup if `EMAIL_FROM` is unset in production, or make `request-reset` return a 503 with "Email is not configured" message. Add the env var to the Vercel project README so deployment doesn't silently regress.

## P0 — Customer push subscriber endpoint has no rate limit or origin check
- **File:** `src/app/api/progress/[token]/push-subscribe/route.ts:17`
- **Persona:** customer
- **What's wrong:** Any caller with a valid `Plot.shareToken` can POST unlimited push subscriptions. The token is on the URL which is shareable; if a token leaks (e.g. a buyer forwards their progress link to friends and someone scrapes it), an attacker can register arbitrary push endpoints. Each endpoint becomes a permanent row in `CustomerPushSubscription`, and the next time `sendPushToPlotCustomers` fires, Resend/web-push will send to all of them. There's also no upper limit on the rows per plot, so a malicious browser script could enqueue thousands.
- **Fix:** Cap to (say) 5 subscriptions per plotId. Verify the `endpoint` URL host is a known push provider (`fcm.googleapis.com`, `*.push.apple.com`, `*.notify.windows.com`, `updates.push.services.mozilla.com`). Reject anything else.

---

## P1 — Forgot-password "check your inbox" message displays unconditionally on network failure
- **File:** `src/app/forgot-password/page.tsx:30-38`
- **Persona:** new user
- **What's wrong:** The `try { fetch(...) } catch { /* ignore */ } finally { setSubmitted(true); }` block sets `submitted = true` regardless of whether the request actually reached the server. A user on flaky wifi sees "Check your inbox" but no email is ever queued. Worse — the comment claims "The endpoint always succeeds from the client's perspective" but a literal `fetch` rejection (offline, DNS failure, CORS) skips the success path entirely. The intent (don't leak account enumeration) is correct, but it shouldn't lie about success on actual network failure.
- **Fix:** In the `catch`, surface a transient "Couldn't reach the server, try again." inline message instead of jumping to the success state.

## P1 — Login page has no link to forgot password from the password field's "wrong password" error
- **File:** `src/app/login/page.tsx:32` (the `setError("Invalid email or password. Please try again.")` toast)
- **Persona:** new user / existing user who forgot their password
- **What's wrong:** When credentials are wrong, the error toast doesn't offer "Forgot password?" inline — the user has to scroll down to find the small link below the Sign-in button. Most users don't read below a button; they re-type, re-type, then give up.
- **Fix:** When error fires, surface the Forgot Password link inside the error banner with explicit copy ("Forgot password? Reset it here.").

## P1 — Contractor portal renders nothing meaningful for contractors with zero jobs and zero snags
- **File:** `src/app/contractor/[token]/page.tsx:281-643`
- **Persona:** contractor
- **What's wrong:** If the token is valid but `jobs` is empty and `openSnags` is empty (contractor was added to the contact list but not yet assigned anything), the page header renders fine but the body is mostly empty. The "Active Jobs" details block shows "No active jobs right now" but that's buried inside a collapsed `<details>`. There's no top-level "You haven't been assigned any work yet" empty state. The contractor concludes the link is broken and texts the manager.
- **Fix:** When `liveJobs.length + nextJobs.length + completedJobs.length + openSnags.length === 0`, render a dedicated centered empty state: "You haven't been assigned to anything on this site yet. We'll text you again once there's work scheduled."

## P1 — Contractor portal expiresAt is computed but never displayed
- **File:** `src/app/contractor/[token]/page.tsx:244`
- **Persona:** contractor
- **What's wrong:** The page computes `const expiresAt = new Date(payload.exp)` but never renders it. The footer at line 639 says "always up to date" but the contractor has no idea when their access expires. Compare to `share/[token]/page.tsx:180` which shows `Expires {fmt(new Date(payload.exp))}`. The May 2026 audit-fix #10 now enforces the exp claim — so a contractor with a 90-day token will suddenly find the link dead one morning.
- **Fix:** Add an "Expires dd MMM yyyy" line to the page footer.

## P1 — `/q/[plotId]` redirect doesn't handle missing plot row
- **File:** `src/app/q/[plotId]/page.tsx:36`
- **Persona:** customer
- **What's wrong:** `prisma.plot.findUnique` returns null for a plot that never existed (or was deleted). The page falls through to the "QR isn't linked yet" message — which is fine. But a buyer with an old QR printed before the plot was renamed/cascaded would see the same generic friendly message even though there's a real underlying issue (the plot id is unknown). No distinction between "valid plot, share disabled" and "no such plot".
- **Fix:** When `plot === null`, render a slightly different message: "This QR code points to a home that's no longer in our system. Please contact the site office."

## P1 — Customer "subscribe to push" toggle gives no feedback if user rejects browser permission
- **File:** `src/app/progress/[token]/CustomerNotifyToggle.tsx:73-76`
- **Persona:** customer
- **What's wrong:** When `Notification.requestPermission()` returns `"denied"`, the toggle goes back to `"prompt"` state silently. Re-tapping does nothing (the browser remembers the denial). The buyer concludes the button is broken.
- **Fix:** On denial, set state to `"denied"` and either hide the toggle or replace it with a small explainer: "Notifications blocked — re-enable in your browser settings to get updates."

## P1 — Customer page shows "Currently: <stage name>" using stage code that's not buyer-friendly
- **File:** `src/app/progress/[token]/page.tsx:189-194` (the `Currently: {inProgress.name}` line)
- **Persona:** customer
- **What's wrong:** `inProgress.name` comes from `Job.name` which is whatever the manager typed when applying the template. Common values from the simulation: "1F-INTERNAL" (first-fix internal), "SF-EXTERNAL", "P&D" (paint & decorate). These are jargon-cryptic to a buyer. The customer page tries hard to be friendly elsewhere ("a few days ago", "last week") but this single line leaks builder-speak.
- **Fix:** Map common stage codes/prefixes to friendly labels client-side ("First Fix" instead of "1F-INTERNAL", "Decorating" instead of "P&D"). Long-term: a `Job.customerFriendlyName` column on the template.

## P1 — Contractor photo upload posts to admin's user record, can mask the contractor's identity
- **File:** `src/app/api/contractor-share/[token]/photo/route.ts:113-117`
- **Persona:** contractor
- **What's wrong:** `JobPhoto.uploadedById` is non-nullable. Photos uploaded via the contractor portal are written with `uploadedById = site.createdById` (a fallback the code uses for token-auth writes). The caption is auto-prefixed with "Uploaded by {contractorLabel} (via share link)" which IS visible. But in the Photos tab queries that group by uploader, these photos collapse into the site creator's bucket — distorting "who uploaded what". A schema-level `uploadedByContactId` (nullable, fk to Contact) would be cleaner.
- **Fix:** Add `uploadedByContactId: String?` to `JobPhoto`, populate from the token's contactId, and prefer that field in the Photos tab "uploaded by" display.

## P1 — Contractor photos default to `sharedWithCustomer = false`, but there's no admin curation prompt
- **File:** `src/app/api/contractor-share/[token]/photo/route.ts:109-118`
- **Persona:** contractor (workflow into customer)
- **What's wrong:** Contractor uploads, photo lands with default `sharedWithCustomer = false`. Good for safety. But the admin has no notification that a contractor uploaded photos — so they may not realise to go curate them for the customer page. EventLog gets a PHOTO_UPLOADED row but no targeted push to the site manager.
- **Fix:** Fire a `sendPushToSiteAudience` push when contractor photos arrive ("Contractor X uploaded N photos — curate for buyer?") linking directly to the plot's Photos tab.

## P1 — Snag sign-off doesn't notify the buyer when a snag affecting their plot is resolved
- **File:** `src/app/api/contractor-share/[token]/snag-action/route.ts:140-146`
- **Persona:** customer (indirectly)
- **What's wrong:** Snag-resolution pings admin but not the customer who owns the plot. Buyers tend to be anxious — knowing the issue raised yesterday is being fixed today builds confidence. The customer page intentionally hides snags themselves (good privacy decision) but a generic "We've just completed a fix at your home" update via journal entry would help.
- **Fix:** When snag flips IN_PROGRESS (contractor declares fixed), append a low-key journal entry to the plot ("A small piece of work was completed today by the contractor"). Or just rely on the next admin curation step. The point is: don't go silent on the customer.

## P1 — Reset-password page does no client-side token shape validation
- **File:** `src/app/reset-password/[token]/page.tsx:29` (uses the token blind)
- **Persona:** new user / forgot-password user
- **What's wrong:** A user with a mangled URL (email line-wrap chopped the token) clicks the link, types a password, submits, and only THEN sees "This link is invalid or has expired". A trivial length check on the token would surface a friendlier error pre-submit.
- **Fix:** Before rendering the form, check the token has the shape `data.signature` (a dot, both halves non-empty, at least 40 chars total). If not, render the same error card the API would return.

## P1 — iCalendar `Mail` icon is misleading for a calendar-subscribe action
- **File:** `src/components/reports/SiteCalendar.tsx:792`
- **Persona:** new user discovering features (still part of "what can I do?")
- **What's wrong:** The Subscribe button uses a `Mail` icon. A user scanning the page sees a Mail icon and assumes "Email this calendar" — not "Add to my calendar app". The button label says "Subscribe" but that's ambiguous (subscribe to what?).
- **Fix:** Use `Calendar` or `CalendarPlus` from lucide-react. Label: "Add to calendar".

## P1 — Customer "Send a question" flow proposed in audit-may-2026.md is not implemented
- **File:** N/A — `src/app/progress/[token]/page.tsx` has no message-back form
- **Persona:** customer
- **What's wrong:** Audit §3.7 / quick-win §6.5 calls this out: customer page is read-only. Buyers calling the office because they have a simple "is the kitchen finalised yet?" question is friction the team explicitly identified months ago, still unaddressed.
- **Fix:** Add a small `<textarea>` with a "Send a question" button below the photo gallery. POST to `/api/progress/[token]/question` which creates a `PlotJournalEntry` with a `source=CUSTOMER` flag (schema column to add) and fires `sendPushToSiteAudience` to the site manager.

## P1 — Login error tone is too generic for the "your account hasn't been activated yet" case
- **File:** `src/lib/auth.ts:18-30` (the `authorize` block returns `null` for any failure)
- **Persona:** new user
- **What's wrong:** Returning `null` for "no such user", "wrong password", and "user exists but hasn't set a password yet" all collapse to the same "Invalid email or password" error on the client. A user whose admin created their account but never sent an invite gets stuck — they "know" their email is right but the system insists it isn't.
- **Fix:** Add an "invite pending" state to the User model (or just an `passwordSetAt: DateTime?` column). When `authorize` finds a user with no real password set, return a specific error code and surface "Your account is set up but the password hasn't been set yet — check your inbox for an invite, or use Forgot Password to set one."

## P1 — Magic invite path advertised in handover/memos doesn't exist as a separate UI
- **File:** `MEMORY.md` claims "Forgot password / magic invite" exists; the user-creation flow (above) confirms it doesn't
- **Persona:** new user
- **What's wrong:** Documentation drift. The audit handover repeatedly references a "magic invite" flow that, in practice, is just `request-reset` re-purposed. A real admin-triggered invite would set a flag on the User (`isInvited`) and tailor the email subject ("You've been invited to Sight Manager" vs "Reset your Sight Manager password"). Right now an admin creating a new user can't easily send them a "welcome to the team, click here to get started" email.
- **Fix:** Either implement a real invite endpoint with welcome-tailored copy + EventLog row of type `USER_INVITED`, or update the memory/docs to stop claiming it.

---

## P2 — Login page doesn't surface "Caps Lock is on" when password fails
- **File:** `src/app/login/page.tsx:104-115`
- **Persona:** new user
- **What's wrong:** Standard polish — many sites detect caps-lock on the password field and warn. New users typing a password they were verbally given are likely to hit this.
- **Fix:** Listen for `getModifierState("CapsLock")` on the password input and render an inline hint.

## P2 — Contractor portal has no contact-back path for "I think this is wrong"
- **File:** `src/app/contractor/[token]/page.tsx` (whole file)
- **Persona:** contractor
- **What's wrong:** Contractor sees a job assigned that they think shouldn't be theirs. They have phone/email links to themselves in the header (their own contact details) — but the page doesn't expose the site manager's contact details. They have to ring whoever sent them the link.
- **Fix:** Render the site manager's name + phone/email in the contractor page header (from `Site.assignedTo`).

## P2 — Customer page doesn't show site location at all
- **File:** `src/app/progress/[token]/page.tsx:80` (the select excludes `site.location`)
- **Persona:** customer
- **What's wrong:** The progress page select intentionally narrows. But location is a benign "what village/town is my house in" — the same buyer who scanned the QR at the site knows where it is. Worth surfacing as a sub-line under the site name.
- **Fix:** Add `location: true` to the site select and render under the "at {plot.site.name}" line if present.

## P2 — Customer page favicon and tab title are the generic dashboard ones
- **File:** `src/app/layout.tsx:11-13` (the root metadata) — `/progress/[token]/page.tsx` doesn't override
- **Persona:** customer
- **What's wrong:** Buyer bookmarks their progress page. The tab title is "Sight Manager" with the generic favicon. Personal context lost.
- **Fix:** Set per-page metadata in `progress/[token]/page.tsx` — `Your home — {site.name}` as the title. Same for `contractor/[token]/page.tsx` ("Your jobs — {site.name}").

## P2 — Customer toggle is centred under the H1 but isolated; looks like a forgotten button
- **File:** `src/app/progress/[token]/page.tsx:176`
- **Persona:** customer
- **What's wrong:** The `<CustomerNotifyToggle>` sits centred under the "last update" line. Visually it floats in space — no card, no header copy explaining what it is. Buyers see a pill button and don't know whether to tap.
- **Fix:** Wrap in a small framed card with copy: "Want updates? We'll let you know when there's news on your home."

## P2 — Contractor portal "Day Sheets (this week)" only renders if any job spans the current week
- **File:** `src/app/contractor/[token]/page.tsx:322-379` (the `hasAnything` check)
- **Persona:** contractor
- **What's wrong:** A contractor visiting on a Sunday with no work this week, plenty next week, sees no Day Sheets at all. They have to scroll into "Upcoming Work" to see what's coming. A "no work this week — here's next week" fallback would be clearer.
- **Fix:** If `hasAnything` is false but `nextJobs.length > 0`, render a single-row card: "No work this week. Next job starts dd MMM."

## P2 — Reset-password page shows hidden confirm-password using same visibility toggle
- **File:** `src/app/reset-password/[token]/page.tsx:144`
- **Persona:** new user / forgot-password user
- **What's wrong:** The single `showPassword` state toggles BOTH password fields. A user clicks "show" on the first to verify they typed it right, and the confirm field is now also visible — defeating the point of a confirm field.
- **Fix:** Either keep them independent or omit the eye toggle on the confirm field entirely.

## P2 — Contractor portal print stylesheet doesn't hide collapsible chevron icons
- **File:** `src/app/contractor/[token]/page.tsx:286-440` (all the `<details>` summaries with `svg` chevrons)
- **Persona:** contractor (printing for site office)
- **What's wrong:** Print button uses `window.print()`. When printed (or saved as PDF), chevrons appear next to every section header — ugly. Print CSS doesn't hide them.
- **Fix:** Add `print:hidden` to the chevron `<svg>` elements, or wrap them in a `<span className="print:hidden">`.

## P2 — Customer page progress ring colours don't reflect "on track" vs "slipping"
- **File:** `src/app/progress/[token]/page.tsx:215-225`
- **Persona:** customer
- **What's wrong:** Ring is always blue. Doesn't communicate "your build is on schedule" vs "slightly delayed" (something the customer-friendly tone could hint at without dates). A subtle colour shift would build confidence when things are going well.
- **Fix:** Compute an SSOT `onTrackness` on the server (no dates leaked) — bucket as `ahead | on_track | slight_delay`, colour the ring accordingly without ever rendering a percentage or date.
