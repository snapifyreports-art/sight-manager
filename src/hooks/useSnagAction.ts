"use client";

/**
 * Centralised snag-status transitions + optional after-photo attachment.
 *
 * Before: SnagDialog, SnagList, Daily Brief, Walkthrough, ContractorComms,
 * and the public contractor-share page each had their own "mark resolved"
 * modal with different photo-tag conventions (SnagDialog lets user pick,
 * DailySiteBrief hardcodes "after", Walkthrough omits tag). A snag closed
 * from SnagList had no photo at all.
 *
 * Now:
 *   - For close-with-photo: callers open SnagDialog (the richest surface)
 *     preset to the "close" action. This hook is for the inline-only
 *     quick-flip chips ("mark in progress", "reopen") that don't need
 *     photos.
 *   - `setSnagStatus(snagId, status)` handles the PATCH + toast + refetch.
 *   - `requestSignOff(snagId, notes?)` for the "ask sign-off" flow.
 *
 * The photo upload logic stays in SnagDialog where it already works well.
 */

import { useCallback, useState } from "react";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

export type SnagStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

interface UseSnagActionOptions {
  /** Called on successful status change. */
  onChange?: (snagId: string, newStatus: SnagStatus) => void;
  /** If true, skip success toasts — caller handles feedback. */
  silent?: boolean;
}

interface UseSnagActionResult {
  /** Flip a snag's status (no photos). For close-with-photo, open
   *  SnagDialog with the snag preset instead. */
  setSnagStatus: (
    snagId: string,
    newStatus: SnagStatus,
    opts?: { silent?: boolean }
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Request sign-off on a snag that's been resolved on site. */
  requestSignOff: (
    snagId: string,
    notes?: string,
    opts?: { silent?: boolean }
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Whether a specific snag has a mutation in flight. */
  isPending: (snagId: string) => boolean;
  isBusy: boolean;
}

export function useSnagAction(
  options: UseSnagActionOptions = {}
): UseSnagActionResult {
  const toast = useToast();
  const [pending, setPending] = useState<Set<string>>(new Set());

  const markPending = useCallback((id: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const setSnagStatus = useCallback(
    async (
      snagId: string,
      newStatus: SnagStatus,
      opts?: { silent?: boolean }
    ): Promise<{ ok: boolean; error?: string }> => {
      markPending(snagId, true);
      const silent = opts?.silent ?? options.silent ?? false;
      try {
        const res = await fetch(`/api/snags/${snagId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, "Failed to update snag");
          if (!silent) toast.error(msg);
          return { ok: false, error: msg };
        }
        if (!silent) {
          const verb =
            newStatus === "IN_PROGRESS" ? "Snag marked in progress" :
            newStatus === "RESOLVED" ? "Snag marked resolved" :
            newStatus === "CLOSED" ? "Snag closed" :
            newStatus === "OPEN" ? "Snag reopened" :
            `Snag status: ${newStatus}`;
          toast.success(verb);
        }
        options.onChange?.(snagId, newStatus);
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to update snag";
        if (!silent) toast.error(msg);
        return { ok: false, error: msg };
      } finally {
        markPending(snagId, false);
      }
    },
    [markPending, options, toast]
  );

  const requestSignOff = useCallback(
    async (
      snagId: string,
      notes?: string,
      opts?: { silent?: boolean }
    ): Promise<{ ok: boolean; error?: string }> => {
      markPending(snagId, true);
      const silent = opts?.silent ?? options.silent ?? false;
      try {
        const res = await fetch(`/api/snags/${snagId}/request-signoff`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notes ? { notes } : {}),
        });
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, "Failed to request sign-off");
          if (!silent) toast.error(msg);
          return { ok: false, error: msg };
        }
        if (!silent) toast.success("Sign-off requested");
        // Status moves to IN_PROGRESS server-side when sign-off requested.
        options.onChange?.(snagId, "IN_PROGRESS");
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to request sign-off";
        if (!silent) toast.error(msg);
        return { ok: false, error: msg };
      } finally {
        markPending(snagId, false);
      }
    },
    [markPending, options, toast]
  );

  const isPending = useCallback((snagId: string) => pending.has(snagId), [pending]);

  return {
    setSnagStatus,
    requestSignOff,
    isPending,
    isBusy: pending.size > 0,
  };
}
