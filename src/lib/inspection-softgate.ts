/**
 * Inspections SSoT — soft-gate lookup.
 *
 * Starting / completing a job whose anchored inspection is still open
 * (not PASSED) is allowed, but the API warns (400 unless override+reason)
 * so the manager can't accidentally bypass a required hold-point. v1
 * treats every anchored inspection as required; a `required` flag can be
 * added later for optional ones.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Open = not yet passed (a finished result is PASSED only). */
export const OPEN_INSPECTION_STATUSES = [
  "SCHEDULED",
  "BOOKED",
  "OVERDUE",
  "FAILED",
] as const;

export async function findOpenRequiredInspections(db: Db, jobId: string) {
  return db.inspection.findMany({
    where: {
      anchorJobId: jobId,
      status: { in: [...OPEN_INSPECTION_STATUSES] },
    },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      scheduledDate: true,
    },
    orderBy: { scheduledDate: "asc" },
  });
}
