/**
 * EventLog SSOT — every write to the EventLog table goes through
 * `logEvent()`. One path means the `type` vocabulary, the scope fields,
 * the `detail` payload and the resilience policy can never drift across
 * the ~37 call sites again.
 *
 * Why this exists: the May 2026 Story-completeness pass found EventLog
 * being written from ~37 hand-rolled call sites, each improvising its
 * own `type` + `description` + which of siteId/plotId/jobId to set. The
 * direct consequence — job-scoped events that forgot to set `plotId`
 * never showed in the per-plot Site Story, so the Story looked empty
 * even though the data was there. `logEvent()` closes that:
 *
 *   - backfills plotId/siteId from jobId (and siteId from plotId), so
 *     EVERY job event surfaces in the plot timeline and the site story
 *     even when the caller only had the job id to hand;
 *   - carries the structured `detail` payload so the Story reads typed
 *     fields instead of regex-parsing the `description` string.
 *
 * Rule (enforced by scripts/smoke-test.ts): no `eventLog.create` outside
 * this file. New event to log? Call `logEvent()`.
 */

import type { Prisma, PrismaClient, EventType, EventLog } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface LogEventArgs {
  type: EventType;
  /** Human-readable one-liner. Still the fallback for legacy readers
   *  and the events-log UI; `detail` is the structured path. */
  description: string;
  /** Scope. Pass whatever you know — `logEvent` backfills the rest:
   *  jobId → plotId → siteId, so a job event always reaches the plot
   *  timeline and the site story even if the caller only had the job. */
  siteId?: string | null;
  plotId?: string | null;
  jobId?: string | null;
  /** The acting user. Null = system / cron-generated. */
  userId?: string | null;
  /** Structured payload — typed per `type` (see EventLog.detail in the
   *  schema). The Site Story reads this instead of parsing the
   *  `description` string. Plain JSON only (strings/numbers/booleans). */
  detail?: Prisma.InputJsonValue | null;
  /** Only meaningful for SCHEDULE_CASCADED + lateness breadcrumbs —
   *  WEATHER_RAIN | WEATHER_TEMPERATURE | MATERIAL_LATE | OTHER, etc. */
  delayReasonType?: string | null;
}

/**
 * Canonical EventLog writer. Backfills plot/site scope from the job so
 * every event reaches the timelines that should show it.
 *
 * Errors propagate by default — a `logEvent(tx, …)` call inside a
 * transaction rolls the transaction back if the write fails, exactly
 * like the pre-helper inline `eventLog.create` calls did. Best-effort
 * breadcrumb callers append `.catch(() => {})` themselves (as the
 * lateness helper does for its LATENESS_OPENED / LATENESS_RESOLVED
 * rows) so an EventLog hiccup never fails the real mutation.
 *
 * Returns the created row — most callers fire-and-forget, but the
 * manual site-log endpoint echoes it straight back to the UI.
 */
export async function logEvent(
  db: DbClient,
  args: LogEventArgs,
): Promise<EventLog> {
  let siteId = args.siteId ?? null;
  let plotId = args.plotId ?? null;
  const jobId = args.jobId ?? null;

  // Backfill the plot/site scope from the job. `Job.plotId` and
  // `Plot.siteId` are both non-nullable in the schema, so a job id
  // resolves cleanly to both. One indexed lookup, and only when the
  // caller didn't already supply the scope.
  if (jobId && (!plotId || !siteId)) {
    const job = await db.job.findUnique({
      where: { id: jobId },
      select: { plotId: true, plot: { select: { siteId: true } } },
    });
    if (job) {
      plotId = plotId ?? job.plotId;
      siteId = siteId ?? job.plot?.siteId ?? null;
    }
  } else if (plotId && !siteId) {
    const plot = await db.plot.findUnique({
      where: { id: plotId },
      select: { siteId: true },
    });
    if (plot) siteId = plot.siteId;
  }

  return db.eventLog.create({
    data: {
      type: args.type,
      description: args.description,
      siteId,
      plotId,
      jobId,
      userId: args.userId ?? null,
      // `undefined` (not `null`) leaves the column NULL on insert.
      detail: args.detail ?? undefined,
      delayReasonType: args.delayReasonType ?? null,
    },
  });
}
