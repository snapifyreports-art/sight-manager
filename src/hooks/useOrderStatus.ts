"use client";

/**
 * Centralised order-status transitions.
 *
 * Before: 12 files each rolled their own PUT /api/orders/:id — each with
 * its own pending-set tracking, optimistic-update strategy, and toast
 * wording. A business-rule change (e.g. "DELIVERED requires a photo")
 * needed 12 edits and was guaranteed to miss one.
 *
 * Now: every surface calls `setOrderStatus(orderId, newStatus)` from this
 * hook. Pending state, timestamps (dateOfOrder when marking ORDERED,
 * deliveredDate when DELIVERED), toasts, and error handling are all
 * centralised.
 *
 * (May 2026) Order-sent-late popup. When an order crosses PENDING →
 * ORDERED after its planned send date, the server returns
 * `needsLateSendDecision` instead of completing the write. The hook
 * catches that, shows the popup via `useLateSendPrompt()`, and re-PUTs
 * with the manager's chosen impact. Single sends get a one-order popup;
 * bulk sends collect every late order into ONE combined popup. Because
 * detection is server-side, every send surface that routes through this
 * hook gets the popup for free.
 *
 * The hook is UI-agnostic — callers render their own buttons/dropdowns
 * and wire onClick to setOrderStatus. That preserves the legitimate UX
 * variation (tile vs row vs menu) while unifying the mutation.
 */

import { useCallback, useState } from "react";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import {
  useLateSendPrompt,
  type LateSendDecision,
  type LateSendItem,
} from "@/components/orders/LateSendPromptProvider";

export type OrderStatus = "PENDING" | "ORDERED" | "DELIVERED" | "CANCELLED";

interface UseOrderStatusOptions {
  /** Called when an order status was successfully updated. Receives the
   *  orderId and new status so callers can refresh local list state. */
  onChange?: (orderId: string, newStatus: OrderStatus) => void;
  /** If true, skip the success toast (caller will show its own feedback).
   *  Default false — most callers want the toast. */
  silent?: boolean;
}

interface UseOrderStatusResult {
  /** Set a single order's status. Records dateOfOrder when moving to
   *  ORDERED (real placement date) and deliveredDate when moving to
   *  DELIVERED. If the order is being sent late, shows the late-send
   *  popup and re-submits with the chosen impact. Returns { ok, error }
   *  so callers can branch if they need to — a cancelled popup returns
   *  { ok: false, error: "cancelled" }. */
  setOrderStatus: (
    orderId: string,
    newStatus: OrderStatus,
    opts?: { silent?: boolean }
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Set multiple orders to the same status in parallel. Returns per-order
   *  results so the UI can show which failed. Any orders being sent late
   *  are collected into ONE combined popup. */
  setManyOrderStatus: (
    orderIds: string[],
    newStatus: OrderStatus,
    opts?: { silent?: boolean }
  ) => Promise<{
    ok: string[];
    failed: Array<{ id: string; error: string }>;
    /** Late orders the manager chose NOT to send (cancelled the popup). */
    skipped: string[];
  }>;
  /** True while any order update is in flight. For per-order UI state
   *  (disabling the specific button), use `isPending(orderId)`. */
  isBusy: boolean;
  /** Check if a specific order is currently being updated. Used to
   *  disable the row's buttons while the PUT is in flight. */
  isPending: (orderId: string) => boolean;
}

/** One PUT /api/orders/:id call — discriminated result. */
type PutResult =
  | { kind: "ok" }
  | { kind: "error"; error: string }
  | { kind: "needs-decision"; item: LateSendItem };

export function useOrderStatus(
  options: UseOrderStatusOptions = {}
): UseOrderStatusResult {
  const toast = useToast();
  const { promptLateSend } = useLateSendPrompt();
  const [pending, setPending] = useState<Set<string>>(new Set());

  const markPending = useCallback((ids: string[], on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  // One PUT. Returns "needs-decision" when the server detects a late
  // send and no `lateSend` decision was supplied — the caller then
  // prompts the manager and calls again with the decision.
  //
  // (May 2026 critical bug) DO NOT send client-side timestamps. Pre-fix
  // the hook stamped `new Date().toISOString()` as the dateOfOrder /
  // deliveredDate which bypassed dev-date entirely — simulation runs
  // corrupted every order's timing. The server /api/orders/[id] PUT
  // auto-stamps when the field is omitted (via getServerCurrentDate,
  // dev-date-aware). Let the server do it — single source of truth.
  const putStatus = useCallback(
    async (
      orderId: string,
      newStatus: OrderStatus,
      lateSend?: LateSendDecision
    ): Promise<PutResult> => {
      const body: Record<string, unknown> = { status: newStatus };
      if (lateSend) body.lateSend = lateSend;
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const error = await fetchErrorMessage(
            res,
            `Failed to mark order ${newStatus.toLowerCase()}`
          );
          return { kind: "error", error };
        }
        const json = await res.json().catch(() => ({}));
        if (json && json.needsLateSendDecision) {
          return { kind: "needs-decision", item: json as LateSendItem };
        }
        return { kind: "ok" };
      } catch (e) {
        return {
          kind: "error",
          error: e instanceof Error ? e.message : "Failed to update order",
        };
      }
    },
    []
  );

  const setOrderStatus = useCallback(
    async (
      orderId: string,
      newStatus: OrderStatus,
      opts?: { silent?: boolean }
    ): Promise<{ ok: boolean; error?: string }> => {
      markPending([orderId], true);
      const silent = opts?.silent ?? options.silent ?? false;
      try {
        let result = await putStatus(orderId, newStatus);

        // Server says this is a late send — ask the manager what to do,
        // then re-submit with the chosen impact.
        if (result.kind === "needs-decision") {
          const decisions = await promptLateSend([result.item]);
          if (!decisions) {
            // Manager cancelled — the order was NOT sent. Not an error,
            // just a deliberate back-out; no toast.
            return { ok: false, error: "cancelled" };
          }
          result = await putStatus(orderId, newStatus, decisions[orderId]);
        }

        if (result.kind === "error") {
          if (!silent) toast.error(result.error);
          return { ok: false, error: result.error };
        }
        // result.kind === "needs-decision" can't happen here — we always
        // pass a decision on the re-PUT — but guard the type anyway.
        if (result.kind !== "ok") {
          const error = "Late-send decision was not applied";
          if (!silent) toast.error(error);
          return { ok: false, error };
        }

        if (!silent) {
          if (newStatus === "ORDERED") toast.success("Order sent");
          else if (newStatus === "DELIVERED") toast.success("Order marked delivered");
          else if (newStatus === "CANCELLED") toast.success("Order cancelled");
          else toast.success(`Order status: ${newStatus}`);
        }
        options.onChange?.(orderId, newStatus);
        return { ok: true };
      } finally {
        markPending([orderId], false);
      }
    },
    [markPending, options, toast, putStatus, promptLateSend]
  );

  const setManyOrderStatus = useCallback(
    async (
      orderIds: string[],
      newStatus: OrderStatus,
      opts?: { silent?: boolean }
    ): Promise<{
      ok: string[];
      failed: Array<{ id: string; error: string }>;
      skipped: string[];
    }> => {
      if (orderIds.length === 0) return { ok: [], failed: [], skipped: [] };
      markPending(orderIds, true);
      try {
        // Phase 1 — fire every PUT. On-time orders complete here; late
        // ones come back "needs-decision" with nothing written yet.
        const firstPass = await Promise.all(
          orderIds.map((id) =>
            putStatus(id, newStatus).then((r) => ({ id, r }))
          )
        );

        const ok: string[] = [];
        const failed: Array<{ id: string; error: string }> = [];
        const skipped: string[] = [];
        const needsDecision: Array<{ id: string; item: LateSendItem }> = [];
        for (const { id, r } of firstPass) {
          if (r.kind === "ok") ok.push(id);
          else if (r.kind === "error") failed.push({ id, error: r.error });
          else needsDecision.push({ id, item: r.item });
        }

        // Phase 2 — ONE combined popup for every late order (Keith's
        // "one combined prompt"); the chosen impact applies to all.
        if (needsDecision.length > 0) {
          const decisions = await promptLateSend(
            needsDecision.map((n) => n.item)
          );
          if (decisions) {
            const secondPass = await Promise.all(
              needsDecision.map((n) =>
                putStatus(n.id, newStatus, decisions[n.id]).then((r) => ({
                  id: n.id,
                  r,
                }))
              )
            );
            for (const { id, r } of secondPass) {
              if (r.kind === "ok") ok.push(id);
              else if (r.kind === "error") failed.push({ id, error: r.error });
              else
                failed.push({
                  id,
                  error: "Late-send decision was not applied",
                });
            }
          } else {
            // Cancelled the combined popup — the late orders simply
            // aren't sent. On-time ones in `ok` already went through.
            for (const n of needsDecision) skipped.push(n.id);
          }
        }

        // Optimistic-state callback for everything that actually sent.
        for (const id of ok) options.onChange?.(id, newStatus);

        const silent = opts?.silent ?? options.silent ?? false;
        if (!silent) {
          const verb = newStatus.toLowerCase();
          if (failed.length === 0 && skipped.length === 0) {
            toast.success(
              `${ok.length} order${ok.length !== 1 ? "s" : ""} marked ${verb}`
            );
          } else if (ok.length === 0 && failed.length === 0) {
            // Everything was skipped (bulk popup cancelled).
            toast.error(
              `${skipped.length} late order${skipped.length !== 1 ? "s" : ""} not sent — popup cancelled`
            );
          } else if (failed.length > 0) {
            toast.error(
              `${ok.length} updated, ${failed.length} failed: ${failed[0].error}`
            );
          } else {
            // Some sent, some skipped, none failed.
            toast.success(
              `${ok.length} marked ${verb}${skipped.length > 0 ? `, ${skipped.length} skipped` : ""}`
            );
          }
        }
        return { ok, failed, skipped };
      } finally {
        markPending(orderIds, false);
      }
    },
    [markPending, options, toast, putStatus, promptLateSend]
  );

  const isPending = useCallback((orderId: string) => pending.has(orderId), [pending]);

  return {
    setOrderStatus,
    setManyOrderStatus,
    isBusy: pending.size > 0,
    isPending,
  };
}
