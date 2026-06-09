/**
 * Inspections SSoT — date derivation.
 *
 * An inspection's `scheduledDate` is DERIVED from its anchor job's date
 * (+ edge + signed working-day offset). It's stored as a denormalised
 * cache and recomputed in-transaction whenever the anchor job moves — the
 * SAME discipline the cascade engine uses for Job.startDate + PENDING
 * order dates. PASSED / FAILED inspections are frozen (their result is a
 * fact); only SCHEDULED / BOOKED / OVERDUE re-derive.
 *
 * See future-plans/inspections-feature/Inspections-Build-Plan.md.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { addWorkingDays } from "./working-days";

type Db = PrismaClient | Prisma.TransactionClient;

export type AnchorEdge = "START" | "END";

const toDate = (v: Date | string | null | undefined): Date | null =>
  v == null ? null : v instanceof Date ? v : new Date(v);

/**
 * Pure: the scheduled date for an inspection anchored to `anchorJob`.
 * `addWorkingDays` already snaps weekends and returns a working day, so
 * the result is always Mon-Fri. Returns null if the anchor has no date
 * for the chosen edge (detached / undated job).
 */
export function computeInspectionScheduledDate(
  anchorJob: { startDate: Date | string | null; endDate: Date | string | null },
  edge: AnchorEdge,
  offsetDays: number,
): Date | null {
  const base = toDate(edge === "END" ? anchorJob.endDate : anchorJob.startDate);
  if (!base) return null;
  return addWorkingDays(base, offsetDays);
}

/**
 * Apply-time / template preview: resolve each TemplateInspection's date
 * from the template's computed date map (the same map computeTemplateDateMap
 * produces). Returns Map<templateInspectionId, Date>.
 */
export function computeTemplateInspectionDates(
  templateInspections: Array<{
    id: string;
    anchorTemplateJobId: string;
    anchorEdge: string;
    offsetDays: number;
  }>,
  templateDateMap: Map<string, { start: Date; end: Date }>,
): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const ti of templateInspections) {
    const anchor = templateDateMap.get(ti.anchorTemplateJobId);
    if (!anchor) continue;
    const date = computeInspectionScheduledDate(
      { startDate: anchor.start, endDate: anchor.end },
      ti.anchorEdge === "END" ? "END" : "START",
      ti.offsetDays,
    );
    if (date) out.set(ti.id, date);
  }
  return out;
}

/**
 * Recompute + persist scheduledDate for every non-terminal inspection on
 * a plot from its anchor job's CURRENT dates. MUST be called (in the same
 * transaction) by every code path that moves a job's start/end date, so
 * the cache never drifts. Returns the number of rows updated. Idempotent:
 * running twice yields the same dates.
 */
export async function recomputeInspectionDates(
  db: Db,
  plotId: string,
  today?: Date,
): Promise<number> {
  const inspections = await db.inspection.findMany({
    where: {
      plotId,
      anchorJobId: { not: null },
      status: { in: ["SCHEDULED", "BOOKED", "OVERDUE"] },
    },
    select: {
      id: true,
      anchorJobId: true,
      anchorEdge: true,
      offsetDays: true,
      scheduledDate: true,
      status: true,
      bookedDate: true,
    },
  });
  if (inspections.length === 0) return 0;

  // Start-of-day "today" so an OVERDUE inspection whose anchor moved to
  // *today* doesn't bounce. Caller may pass a server/dev date; otherwise
  // use real now (dev-date testing aside, callers in a tx have one).
  const todayStart = (() => {
    const d = today ? new Date(today) : new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  const jobIds = Array.from(
    new Set(inspections.map((i) => i.anchorJobId).filter((v): v is string => !!v)),
  );
  const jobs = await db.job.findMany({
    where: { id: { in: jobIds } },
    select: { id: true, startDate: true, endDate: true },
  });
  const jobMap = new Map(jobs.map((j) => [j.id, j]));

  let updated = 0;
  for (const insp of inspections) {
    const job = insp.anchorJobId ? jobMap.get(insp.anchorJobId) : null;
    if (!job) continue; // anchor deleted → leave the last known date frozen
    const next = computeInspectionScheduledDate(
      job,
      insp.anchorEdge === "END" ? "END" : "START",
      insp.offsetDays,
    );
    if (!next) continue;

    const dateChanged = next.getTime() !== new Date(insp.scheduledDate).getTime();
    // (Jun 2026 audit fix) An OVERDUE inspection whose anchor job is
    // delayed so its new scheduled date is today or later is no longer
    // overdue — un-flip it (back to BOOKED if a booking was held, else
    // SCHEDULED). Without this it stays OVERDUE forever and the Brief +
    // cron keep nagging about an inspection that's actually weeks away.
    const unflip = insp.status === "OVERDUE" && next.getTime() >= todayStart.getTime();
    if (!dateChanged && !unflip) continue; // nothing to do

    const data: { scheduledDate: Date; status?: "SCHEDULED" | "BOOKED" } = {
      scheduledDate: next,
    };
    if (unflip) data.status = insp.bookedDate ? "BOOKED" : "SCHEDULED";
    await db.inspection.update({ where: { id: insp.id }, data });
    updated++;
  }
  return updated;
}
