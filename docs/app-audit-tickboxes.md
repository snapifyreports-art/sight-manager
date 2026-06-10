# App audit — tick-box sheet (Wave 1: your four bug classes)

> Tick the box you want and send this back. **Bold = my recommendation.**
> Everything marked ✅ FIXED below is already done and deploying — listed so you know it's handled, no tick needed.
> Wave 2 (area-by-area audits: brief, programme, handover, security, crons…) will extend this sheet.

---

## ✅ Already fixed this session (no ticks needed)

- Contractor Comms **View/Send Link HTTP 500** — every share/token link in production was crashing (`AUTH_SECRET` vs `NEXTAUTH_SECRET`). Fixed + verified live.
- **Documents delete button did nothing** at site level (confirm dialog never mounted). Fixed + verified live — dialog now appears.
- **"Snag + photos" from inspection sign-off** — the full SnagDialog (photos/location/assignee) now opens from pass/fail, auto-linked to the inspection.
- **On-Site-Today plot links 404'd** (`/plots/...` route doesn't exist) → now link into the site correctly.
- **27 action buttons had a broken style class** (`h-9gap-1`) shrinking their tap size on phones → fixed.
- **Events Log showed raw codes** (`INSPECTION_FAILED`, `ORDER_SENT`…) for 13 event types and couldn't filter to them → labelled + filterable.
- **Raw plot IDs written permanently into the Site Log** when a plot had no number (restart-decision + bulk-delay) → now use the plot name. *(Your "ids rather than names" — found in 18 places total, all the mechanical ones fixed: Story timeline `MATERIAL_LATE`, analytics top-reasons, handover PDFs ×13, order decision codes, dashboard/customer/brief/quote-board inspection types, programme tooltip, search subtitle, calendar feed statuses, weekly digest reason, per-plot handover PDF.)*
- **Document upload rejected 10–50MB files** with a wrong "10MB limit" message (server allows 50MB) → 50MB.
- **Notify-contractor + certificate-upload failed silently** on errors → now toast the reason; cert input got a file-type filter.
- **Sign-off photo picker** said "or choose from gallery" but forced the camera → gallery now allowed (that one input only — app-wide question below).
- **Create-site retry duplicated the site + successful plots** after a partial failure → now reuses the created site and retries only the failed batches.

---

## 🗳️ Decisions — tick one per item

### D1. Hold-point override during sign-off — what happens after you type the reason?
Right now the override completes the job but **drops your sign-off notes/photos**, and the still-open dialog errors silently on the second tap (I've fixed the silent-error half; this is about the flow).
- [ ] **Override confirm auto-continues the FULL chain — completes the job with your reason, then signs off with your notes + photos. One tap.**
- [ ] Return to the sign-off dialog with a "job completed — tap Sign Off to finish" notice (explicit two-step).

### D2. Photo pickers app-wide — camera-only or camera + gallery?
Every photo input forces the camera (`capture` attribute), so photos taken earlier or WhatsApp'd from a trade can't be attached anywhere.
- [ ] **Drop camera-forcing everywhere — OS chooser (camera is still one tap) on all photo inputs.**
- [ ] Drop it everywhere EXCEPT the Walkthrough quick-capture (stays camera-first).
- [ ] Keep camera-only.

### D3. Post-completion "Review next steps" prompt on the Daily Brief
It's a 10-second toast — miss it and the next-job/pull-forward prompt is gone (Plot detail auto-opens the same dialog instead — inconsistent).
- [ ] **Persistent "Review next steps" chip on the signed-off row until dismissed (keep the toast too).**
- [ ] Auto-open the dialog on the Brief, matching Plot detail.
- [ ] Keep the toast, raise it to ~20s.

### D4. One-off inspections (added from a plot) — full parity with template ones?
A manually-added inspection today can't hard-block its job, has no book-ahead reminder, no inspector, no notes — template ones have all four.
- [ ] **Yes — full parity (description, start/end edge, offset, book-ahead weeks, inspector, hard-blocker). Needs a small API addition.**
- [ ] Partial — notes/inspector/book-ahead only; hard-blocker stays template-only.
- [ ] Leave one-offs as simple reminders.

### D5. Inspection findings → NCRs: add Root cause + Corrective action fields?
NCRs raised from a failed inspection can never carry root cause / corrective action (the QA register prints blanks forever — there's no NCR edit screen). Also the severity picker shown for NCR findings is silently thrown away.
- [ ] **Yes — when a finding is NCR-kind, swap severity for optional Root cause + Corrective action boxes (the API already saves them).**
- [ ] No — leave the quick form; fill these in later once an NCR edit screen exists.

### D6. Manual "Raise NCR" dialog — add Plot / Job / Contractor pickers?
Manually-raised NCRs can't be tied to a plot/job/contractor (inspection-raised ones get all three automatically), so they show "—" in the register and never hit the contractor scorecard.
- [ ] **Yes — add the three optional pickers (API already accepts them).**
- [ ] No — manual NCRs stay site-level.

### D7. Notify-contractor (from an inspection) vs the full Toolbox-Talk request form
The Notify dialog is single-contractor, no attachments, and doesn't warn when the picked contractor has **no email** (it silently sends nothing).
- [ ] **Minimum now: flag "(no email)" contractors in the picker; extract the full TBT request form for reuse later.**
- [ ] Full job now: extract the shared TBT form (multi-contractor + attachments + email toggle) and use it here.
- [ ] Leave as-is.

### D8. "Book" an inspection — record the inspector's actual visit date?
Book is one click and assumes the visit happens on the scheduled date; if the inspector offers a different day there's no way to record it.
- [ ] **Book opens a one-field date popover pre-filled with the scheduled date (Enter = today's one-click).**
- [ ] Keep one-click Book; add an editable booked-date on BOOKED rows.
- [ ] Leave as-is.

### D9. Enum chips styling (the ALL-CAPS look)
Some chips are deliberately uppercase by CSS; the bug was feeding raw codes as the text (tooltips/PDFs/emails inherit it). Mechanical fixes are done — this is the convention going forward.
- [ ] **Feed Title-Case labels everywhere; keep the CAPS look purely via CSS on chips.**
- [ ] Switch every chip to Title Case text, drop the uppercase styling.
- [ ] Only fix non-chip surfaces.

### D10. Old Site-Log rows that already contain raw codes/IDs
Writers are fixed; existing rows keep e.g. "Plot cmb3x9…" forever.
- [ ] **Fix forward only — leave historical rows.**
- [ ] One-off migration to rewrite known patterns.
- [ ] Render-time cleanup of old rows.

### D11. Contractor "Open in Email App" with no email on file
The button opens a blank-recipient email; a hint shows below but the button stays clickable.
- [ ] **Disable the button when there's no email (matching every other mailto in the app).**
- [ ] Leave it — the hint is enough.

### D12. Dead code — delete?
`JobsClient.tsx` (unreachable page with a create-job form the API always rejects) and `InlinePhotoCapture.tsx` (zero importers, docs claim app-wide use).
- [ ] **Delete both now.**
- [ ] Delete JobsClient, keep InlinePhotoCapture and actually migrate photo captures onto it (bigger job).
- [ ] Keep both.

---

## 💡 Mini-suggestions — tick to build

| # | Suggestion | Effort | Tick |
|---|---|---|---|
| W1 | **Skip the "Select Plot" step** when raising a snag from a plot page (plot is already known — currently you confirm a pre-selected plot for nothing) | S | [ ] |
| W2 | **Closure checklist rows get "Fix →" links** to the tab where you'd fix each item ("3 open snags" → Snags tab) | S | [ ] |
| W3 | **Plot inspections panel rows deep-link** to the focused inspection (`?focus=`) instead of the bare global list | S | [ ] |
| W4 | **Disable "Confirm pass" until a certificate is picked** (today you find out via an error after filling everything in) | S | [ ] |
| W5 | **Cert picker: CERT-category documents listed first** | S | [ ] |
| W6 | **Walkthrough snag photos tagged "before"** automatically (evidence trail) + optional assignee/notes fields | S | [ ] |
| W7 | **DocumentUpload gains an optional category dropdown** (CERT/DRAWING/RAMS) — general uploads currently land uncategorised and clutter the cert picker + ZIP folders | S | [ ] |
| W8 | **Create-order job picker becomes searchable** (currently one flat list of every job across all sites) | M | [ ] |
| W9 | **Order create dialogs unified** — single-order dialog gets the structured items table the bulk wizard has (feeds cost tracking) | M | [ ] |
| W10 | **"Send from Sight Manager" button** for the contractor share link (today it's mailto-only, tracked only in your browser) | M | [ ] |
| W11 | **Route-existence test in CI** — mechanically catches links to pages that don't exist (how the 404 was found) | M | [ ] |
| W12 | **`humanizeEnum()` helper + CI grep** so raw-code leaks can't come back | S | [ ] |
| W13 | **Lateness reason labels consolidated into one shared module** (3 hand-maintained copies today; server code needs a 4th) — partially done in the fixes, tick to finish the client-side consolidation | S | [ ] |

---

## 🏗️ Wholesale changes (push-live document)

Wave 1 found none big enough to list — the area audits (Wave 2: daily brief, programme/cascade, handover, security, crons, templates…) feed this section.
