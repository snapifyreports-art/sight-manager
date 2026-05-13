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
 * The hook is UI-agnostic — callers render their own buttons/dropdowns
 * and wire onClick to setOrderStatus. That preserves the legitimate UX
 * variation (tile vs row vs menu) while unifying the mutation.
 */

import { useCallback, useState } from "react";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

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
   *  DELIVERED. Returns { ok, error } so callers can branch if they
   *  need to. */
  setOrderStatus: (
    orderId: string,
    newStatus: OrderStatus,
    opts?: { silent?: boolean }
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Set multiple orders to the same status in parallel. Returns per-order
   *  results so the UI can show which failed. */
  setManyOrderStatus: (
    orderIds: string[],
    newStatus: OrderStatus,
    opts?: { silent?: boolean }
  ) => Promise<{ ok: string[]; failed: Array<{ id: string; error: string }> }>;
  /** True while any order update is in flight. For per-order UI state
   *  (disabling the specific button), use `isPending(orderId)`. */
  isBusy: boolean;
  /** Check if a specific order is currently being updated. Used to
   *  disable the row's buttons while the PUT is in flight. */
  isPending: (orderId: string) => boolean;
}

export function useOrderStatus(
  options: UseOrderStatusOptions = {}
): UseOrderStatusResult {
  const toast = useToast();
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

  const setOrderStatus = useCallback(
    async (
      orderId: string,
      newStatus: OrderStatus,
      opts?: { silent?: boolean }
    ): Promise<{ ok: boolean; error?: string }> => {
      markPending([orderId], true);
      const silent = opts?.silent ?? options.silent ?? false;
      try {
        // (May 2026 critical bug) DO NOT send client-side timestamps.
        // Pre-fix the hook stamped `new Date().toISOString()` as the
        // dateOfOrder / deliveredDate which bypassed dev-date entirely.
        // Simulation runs corrupted every order's timing. The server
        // /api/orders/[id] PUT auto-stamps when the field is omitted
        // (via getServerCurrentDate, dev-date-aware). Let the server
        // do it — single source of truth.
        const body: Record<string, unknown> = { status: newStatus };

        const res = await fetch(`/api/orders/${orderId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, `Failed to mark order ${newStatus.toLowerCase()}`);
          if (!silent) toast.error(msg);
          return { ok: false, error: msg };
        }
        if (!silent) {
          if (newStatus === "ORDERED") toast.success("Order sent");
          else if (newStatus === "DELIVERED") toast.success("Order marked delivered");
          else if (newStatus === "CANCELLED") toast.success("Order cancelled");
          else toast.success(`Order status: ${newStatus}`);
        }
        options.onChange?.(orderId, newStatus);
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to update order";
        if (!silent) toast.error(msg);
        return { ok: false, error: msg };
      } finally {
        markPending([orderId], false);
      }
    },
    [markPending, options, toast]
  );

  const setManyOrderStatus = useCallback(
    async (
      orderIds: string[],
      newStatus: OrderStatus,
      opts?: { silent?: boolean }
    ): Promise<{ ok: string[]; failed: Array<{ id: string; error: string }> }> => {
      if (orderIds.length === 0) return { ok: [], failed: [] };
      markPending(orderIds, true);
      // Mark silent on each individual call — we'll emit one aggregate toast.
      const results = await Promise.all(
        orderIds.map((id) => setOrderStatus(id, newStatus, { silent: true }))
      );
      markPending(orderIds, false);

      const ok: string[] = [];
      const failed: Array<{ id: string; error: string }> = [];
      results.forEach((r, i) => {
        if (r.ok) ok.push(orderIds[i]);
        else failed.push({ id: orderIds[i], error: r.error ?? "unknown" });
      });

      const silent = opts?.silent ?? options.silent ?? false;
      if (!silent) {
        if (failed.length === 0) {
          toast.success(
            `${ok.length} order${ok.length !== 1 ? "s" : ""} marked ${newStatus.toLowerCase()}`
          );
        } else if (ok.length === 0) {
          toast.error(
            `Failed to update ${failed.length} order${failed.length !== 1 ? "s" : ""}: ${failed[0].error}`
          );
        } else {
          toast.error(
            `${ok.length} updated, ${failed.length} failed: ${failed[0].error}`
          );
        }
      }
      return { ok, failed };
    },
    [markPending, setOrderStatus, options.silent, toast]
  );

  const isPending = useCallback((orderId: string) => pending.has(orderId), [pending]);

  return {
    setOrderStatus,
    setManyOrderStatus,
    isBusy: pending.size > 0,
    isPending,
  };
}
