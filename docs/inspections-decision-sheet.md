# Inspections — Decision Sheet

> Every remaining audit item turned into **a question with my recommended answer**.
> Read the recommendation, change the ones you disagree with, then tell me the
> numbers you want me to build. Nothing here is broken — these are *your calls*.
>
> Format: **✅ = I'd do it now (pre-launch)** · **🕒 = good, but after Friday** · **❌ = skip / not worth it**
> Effort: **S** ≈ minutes · **M** ≈ an hour-ish · **L** ≈ half-day+

---

## ⭐ If you only read one section — my "ship-it-Friday" shortlist

The 7 I'd insist on before it goes to the real site manager. Everything else can wait:

| # | What | Why it matters for week-1 |
|---|---|---|
| Q1 | Style "overdue **but booked**" differently (amber, not red) | Stops false alarms — a booked inspection isn't really overdue, and crying wolf trains the manager to ignore the alerts |
| Q8 | Story + Closure rollup respects `VIEW_INSPECTIONS` | Permission consistency — you already gated the Brief + API; these two leak counts otherwise |
| Q17 | Overdue inspections feed the global **"At Risk"** panel | Overdue statutory holds are *exactly* what At-Risk is for — first place he'll look |
| Q15 | Upcoming hold-points on the **contractor share** page | This is the entire point of the Contractor-Comms decision — the trade has to know a hold is coming |
| S1 | **Plot-card chip** ("2 holds open") | The plot card is his home screen; inspections are invisible there right now |
| S11 | Deep-link alerts/chips to the **specific** inspection | Today every link dumps him on `/inspections` to hunt — kills the daily flow |
| S16 | **Warn when "apply template" skips** an inspection whose anchor has no date | Silent data loss at apply is the one thing that'll quietly bite him |

Say **"do the shortlist"** and I'll build exactly those.

---

## 🤔 Open questions (your calls)

### Alerts
| # | Question | My recommended answer | Pick | Effort |
|---|---|---|---|---|
| Q1 | Show "overdue **but booked**" differently from "overdue, nothing booked"? | **✅ Yes.** Amber "Booked (was overdue)" vs red "Overdue". Booked ≠ urgent. | | S |
| Q2 | Also push inspection counts into the **weekly** digest (not just daily)? | **✅ Yes.** One line "N due / M overdue" — the digest already exists. | | S |
| Q3 | Should the daily overdue push **escalate then stop** instead of nagging forever? | **✅ Yes.** Nag days 1–3, then drop to a single weekly reminder. Forever-nagging gets muted. | | M |
| Q4 | Per-site **mute** for inspection alerts? | **🕒 Later.** Only matters across many sites; one site this week doesn't need it. | | M |

### Handover
| # | Question | My recommended answer | Pick | Effort |
|---|---|---|---|---|
| Q5 | Turn `inspection-log.txt` into a **branded PDF** like the other logs? | **✅ Yes.** It's a customer-facing deliverable; a raw .txt looks unfinished next to the rest. | | M |
| Q6 | **Hard-block** the handover ZIP if a passed cert is missing from the plot folder? | **✅ Yes — but warn, don't block.** List the missing certs loudly; let him proceed. Hard-block could trap him. | | M |

### Permissions
| # | Question | My recommended answer | Pick | Effort |
|---|---|---|---|---|
| Q7 | Gate template-inspection editing on `EDIT_PROGRAMME` (now) or `MANAGE_INSPECTIONS`? | **✅ `MANAGE_INSPECTIONS`.** It's an inspections concern — keep the model consistent. | | S |
| Q8 | Should the Story/Closure rollup respect `VIEW_INSPECTIONS`? | **✅ Yes.** Brief + API already do; these two should match. *(shortlist)* | | S |

### The /inspections list
| # | Question | My recommended answer | Pick | Effort |
|---|---|---|---|---|
| Q9 | Add **site / type filters + search** (like Snags)? | **✅ Yes.** Essential past ~20 rows; copy the Snags pattern. | | M |
| Q10 | Switch the status pills to the shared **`StatusBadge`** component? | **✅ Yes.** Consistency, cheap. | | S |

### Findings (snags/NCRs raised from a fail)
| # | Question | My recommended answer | Pick | Effort |
|---|---|---|---|---|
| Q11 | **Force** a contractor per finding (vs defaulting to the anchor job's)? | **❌ No.** Default to the anchor's contractor, allow override. Logging a fail is the busy moment — don't add a required field. | | S |
| Q12 | Should **re-inspecting** a FAIL **supersede** the snags/NCRs it raised? | **✅ Yes — but only on PASS.** When the re-inspection passes, auto-resolve the linked snags/NCRs. Merely re-inspecting shouldn't wipe them. | | M |

### Story narrative
| # | Question | My recommended answer | Pick | Effort |
|---|---|---|---|---|
| Q13 | Add an inspection **milestone** to the story ("All NHBC holds cleared")? | **✅ Yes.** Strong signal for the director/customer view. | | M |
| Q14 | Put inspection **passes on the quote board**? | **🕒 Later.** Nice flourish, not launch-critical. | | S |

### External visibility
| # | Question | My recommended answer | Pick | Effort |
|---|---|---|---|---|
| Q15 | Show **upcoming hold-points** on the **contractor share** page? | **✅ Yes.** This is the payoff of the Contractor-Comms decision. *(shortlist)* | | M |
| Q16 | A **passed-only** inspection milestone on the **customer** page? | **✅ Yes.** Customers love "Building Control: Passed". Passed-only keeps fails private. | | S |

### Dashboard
| # | Question | My recommended answer | Pick | Effort |
|---|---|---|---|---|
| Q17 | Add overdue inspections to the global **"At Risk"** panel? | **✅ Yes.** Overdue statutory holds are textbook At-Risk. *(shortlist)* | | S |

### Template authoring edge-cases
| # | Question | My recommended answer | Pick | Effort |
|---|---|---|---|---|
| Q18 | When you **edit a template inspection**, do already-applied plots pick it up or **stay frozen**? | **✅ Stay frozen.** Matches how template *job* edits behave — a live plot is a snapshot. Add a manual "re-seed" later if you ever need it. | | — |
| Q19 | **Warn** when an offset pushes an inspection date **outside its stage window**? | **✅ Yes.** Cheap guard against nonsensical dates. | | S |
| Q20 | Where do markers go on a **collapsed** stage? | **✅ Roll them up** onto the collapsed parent bar so they're not lost. | | S |
| Q21 | **Per-type marker colour** on the template preview? | **✅ Yes.** You already colour by status elsewhere; helps scanning. | | S |

---

## 💡 Mini-suggestions (my yes/later/skip on each)

### Surfaces
| # | Suggestion | Me | Effort |
|---|---|---|---|
| S1 | **Plot-card inspection chip** ("2 holds open") | **✅ Now** *(shortlist)* | S |
| S2 | LiveCabin TV tile | **🕒 Later** (only if they use the wall display) | S |
| S3 | Cross-link the **Compliance tab** → inspections | **✅ Now** (cheap nav win) | S |
| S4 | Show inspections on **SiteCalendar + On-Site-Today** | **Calendar = ✅ already shipped this week.** On-Site-Today: **✅ Now** | S |
| S5 | "2 running" overlap badge on the programme | **🕒 Later** (stacking already shows overlap) | S |

### Closing the loop
| # | Suggestion | Me | Effort |
|---|---|---|---|
| S6 | **Reverse-link chip** "from inspection" on the snags/NCRs it raised | **✅ Now** (completes the loop you built) | S |
| S7 | Surface the `INSPECTION_*` **EventLog** somewhere human-readable | **🕒 Later** (audit-trail nicety) | M |

### /inspections polish
| # | Suggestion | Me | Effort |
|---|---|---|---|
| S8 | **Inspector picker** on the row | **✅ Now** (speeds booking) | S |
| S9 | Skeleton loader on refetch | **🕒 Later** | S |
| S10 | Type **colour badge + tooltip** (folds into Q10/Q21) | **✅ Now** | S |
| S11 | **Deep-link** chips/pushes to the *specific* inspection | **✅ Now** *(shortlist)* | M |

### Handover
| # | Suggestion | Me | Effort |
|---|---|---|---|
| S12 | "**X/Y passed**" line in the per-plot **PDF** (bundles with Q5) | **✅ Now** | S |
| S13 | Flag certs **referenced-but-missing** from the ZIP (bundles with Q6) | **✅ Now** | M |
| S14 | **Pass-rate** on the closure bundle preview | **✅ Now** | S |

### Data integrity
| # | Suggestion | Me | Effort |
|---|---|---|---|
| S15 | Validate a re-anchor/cert belongs to the **right plot** | **Cert side = ✅ shipped this week.** Re-anchor side: **✅ Now** | S |
| S16 | **Warn** when apply **skips** an undated-anchor inspection | **✅ Now** *(shortlist)* | S |
| S17 | Let `reschedule` **re-attach an anchor** in-app | **🕒 Later** (edge case) | M |

---

## How to reply

Pick whichever works:
- **"do the shortlist"** → the 7 starred items only.
- **"do all the ✅"** → everything I marked do-now (≈ a solid batch, no Ls).
- **"do the shortlist + S6 S8 Q9"** → mix and match by number.
- Or just tell me where you disagree and I'll re-recommend.
