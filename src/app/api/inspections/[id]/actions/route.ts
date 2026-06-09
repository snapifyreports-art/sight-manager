import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";
import { canAccessSite } from "@/lib/site-access";
import { logEvent } from "@/lib/event-log";
import { handoverDocTypeForInspection } from "@/lib/inspection-doctype";

export const dynamic = "force-dynamic";

type Finding = { kind?: string; description?: string; severity?: string; contactId?: string | null };

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
      anchorJob: { select: { id: true, contractors: { select: { contactId: true }, take: 1 } } },
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
    for (const f of findings) {
      if (!f.description?.trim()) continue;
      const contactId = f.contactId !== undefined ? f.contactId : defaultContactId;
      if (f.kind === "NCR") {
        await tx.nCR.create({
          data: {
            siteId: insp!.plot.siteId,
            plotId: insp!.plotId,
            jobId: insp!.anchorJobId,
            contactId,
            title: `${insp!.name}: ${f.description.trim().slice(0, 80)}`,
            description: f.description.trim(),
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
      const bookedDate = body.bookedDate ? new Date(body.bookedDate) : new Date();
      const updated = await prisma.inspection.update({ where: { id }, data: { status: "BOOKED", bookedDate } });
      await logEvent(prisma, { type: "INSPECTION_BOOKED", description: `Inspection "${insp.name}" booked`, siteId: insp.plot.siteId, plotId: insp.plotId, jobId: insp.anchorJobId, userId, detail: { inspectionId: id } }).catch(() => {});
      return NextResponse.json(updated);
    }

    if (action === "pass") {
      // HARD GATE: certificate required to pass (server-enforced).
      const certId = body.certificateDocumentId ?? insp.certificateDocumentId;
      if (!certId) {
        return NextResponse.json({ error: "A certificate must be attached before passing" }, { status: 400 });
      }
      const passDate = body.passDate ? new Date(body.passDate) : new Date();
      const docType = handoverDocTypeForInspection(insp.type);
      const result = await prisma.$transaction(async (tx) => {
        await tx.inspection.update({
          where: { id },
          data: { status: "PASSED", passedAt: passDate, certificateDocumentId: certId },
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
        return counts;
      });
      await logEvent(prisma, { type: "INSPECTION_PASSED", description: `Inspection "${insp.name}" passed`, siteId: insp.plot.siteId, plotId: insp.plotId, jobId: insp.anchorJobId, userId, detail: { inspectionId: id, certificateId: certId } }).catch(() => {});
      return NextResponse.json({ ok: true, ...result, handoverDocType: docType });
    }

    if (action === "fail") {
      const failDate = body.failDate ? new Date(body.failDate) : new Date();
      const result = await prisma.$transaction(async (tx) => {
        await tx.inspection.update({ where: { id }, data: { status: "FAILED", failedAt: failDate, notes: body.notes?.trim() || insp.notes } });
        return createFindings(tx as typeof prisma, (body.findings as Finding[]) ?? []);
      });
      await logEvent(prisma, { type: "INSPECTION_FAILED", description: `Inspection "${insp.name}" failed`, siteId: insp.plot.siteId, plotId: insp.plotId, jobId: insp.anchorJobId, userId, detail: { inspectionId: id } }).catch(() => {});
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === "reschedule") {
      if (!body.newDate) return NextResponse.json({ error: "newDate required" }, { status: 400 });
      // Manual reschedule detaches the anchor so the chosen date holds
      // (an anchored inspection would otherwise be recomputed on the next
      // job move). Re-anchoring is done via the template.
      const updated = await prisma.inspection.update({
        where: { id },
        data: { scheduledDate: new Date(body.newDate), anchorJobId: null, bookedDate: null, status: insp.status === "OVERDUE" ? "SCHEDULED" : insp.status },
      });
      await logEvent(prisma, { type: "INSPECTION_SCHEDULED", description: `Inspection "${insp.name}" rescheduled`, siteId: insp.plot.siteId, plotId: insp.plotId, userId, detail: { inspectionId: id } }).catch(() => {});
      return NextResponse.json(updated);
    }

    if (action === "reinspect") {
      if (insp.status !== "FAILED") return NextResponse.json({ error: "Only a failed inspection can be re-inspected" }, { status: 400 });
      const updated = await prisma.inspection.update({
        where: { id },
        data: { status: "SCHEDULED", bookedDate: null, ...(body.newDate ? { scheduledDate: new Date(body.newDate) } : {}) },
      });
      await logEvent(prisma, { type: "INSPECTION_SCHEDULED", description: `Re-inspection scheduled for "${insp.name}"`, siteId: insp.plot.siteId, plotId: insp.plotId, jobId: insp.anchorJobId, userId, detail: { inspectionId: id } }).catch(() => {});
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    return apiError(err, "Inspection action failed");
  }
}
