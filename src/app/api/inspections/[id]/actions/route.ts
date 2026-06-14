import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";
import { canAccessSite } from "@/lib/site-access";
import { logEvent } from "@/lib/event-log";
import { handoverDocTypeForInspection } from "@/lib/inspection-doctype";
import { computeInspectionScheduledDate } from "@/lib/inspection-dates";
import { maxRefNumber } from "@/lib/ref-sequence";
import { addWorkingDays } from "@/lib/working-days";
import { getServerStartOfDay } from "@/lib/dev-date";

export const dynamic = "force-dynamic";

type Finding = {
  kind?: string;
  description?: string;
  severity?: string;
  contactId?: string | null;
  // (Jun 2026 D5) NCR-only formal QA fields from the sign-off quick rows.
  rootCause?: string;
  correctiveAction?: string;
};

const PRIORITY: Record<string, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
  LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH", CRITICAL: "CRITICAL",
};

// POST /api/inspections/[id]/actions — book | pass | fail | reschedule | reinspect
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sessionHasPermission(session.user as { role?: string; permissions?: string[] }, "MANAGE_INSPECTIONS")) {
    return NextResponse.json({ error: "You do not have permission to manage inspections" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const action = body.action as string;

  const insp = await prisma.inspection.findUnique({
    where: { id },
    include: {
      plot: { select: { id: true, siteId: true } },
      anchorJob: { select: { id: true, startDate: true, endDate: true, contractors: { select: { contactId: true }, take: 1 } } },
    },
  });
  if (!insp) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, insp.plot.siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }

  const userId = session.user.id;
  const defaultContactId = insp.anchorJob?.contractors?.[0]?.contactId ?? null;

  // Shared: create findings (snags / NCRs), each linked to this inspection.
  async function createFindings(tx: typeof prisma, findings: Finding[]) {
    let snags = 0, ncrs = 0;
    // (Jun 2026 audit fix) NCRs raised from inspection findings must get a
    // sequential NCR-NNN ref like manually-raised ones, else the formal QA
    // register shows a raw cuid fragment. Seed the counter once, increment.
    // (Jun 2026 audit) Seed from the max existing suffix, not count —
    // count mints duplicate refs as soon as any NCR is deleted.
    const existingNcrRefs = await tx.nCR.findMany({
      where: { siteId: insp!.plot.siteId },
      select: { ref: true },
    });
    let ncrSeq = maxRefNumber("NCR", existingNcrRefs.map((r) => r.ref));
    for (const f of findings) {
      if (!f.description?.trim()) continue;
      const contactId = f.contactId !== undefined ? f.contactId : defaultContactId;
      if (f.kind === "NCR") {
        ncrSeq += 1;
        await tx.nCR.create({
          data: {
            siteId: insp!.plot.siteId,
            plotId: insp!.plotId,
            jobId: insp!.anchorJobId,
            contactId,
            ref: `NCR-${String(ncrSeq).padStart(3, "0")}`,
            title: `${insp!.name}: ${f.description.trim().slice(0, 80)}`,
            description: f.description.trim(),
            // (Jun 2026 D5) Optional root cause / corrective action from
            // the sign-off quick rows — same fields the manual NCR form has.
            rootCause: f.rootCause?.trim() || null,
            correctiveAction: f.correctiveAction?.trim() || null,
            status: "OPEN",
            raisedById: userId,
            inspectionId: insp!.id,
          },
        });
        ncrs++;
      } else {
        await tx.snag.create({
          data: {
            plotId: insp!.plotId,
            jobId: insp!.anchorJobId,
            description: f.description.trim(),
            priority: PRIORITY[f.severity ?? "MEDIUM"] ?? "MEDIUM",
            status: "OPEN",
            contactId,
            raisedById: userId,
            inspectionId: insp!.id,
          },
        });
        snags++;
      }
    }
    return { snags, ncrs };
  }

  try {
    if (action === "book") {
      if (!["SCHEDULED", "OVERDUE"].includes(insp.status)) {
        return NextResponse.json({ error: `Can't book an inspection that is ${insp.status}` }, { status: 400 });
      }
      // (Jun 2026 review fix) bookedDate is the inspector's VISIT day, not
      // the moment the manager clicked Book. With no explicit date, default
      // to the scheduled date — surfaces like "Inspections today" and the
      // contractor share page key off bookedDate ?? scheduledDate, and a
      // click-timestamp here told the trade the visit was today.
      const bookedDate = body.bookedDate ? new Date(body.bookedDate) : new Date(insp.scheduledDate);
      const updated = await prisma.inspection.update({ where: { id }, data: { status: "BOOKED", bookedDate } });
      await logEvent(prisma, { type: "INSPECTION_BOOKED", description: `Inspection "${insp.name}" booked`, siteId: insp.plot.siteId, plotId: insp.plotId, jobId: insp.anchorJobId, userId, detail: { inspectionId: id } }).catch(() => {});
      return NextResponse.json(updated);
    }

    if (action === "pass") {
      // (Jun 2026 review fix) Guard like `book` does — re-passing an
      // already-PASSED row (stale tab, double-click) would otherwise sweep
      // the findings raised on the first pass via the Q12 auto-resolve.
      if (insp.status === "PASSED") {
        return NextResponse.json({ error: "This inspection has already passed" }, { status: 400 });
      }
      // HARD GATE: certificate required to pass (server-enforced).
      const certId = body.certificateDocumentId ?? insp.certificateDocumentId;
      if (!certId) {
        return NextResponse.json({ error: "A certificate must be attached before passing" }, { status: 400 });
      }
      // (Jun 2026 R31) The certificate must be a PLOT-scoped document on
      // THIS plot — tightened from the earlier site-level check. The
      // handover ZIP loop only bundles plot docs, so a site-level cert
      // would satisfy the statutory hold-point yet go missing from the
      // plot's handover folder. Require certDoc.plotId === insp.plotId and
      // tell the user exactly where to file it.
      const certDoc = await prisma.siteDocument.findUnique({
        where: { id: certId },
        select: { siteId: true, plotId: true },
      });
      if (!certDoc || certDoc.siteId !== insp.plot.siteId) {
        return NextResponse.json(
          { error: "The certificate document must belong to this site" },
          { status: 400 },
        );
      }
      if (certDoc.plotId !== insp.plotId) {
        return NextResponse.json(
          { error: "The certificate must be filed against this plot — re-upload it to the plot's documents and try again." },
          { status: 400 },
        );
      }
      const passDate = body.passDate ? new Date(body.passDate) : new Date();
      const docType = handoverDocTypeForInspection(insp.type);
      const result = await prisma.$transaction(async (tx) => {
        await tx.inspection.update({
          where: { id },
          // Clear failedAt defensively: a FAILED→reinspect→PASS row must
          // not carry both result timestamps (status is the SSoT but
          // exports that read failedAt would mis-classify it).
          data: { status: "PASSED", passedAt: passDate, failedAt: null, certificateDocumentId: certId },
        });
        // (Jun 2026 Q12) A pass supersedes the findings an earlier FAIL on
        // this same inspection raised — the inspector has re-checked the
        // work and signed it off, so still-open linked snags/NCRs resolve
        // automatically. Runs BEFORE createFindings so any findings logged
        // on THIS pass stay open. Only on PASS — re-inspecting alone never
        // touches them.
        const autoSnags = await tx.snag.updateMany({
          where: { inspectionId: id, status: { in: ["OPEN", "IN_PROGRESS"] } },
          data: { status: "RESOLVED", resolvedAt: passDate, resolvedById: userId },
        });
        const autoNcrs = await tx.nCR.updateMany({
          where: { inspectionId: id, status: { in: ["OPEN", "INVESTIGATING", "AWAITING_CORRECTION"] } },
          // closedAt/closedById match the manual NCR route's RESOLVED
          // transition — without them the handover QA register prints "—"
          // for the closure date.
          data: { status: "RESOLVED", closedAt: passDate, closedById: userId },
        });
        // Handover tick is a CONFIRMED choice (tickHandover), never automatic.
        if (body.tickHandover && docType) {
          await tx.handoverChecklist.upsert({
            where: { plotId_docType: { plotId: insp.plotId, docType } },
            update: { checkedAt: new Date(), checkedById: userId, documentId: certId },
            create: { plotId: insp.plotId, docType, required: true, checkedAt: new Date(), checkedById: userId, documentId: certId },
          });
        }
        const counts = await createFindings(tx as typeof prisma, (body.findings as Finding[]) ?? []);
        return { ...counts, autoResolvedSnags: autoSnags.count, autoResolvedNcrs: autoNcrs.count };
      });
      await logEvent(prisma, { type: "INSPECTION_PASSED", description: `Inspection "${insp.name}" passed`, siteId: insp.plot.siteId, plotId: insp.plotId, jobId: insp.anchorJobId, userId, detail: { inspectionId: id, certificateId: certId } }).catch(() => {});
      return NextResponse.json({ ok: true, ...result, handoverDocType: docType });
    }

    if (action === "fail") {
      // (Jun 2026 audit fix) Terminal-state guard like `pass` and `book`.
      // A PASSED/FAILED result is an immutable fact (schema doc; the PATCH
      // route refuses re-anchor edits for the same reason) — a stale tab /
      // double submit must not flip PASSED→FAILED (keeping passedAt set)
      // or duplicate findings on an already-failed row. Re-opening goes
      // through `reinspect`.
      if (insp.status === "PASSED" || insp.status === "FAILED") {
        return NextResponse.json({ error: `This inspection has already ${insp.status === "PASSED" ? "passed" : "failed"}` }, { status: 400 });
      }
      const failDate = body.failDate ? new Date(body.failDate) : new Date();
      const result = await prisma.$transaction(async (tx) => {
        // passedAt: null mirrors pass clearing failedAt — no row may carry
        // both result timestamps.
        await tx.inspection.update({ where: { id }, data: { status: "FAILED", failedAt: failDate, passedAt: null, notes: body.notes?.trim() || insp.notes } });
        return createFindings(tx as typeof prisma, (body.findings as Finding[]) ?? []);
      });
      await logEvent(prisma, { type: "INSPECTION_FAILED", description: `Inspection "${insp.name}" failed`, siteId: insp.plot.siteId, plotId: insp.plotId, jobId: insp.anchorJobId, userId, detail: { inspectionId: id } }).catch(() => {});
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "reschedule") {
      if (!body.newDate) return NextResponse.json({ error: "newDate required" }, { status: 400 });
      // (Jun 2026 audit fix) PASSED/FAILED results are immutable facts —
      // rescheduling one would rewrite its date and detach the anchor.
      if (insp.status === "PASSED" || insp.status === "FAILED") {
        return NextResponse.json({ error: `Can't reschedule an inspection that has already ${insp.status === "PASSED" ? "passed" : "failed"}` }, { status: 400 });
      }
      // Manual reschedule detaches the anchor so the chosen date holds
      // (an anchored inspection would otherwise be recomputed on the next
      // job move). Re-anchoring is done via the template.
      //
      // (Jun 2026 audit fix) Status collapses to SCHEDULED for every
      // remaining (non-terminal) state — bookedDate is cleared, so a row
      // left BOOKED would show a blue "Booked" chip with no booking held
      // and never re-enter the booking-due reminder pipeline (which
      // targets status === "SCHEDULED" only).
      const updated = await prisma.inspection.update({
        where: { id },
        data: { scheduledDate: new Date(body.newDate), anchorJobId: null, bookedDate: null, status: "SCHEDULED" },
      });
      await logEvent(prisma, { type: "INSPECTION_SCHEDULED", description: `Inspection "${insp.name}" rescheduled`, siteId: insp.plot.siteId, plotId: insp.plotId, userId, detail: { inspectionId: id } }).catch(() => {});
      return NextResponse.json(updated);
    }

    if (action === "reinspect") {
      if (insp.status !== "FAILED") return NextResponse.json({ error: "Only a failed inspection can be re-inspected" }, { status: 400 });
      // (Jun 2026 audit fix) Re-opening a FAILED inspection must (a) clear
      // failedAt so the row doesn't carry both a fail AND a later pass
      // timestamp, and (b) get a fresh future date — if no newDate is
      // given, re-derive from the still-attached anchor job rather than
      // leaving the old (past) date, which the cron would instantly flip
      // back to OVERDUE.
      let reDate: Date | null = body.newDate ? new Date(body.newDate) : null;
      if (!reDate && insp.anchorJob) {
        reDate = computeInspectionScheduledDate(
          { startDate: insp.anchorJob.startDate, endDate: insp.anchorJob.endDate },
          insp.anchorEdge === "END" ? "END" : "START",
          insp.offsetDays,
        );
      }
      // No explicit date AND no anchor to derive from → start from the
      // current (failed) date so the floor below still applies.
      if (!reDate) reDate = new Date(insp.scheduledDate);
      // (Jun 2026 audit fix) Floor the re-inspection to today-or-the-next
      // working day. The failure case this whole branch is meant to handle
      // — a statutory hold-point on work that is already BUILT when the
      // inspector fails it — has an anchor job (and so a re-derived date)
      // in the PAST. Without this floor the row is written SCHEDULED with a
      // past date and the nightly inspection-alerts cron flips it straight
      // back to OVERDUE within 24h, the exact thing re-inspecting is meant
      // to clear. The manual reschedule + re-anchor paths already floor the
      // same way; this brings reinspect in line.
      const todayStart = getServerStartOfDay(req);
      if (reDate.getTime() < todayStart.getTime()) {
        reDate = addWorkingDays(todayStart, 0);
      }
      const updated = await prisma.inspection.update({
        where: { id },
        data: {
          status: "SCHEDULED",
          bookedDate: null,
          failedAt: null,
          passedAt: null,
          scheduledDate: reDate,
        },
      });
      await logEvent(prisma, { type: "INSPECTION_SCHEDULED", description: `Re-inspection scheduled for "${insp.name}"`, siteId: insp.plot.siteId, plotId: insp.plotId, jobId: insp.anchorJobId, userId, detail: { inspectionId: id } }).catch(() => {});
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    return apiError(err, "Inspection action failed");
  }
}
