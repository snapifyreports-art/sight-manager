"use client";

/**
 * Single source of truth for the three plot-creation paths.
 *
 * Before: SiteDetailClient and CreateSiteWizard each duplicated the
 * POST logic for blank plots, template-apply single, and template-apply
 * batch. Error copy and retry behaviour drifted. The wizard's chunked
 * blank-plot parallelism lived as inline code.
 *
 * Now: one hook, three methods:
 *   - createBlank({ siteId, plotNumber, name, ... })
 *   - createFromTemplate({ siteId, templateId, startDate, ... })
 *   - createBatchFromTemplate({ siteId, templateId, plots[], ... })
 *   - createBlankBatch({ siteId, plots[] }) — chunked in groups of 3
 *     to stay under the Supabase pooled connection limit
 *
 * All methods return `{ ok, error? }` so callers can branch on success
 * without try/catch boilerplate. Toast errors surface automatically
 * unless `silent` is passed. The hook tracks a shared `isLoading`
 * flag so the caller can disable form controls while any create is
 * in flight.
 */

import { useCallback, useState } from "react";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

// Keep in sync with /api/plots/apply-template-batch's expected shape.
type SupplierMappings = Record<string, string>;

interface PlotRange {
  plotNumber: string;
  plotName: string;
  /** Optional per-plot start date (yyyy-mm-dd). When set, this plot
   *  uses its own date instead of the batch-level startDate. Added
   *  May 2026 for the per-plot stagger flow in CreateSiteWizard. */
  startDate?: string;
}

interface BlankInput {
  siteId: string;
  name: string;
  plotNumber: string | null;
  description?: string | null;
  houseType?: string | null;
}

interface TemplateSingleInput {
  siteId: string;
  templateId: string;
  /** Optional — when set, the variant's full template is applied instead of the base. */
  variantId?: string | null;
  startDate: string;
  plotName: string;
  plotNumber: string | null;
  plotDescription?: string | null;
  supplierMappings?: SupplierMappings;
}

interface TemplateBatchInput {
  siteId: string;
  templateId: string;
  variantId?: string | null;
  startDate: string;
  supplierMappings?: SupplierMappings;
  plots: PlotRange[];
}

interface BlankBatchInput {
  siteId: string;
  plots: PlotRange[];
}

interface Result {
  ok: boolean;
  error?: string;
  /** Per-plot error list (only set when batch APIs partially fail). */
  plotErrors?: Array<{ plotNumber: string; error: string }>;
  /**
   * (May 2026 Keith bug report) Per-plot warnings returned by the
   * apply-template-batch route. Currently used for
   * "order_skipped_no_supplier" warnings — populated when a template
   * order has no supplier in the template AND the wizard didn't map
   * one. Pre-fix the caller had no way to see these; orders just
   * silently disappeared.
   */
  warnings?: Record<
    string,
    Array<{ templateJobName: string; itemsDescription: string | null }>
  >;
}

interface Options {
  /** Skip the toast on error (caller will surface its own UI). */
  silent?: boolean;
}

export function usePlotCreation() {
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);

  const handleError = useCallback(async (res: Response, fallback: string, silent: boolean): Promise<Result> => {
    const error = await fetchErrorMessage(res, fallback);
    if (!silent) toast.error(error);
    // Try to parse per-plot errors for batch endpoints.
    let plotErrors: Result["plotErrors"] | undefined;
    try {
      const body = await res.clone().json();
      if (Array.isArray(body?.errors)) plotErrors = body.errors;
    } catch { /* not json */ }
    return { ok: false, error, plotErrors };
  }, [toast]);

  // ── Single blank plot ────────────────────────────────────────────────
  const createBlank = useCallback(async (input: BlankInput, opts?: Options): Promise<Result> => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/sites/${input.siteId}/plots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: input.name,
          plotNumber: input.plotNumber,
          description: input.description ?? null,
          houseType: input.houseType ?? null,
        }),
      });
      if (!res.ok) return await handleError(res, "Failed to create plot", opts?.silent ?? false);
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create plot";
      if (!opts?.silent) toast.error(msg);
      return { ok: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [handleError, toast]);

  // ── Single plot from template ────────────────────────────────────────
  const createFromTemplate = useCallback(async (input: TemplateSingleInput, opts?: Options): Promise<Result> => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/plots/apply-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: input.siteId,
          templateId: input.templateId,
          variantId: input.variantId ?? null,
          startDate: input.startDate,
          plotName: input.plotName,
          plotNumber: input.plotNumber,
          plotDescription: input.plotDescription ?? null,
          supplierMappings: input.supplierMappings ?? {},
        }),
      });
      if (!res.ok) return await handleError(res, "Failed to create plot from template", opts?.silent ?? false);
      // (May 2026 user-journey audit Bug 3) Surface _warnings the
      // route emits. Pre-fix the hook discarded the body so any
      // supplier-skip warnings on a single-plot apply silently
      // disappeared — same class of bug as the batch path.
      const body = await res.json().catch(() => ({}));
      const warnings = body?._warnings;
      if (Array.isArray(warnings) && warnings.length > 0 && !opts?.silent) {
        const preview = (warnings as Array<{ templateJobName: string; itemsDescription: string | null }>)
          .slice(0, 5)
          .map((w) => `• ${w.templateJobName}: ${w.itemsDescription || "(unnamed order)"}`)
          .join("\n");
        const extra = warnings.length > 5 ? `\n…and ${warnings.length - 5} more` : "";
        toast.error(
          `Plot created but ${warnings.length} order${warnings.length === 1 ? "" : "s"} were skipped — no supplier mapped.\n${preview}${extra}\nAssign suppliers in Settings → Templates.`,
          { ttlMs: 15000 },
        );
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create plot from template";
      if (!opts?.silent) toast.error(msg);
      return { ok: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [handleError, toast]);

  // ── Batch of plots from a single template ────────────────────────────
  const createBatchFromTemplate = useCallback(async (input: TemplateBatchInput, opts?: Options): Promise<Result> => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/plots/apply-template-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: input.siteId,
          templateId: input.templateId,
          variantId: input.variantId ?? null,
          startDate: input.startDate,
          supplierMappings: input.supplierMappings ?? {},
          plots: input.plots,
        }),
      });
      if (!res.ok) {
        const err = await handleError(res, "Failed to create plots", opts?.silent ?? false);
        // If partial failures, caller may want to surface them specifically.
        if (err.plotErrors && !opts?.silent) {
          const preview = err.plotErrors
            .slice(0, 3)
            .map((e) => `Plot ${e.plotNumber}: ${e.error}`)
            .join("; ");
          toast.error(`${err.plotErrors.length} plot${err.plotErrors.length !== 1 ? "s" : ""} failed — ${preview}`);
        }
        return err;
      }
      // (May 2026 Keith bug report) Surface order_skipped warnings to
      // the caller. Pre-fix the route returned them but the hook
      // dropped them on the floor, so the user never knew that orders
      // had been silently skipped due to missing supplier.
      const body = await res.json().catch(() => ({}));
      // (May 2026 user-journey audit Bug 2) Surface PER-PLOT errors
      // too. The route returns 201 if at least one plot succeeded
      // even when `errors[]` lists failed plots. Pre-fix the hook
      // ignored the array entirely so the wizard showed "Site
      // created!" even though half the batch failed.
      if (Array.isArray(body?.errors) && body.errors.length > 0) {
        if (!opts?.silent) {
          const preview = (body.errors as Array<{ plotNumber: string; error: string }>)
            .slice(0, 3)
            .map((e) => `Plot ${e.plotNumber}: ${e.error}`)
            .join("; ");
          toast.error(
            `${body.errors.length} plot${body.errors.length !== 1 ? "s" : ""} failed — ${preview}`,
          );
        }
        return { ok: true, warnings: body?.warnings, plotErrors: body.errors };
      }
      return { ok: true, warnings: body?.warnings };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create plots";
      if (!opts?.silent) toast.error(msg);
      return { ok: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [handleError, toast]);

  // ── Chunked batch of blank plots ─────────────────────────────────────
  // Used by CreateSiteWizard for ranges like "Plots 1-20 blank" where
  // there's no single-call batch endpoint for blank plots. Groups of 3
  // to stay inside the Supabase pooled connection limit.
  const createBlankBatch = useCallback(async (input: BlankBatchInput, opts?: Options): Promise<Result> => {
    setIsLoading(true);
    const plotErrors: Array<{ plotNumber: string; error: string }> = [];
    try {
      for (let i = 0; i < input.plots.length; i += 3) {
        const chunk = input.plots.slice(i, i + 3);
        const results = await Promise.all(
          chunk.map(async (p) => {
            const res = await fetch(`/api/sites/${input.siteId}/plots`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: p.plotName, plotNumber: p.plotNumber }),
            });
            return { p, res };
          })
        );
        for (const { p, res } of results) {
          if (!res.ok) {
            const error = await fetchErrorMessage(res, "Create failed");
            plotErrors.push({ plotNumber: p.plotNumber, error });
          }
        }
      }
      if (plotErrors.length > 0) {
        if (!opts?.silent) {
          const preview = plotErrors.slice(0, 3).map((e) => `Plot ${e.plotNumber}: ${e.error}`).join("; ");
          toast.error(`${plotErrors.length} plot${plotErrors.length !== 1 ? "s" : ""} failed — ${preview}`);
        }
        return { ok: false, error: `${plotErrors.length} plot(s) failed`, plotErrors };
      }
      return { ok: true };
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  return {
    createBlank,
    createFromTemplate,
    createBatchFromTemplate,
    createBlankBatch,
    isLoading,
  };
}
