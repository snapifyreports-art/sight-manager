# Batch 2 Photo-Coupled Flows — Test Plan

**Purpose:** verify the six snag/photo flows still work correctly before migrating them to the unified `useSnagAction` + `InlinePhotoCapture` pattern. Each flow combines a status mutation with a photo upload — they were deferred from the Batch 2 unification agent because the combined behaviour needs eyes-on testing.

**Keith Apr 2026:** "wait and ill test it if you give me instructions later". This is the instructions.

---

## How to run each flow

You'll need:
- A test plot with at least one open snag that has a contractor assigned.
- A real image file (JPEG/PNG) on your phone or desktop — roughly 500KB – 5MB.
- A logged-in session on the live site (`https://sight-manager.vercel.app`).
- Open browser DevTools → Network tab so we can confirm the upload hit Supabase Storage and the status update hit `/api/snags/*`.

For each flow below: **run → observe → tick or flag.**

---

## 1. SnagDialog — close-with-photo

**Where:** any snag's "Close Snag" button triggers this. Easiest path: any plot detail page → Snags tab → pick an OPEN snag → click "Close / Sign Off".

**Steps:**
1. Open the snag via "Close / Sign Off" button.
2. Click "Add Photo" (or the camera icon).
3. Select your test image.
4. Add a note/resolution comment.
5. Hit "Close Snag" / "Resolve".

**Observe:**
- [ ] Image thumbnail appears in the dialog before close.
- [ ] After clicking close, network shows `POST /api/snags/:id/photos` succeeding (201).
- [ ] Network shows `PATCH /api/snags/:id` with `{ status: "RESOLVED" }` (or similar).
- [ ] Snag disappears from the open list / moves to resolved.
- [ ] Photo visible on the snag when you re-open the resolved snag.

**Red flags:**
- Silent upload failure (toast shown but photo missing).
- Status flipped but photo vanished — means atomicity broken.

---

## 2. DailyBrief — snag photo close

**Where:** `/daily-brief?site=…` → the Snags section → an open snag with a "Close" action.

**Steps:** same as Flow 1 but triggered from Daily Brief instead of plot detail.

**Observe:**
- [ ] Dialog opens correctly from this surface.
- [ ] Same upload + status flow as Flow 1.
- [ ] Daily Brief refreshes and the snag disappears from the list.

---

## 3. SnagList — `handleConfirmClose`

**Where:** `/sites/:id?tab=snags` → select one or more snags → bulk "Close" action.

**Steps:**
1. Tick 2–3 open snags.
2. Click the bulk "Close" button that appears.
3. Confirm dialog — should allow adding a photo against each OR a single photo across all.
4. Submit.

**Observe:**
- [ ] Each snag status updates to RESOLVED / CLOSED.
- [ ] If photos allowed per-snag: each upload POSTs separately.
- [ ] If single photo across all: one POST, photo attached to each snag.
- [ ] List refreshes with correct counts.

**Known quirk:** bulk mode's photo UX was never finalised. Keith may want this simpler — either "one photo for all" or "no photos in bulk, individual only".

---

## 4. ContractorComms — snag close

**Where:** Contractor Comms tab → any contractor with open snags → click a snag in the "Snags Assigned" section → close it.

**Steps:** same as Flow 1 but from the contractor card view.

**Observe:**
- [ ] SnagDialog opens from inside the Contractor Comms section.
- [ ] Photo + status flow identical to Flow 1.
- [ ] After close, the snag count on the contractor card decrements.
- [ ] Contractor card refreshes without a full page reload.

---

## 5. Walkthrough — snag close

**Where:** `/sites/:id/walkthrough` → tap "All Snags" button on a plot with open snags → pick one → close it.

**Steps:** same as Flow 1 but from the walkthrough UX.

**Observe:**
- [ ] BottomSheet-style modal opens correctly on mobile width (< 640px).
- [ ] Photo capture uses the device camera when available.
- [ ] Status + photo both submit on save.
- [ ] Walkthrough panel reflects the close (snag count on the plot header).

---

## 6. SnagSignOffCard — contractor share-page close

**Where:** open a contractor share link (`/contractor/:token`) → scroll to Open Snags → pick one → "Sign Off" or "Confirm Resolved".

**Steps:**
1. Share page is **read-only except for snag sign-off**. This is the contractor's one write path.
2. Click the snag → should open the sign-off dialog.
3. Attach a photo showing the fix.
4. Submit.

**Observe:**
- [ ] Snag status goes RESOLVED.
- [ ] Photo appears on the snag when you (as site manager) re-open it.
- [ ] The share page itself updates (snag moves out of Open).
- [ ] No login prompt during the whole flow — token-auth must hold.

**Red flag:** share page previously had issues where the snag sign-off needed a session. If you get a login prompt on this flow, flag it — means token-scoped write permission is broken.

---

## When you're done

For any flow that shows a red flag or behaves oddly:
- Screenshot the console output (Network tab + Console tab) and paste into the chat.
- Describe the symptom in plain English — e.g. "close button went grey but snag didn't update".

For any flow that passes cleanly:
- Just tick ✅ in the list above. Claude can then migrate the flow to the unified hooks with confidence.

---

**Migration target (for the next Claude session):**
- All 6 flows should eventually use `useSnagAction` for status + `InlinePhotoCapture` for the upload, wired together via a combined dialog or via the canonical `SnagDialog` (close-with-photo preset).
- The atomicity contract: status change AND photo upload must both succeed, OR neither.
- The flows above are the regression suite for that migration — run them before and after.
