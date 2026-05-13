/**
 * (#191) Lateness SSOT — every write to the LatenessEvent table goes
 * through this module. Keeps the capture rules in one place so callers
 * never accidentally diverge on "what counts as late" or "what reason
 * should the system infer when none is given".
 *
 * Two operations:
 *   openOrUpdateLateness — called by the daily cron + the various
 *     mutation paths that put something into a late state. Idempotent
 *     via the (targetType, targetId, kind, wentLateOn) unique key.
 *
 *   resolveLateness — called when the target reaches its non-late
 *     terminal state (job completes, order delivers). Closes all open
 *     events for that target.
 */

import type { Prisma, PrismaClient, LatenessKind, LatenessReason } from "@prisma/client";

type DbClient = PrismaClient | Prisma.TransactionClient;

export interface OpenLatenessArgs {
  /** Why is this thing late — kind of target + kind of slip. */
  kind: LatenessKind;
  /** "job" or "order" — denormalised for fast filtering. */
  targetType: "job" | "order";
  targetId: string;
  /** Scope for filtering. Pass them all when you know them. */
  siteId: string;
  plotId?: string | null;
  jobId?: string | null;
  orderId?: string | null;
  /** Day-aligned midnight when the target first crossed its deadline.
   *  The unique key is (target, kind, wentLateOn) — passing the same
   *  date on subsequent calls is the idempotent "this is still open"
   *  path. */
  wentLateOn: Date;
  /** Current count of working days late. The cron refreshes this each
   *  pass; callers from inside a mutation flow pass 1 for newly-late. */
  daysLate: number;
  /** Optional pre-attribution. If the caller knows the reason (e.g.
   *  delay action with `delayReasonType=WEATHER_RAIN`), pass it so
   *  reports don't show "OTHER" for things we already attributed. */
  reasonCode?: LatenessReason;
  reasonNote?: string | null;
  attributedContactId?: string | null;
  /** (May 2026 audit S-P1) Material suppliers aren't Contact rows;
   *  parallel field so order-driven lateness can be attributed to
   *  the supplier directly. */
  attributedSupplierId?: string | null;
  recordedById?: string | null;
}

/**
 * Open OR update a lateness event. Idempotent via the unique key —
 * calling repeatedly with the same (target, kind, wentLateOn) updates
 * `daysLate` and clears `resolvedAt` if it had been resolved.
 *
 * On first creation, emits an EventLog LATENESS_OPENED row so the
 * site timeline has a breadcrumb.
 */
export async function openOrUpdateLateness(
  db: DbClient,
  args: OpenLatenessArgs,
): Promise<{ id: string; created: boolean }> {
  // Normalise wentLateOn to midnight so the unique key is stable.
  const wentLateOn = new Date(args.wentLateOn);
  wentLateOn.setHours(0, 0, 0, 0);

  const existing = await db.latenessEvent.findUnique({
    where: {
      targetType_targetId_kind_wentLateOn: {
        targetType: args.targetType,
        targetId: args.targetId,
        kind: args.kind,
        wentLateOn,
      },
    },
    select: { id: true, daysLate: true, resolvedAt: true, reasonCode: true },
  });

  if (existing) {
    // Refresh daysLate + un-resolve if it was previously closed but the
    // target slipped back into late (e.g. user manually pushed the
    // deadline back, then it crossed again).
    const data: Prisma.LatenessEventUpdateInput = {};
    if (existing.daysLate !== args.daysLate) data.daysLate = args.daysLate;
    const isReopening = !!existing.resolvedAt;
    if (existing.resolvedAt) data.resolvedAt = null;
    // Only update reason fields if caller explicitly provided one
    // (don't overwrite a manager-set reason with OTHER).
    if (args.reasonCode && existing.reasonCode === "OTHER") {
      data.reasonCode = args.reasonCode;
      if (args.reasonNote !== undefined) data.reasonNote = args.reasonNote;
    }
    if (args.attributedContactId !== undefined) {
      data.attributedContact = args.attributedContactId
        ? { connect: { id: args.attributedContactId } }
        : { disconnect: true };
    }
    if (args.attributedSupplierId !== undefined) {
      data.attributedSupplier = args.attributedSupplierId
        ? { connect: { id: args.attributedSupplierId } }
        : { disconnect: true };
    }
    if (Object.keys(data).length > 0) {
      await db.latenessEvent.update({ where: { id: existing.id }, data });
    }
    // (May 2026 audit B-P1-13) Re-opening a resolved event used to be
    // silent — no audit row. Reports aggregating `resolved` events for
    // a period would still count this row as resolved even though it's
    // back open. Emit a LATENESS_OPENED breadcrumb so the timeline
    // shows the re-open moment.
    if (isReopening) {
      await db.eventLog
        .create({
          data: {
            type: "LATENESS_OPENED",
            description: `Lateness re-opened: ${args.kind} on ${args.targetType} ${args.targetId.slice(0, 8)}`,
            siteId: args.siteId,
            plotId: args.plotId ?? null,
            jobId: args.jobId ?? null,
            delayReasonType: args.reasonCode ?? null,
          },
        })
        .catch(() => {});
    }
    return { id: existing.id, created: false };
  }

  const created = await db.latenessEvent.create({
    data: {
      kind: args.kind,
      targetType: args.targetType,
      targetId: args.targetId,
      siteId: args.siteId,
      plotId: args.plotId ?? null,
      jobId: args.jobId ?? null,
      orderId: args.orderId ?? null,
      wentLateOn,
      daysLate: args.daysLate,
      reasonCode: args.reasonCode ?? "OTHER",
      reasonNote: args.reasonNote ?? null,
      attributedContactId: args.attributedContactId ?? null,
      attributedSupplierId: args.attributedSupplierId ?? null,
      recordedById: args.recordedById ?? null,
    },
    select: { id: true },
  });

  // Audit breadcrumb in EventLog so timeline-style views see it.
  await db.eventLog
    .create({
      data: {
        type: "LATENESS_OPENED",
        description: `Lateness opened: ${args.kind} on ${args.targetType} ${args.targetId.slice(0, 8)}`,
        siteId: args.siteId,
        plotId: args.plotId ?? null,
        jobId: args.jobId ?? null,
        delayReasonType: args.reasonCode ?? null,
      },
    })
    .catch(() => {
      /* breadcrumb only; never fail the lateness write on EventLog hiccup */
    });

  return { id: created.id, created: true };
}

/**
 * Close all open lateness events for a target. Called when the target
 * reaches a non-late state (job COMPLETED, order DELIVERED, etc.).
 */
export async function resolveLateness(
  db: DbClient,
  targetType: "job" | "order",
  targetId: string,
  resolvedAt: Date,
): Promise<{ resolved: number }> {
  const open = await db.latenessEvent.findMany({
    where: { targetType, targetId, resolvedAt: null },
    select: { id: true, siteId: true, plotId: true, jobId: true, kind: true },
  });
  if (open.length === 0) return { resolved: 0 };
  await db.latenessEvent.updateMany({
    where: { id: { in: open.map((e) => e.id) } },
    data: { resolvedAt },
  });
  // One audit row per resolved event so the timeline is preserved.
  await Promise.all(
    open.map((e) =>
      db.eventLog
        .create({
          data: {
            type: "LATENESS_RESOLVED",
            description: `Lateness resolved: ${e.kind} on ${targetType} ${targetId.slice(0, 8)}`,
            siteId: e.siteId,
            plotId: e.plotId ?? null,
            jobId: e.jobId ?? null,
          },
        })
        .catch(() => {}),
    ),
  );
  return { resolved: open.length };
}

/**
 * Inference helpers — when a flow opens a lateness event but doesn't
 * have a strong reason signal, these try to suggest one. Manager can
 * still override via UI.
 */
export function inferReasonFromContext(ctx: {
  /** "delayReasonType" string from EventLog convention. */
  delayReasonType?: string | null;
  /** Was the site marked rained off the day it went late? */
  rainedOff?: boolean;
  /** Predecessor still incomplete past its planned end? */
  predecessorLate?: boolean;
  /** Did an order go overdue on the same day? */
  materialLate?: boolean;
}): LatenessReason {
  if (ctx.delayReasonType) {
    const r = ctx.delayReasonType.toUpperCase();
    if (r === "WEATHER_RAIN") return "WEATHER_RAIN";
    if (r === "WEATHER_TEMPERATURE") return "WEATHER_TEMPERATURE";
    if (r === "WEATHER_WIND") return "WEATHER_WIND";
    if (r === "MATERIAL_LATE") return "MATERIAL_LATE";
    if (r === "PREDECESSOR_LATE") return "PREDECESSOR_LATE";
  }
  if (ctx.rainedOff) return "WEATHER_RAIN";
  if (ctx.predecessorLate) return "PREDECESSOR_LATE";
  if (ctx.materialLate) return "MATERIAL_LATE";
  return "OTHER";
}
