"use client";

/**
 * Centralised inspection lifecycle actions — book / pass / fail /
 * reschedule / re-inspect (POST to /api/inspections/[id]/actions) plus
 * field edits (PATCH /api/inspections/[id]). Mirrors useSnagAction:
 * per-id pending set, toast, onChange refetch hook.
 */
import { useCallback, useState } from "react";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

export type InspectionFinding = {
  kind: "SNAG" | "NCR";
  description: string;
  severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  contactId?: string | null;
};

interface Options {
  onChange?: () => void;
  silent?: boolean;
}

interface ActionResult {
  ok: boolean;
  error?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export function useInspectionAction(options: Options = {}) {
  const toast = useToast();
  const [pending, setPending] = useState<Set<string>>(new Set());

  const mark = useCallback((id: string, on: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const runAction = useCallback(
    async (
      id: string,
      action: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: Record<string, any> = {},
      successMsg?: string,
    ): Promise<ActionResult> => {
      mark(id, true);
      const silent = options.silent ?? false;
      try {
        const res = await fetch(`/api/inspections/${id}/actions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...payload }),
        });
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, "Inspection action failed");
          if (!silent) toast.error(msg);
          return { ok: false, error: msg };
        }
        const data = await res.json().catch(() => ({}));
        if (!silent && successMsg) toast.success(successMsg);
        options.onChange?.();
        return { ok: true, data };
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Inspection action failed";
        if (!silent) toast.error(msg);
        return { ok: false, error: msg };
      } finally {
        mark(id, false);
      }
    },
    [mark, options, toast],
  );

  const patch = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (id: string, data: Record<string, any>, successMsg?: string): Promise<ActionResult> => {
      mark(id, true);
      try {
        const res = await fetch(`/api/inspections/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, "Failed to update inspection");
          toast.error(msg);
          return { ok: false, error: msg };
        }
        if (successMsg) toast.success(successMsg);
        options.onChange?.();
        return { ok: true };
      } finally {
        mark(id, false);
      }
    },
    [mark, options, toast],
  );

  return {
    book: (id: string, bookedDate?: string) => runAction(id, "book", { bookedDate }, "Inspection booked"),
    pass: (
      id: string,
      opts: { certificateDocumentId?: string; passDate?: string; tickHandover?: boolean; findings?: InspectionFinding[] },
    ) => runAction(id, "pass", opts, "Inspection passed"),
    fail: (id: string, opts: { failDate?: string; notes?: string; findings?: InspectionFinding[] }) =>
      runAction(id, "fail", opts, "Inspection failed — recorded"),
    reschedule: (id: string, newDate: string) => runAction(id, "reschedule", { newDate }, "Inspection rescheduled"),
    reinspect: (id: string, newDate?: string) => runAction(id, "reinspect", { newDate }, "Re-inspection scheduled"),
    patch,
    isPending: (id: string) => pending.has(id),
    isBusy: pending.size > 0,
  };
}
