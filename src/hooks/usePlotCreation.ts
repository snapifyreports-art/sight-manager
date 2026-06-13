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
  /** How many plots were actually created (chunked batch path). */
  created?: number;
  /** Plot numbers skipped because they already existed (idempotent retry). */
  skippedExisting?: string[];
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
  /**
   * Progress callback for chunked batch creation — fired after each chunk
   * of plots is attempted. `done` is how many plots have been processed so
   * far (created + skipped + failed), `total` is the batch size. Lets the
   * wizard / bulk dialog show "Creating plots… 60/249" instead of a frozen
   * spinner on a multi-minute large-site build. (Jun 2026 Keith 504 report)
   */
  onProgress?: (done: number, total: number) => void;
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
      // (Jun 2026 S16) Inspection defs that could not be instantiated
      // (anchor stage missing or undated) — a silently-absent statutory
      // hold-point is the worst kind of skip, so shout about it.
      const inspWarnings = body?._inspectionWarnings;
      if (Array.isArray(inspWarnings) && inspWarnings.length > 0 && !opts?.silent) {
        toast.error(
          `Plot created but ${inspWarnings.length} inspection${inspWarnings.length === 1 ? "" : "s"} could not be scheduled (anchor stage missing or undated): ${inspWarnings.slice(0, 4).join(", ")}${inspWarnings.length > 4 ? "…" : ""}. Add them manually from the plot's Overview tab.`,
          { ttlMs: 15000 },
        );
      }
      // (Jun 2026 audit) Placeholder drawings (cloned templates) are not
      // copied — tell the user which ones need re-uploading on the template.
      const docWarnings = body?._documentWarnings;
      if (Array.isArray(docWarnings) && docWarnings.length > 0 && !opts?.silent) {
        toast.error(
          `Plot created but ${docWarnings.length} drawing${docWarnings.length === 1 ? "" : "s"} were not copied (placeholder — file never re-uploaded after clone): ${docWarnings.slice(0, 4).join(", ")}${docWarnings.length > 4 ? "…" : ""}. Re-upload them in Settings → Templates.`,
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

  // ── Batch of plots from a single template (CHUNKED) ──────────────────
  // (Jun 2026 Keith 504 report) A large site (e.g. 249 plots) used to send
  // EVERY plot in one request to apply-template-batch — a single serverless
  // invocation that ran far past Vercel's function timeout and returned a
  // 504, failing the whole batch. We now split the batch into small chunks
  // and send one request per chunk, accumulating results and reporting
  // progress. Because the endpoint now SKIPS plots that already exist, a
  // chunk that times out / drops can be safely re-sent (the wizard's retry
  // re-runs the batch): the plots that already landed are skipped server-
  // side, only the missing ones are created. No duplicates, no dead end.
  const createBatchFromTemplate = useCallback(async (input: TemplateBatchInput, opts?: Options): Promise<Result> => {
    setIsLoading(true);
    // Template plots are heavy — each plot is its full job tree + orders +
    // inspections + materials + documents, each in its own DB transaction.
    // Keep chunks small so one request stays comfortably inside the 60s
    // function limit even for a 20-stage template with many orders per plot.
    const CHUNK_SIZE = 10;
    const total = input.plots.length;
    let createdCount = 0;
    let processed = 0;
    let failedPlotCount = 0;
    const plotErrors: Array<{ plotNumber: string; error: string }> = [];
    const skippedExisting: string[] = [];
    const warningsAcc: Record<
      string,
      Array<{ templateJobName: string; itemsDescription: string | null }>
    > = {};
    const inspWarningsAcc = new Set<string>();
    const docWarningsAcc = new Set<string>();
    // First HTTP-level failure (timeout / network / 5xx) — the retryable
    // kind, as opposed to per-plot data errors which re-sending won't fix.
    let firstChunkError: string | null = null;

    try {
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = input.plots.slice(i, i + CHUNK_SIZE);
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
              plots: chunk,
            }),
          });
          if (!res.ok) {
            const error = await fetchErrorMessage(res, "Failed to create plots");
            failedPlotCount += chunk.length;
            if (!firstChunkError) firstChunkError = error;
          } else {
            const body = await res.json().catch(() => ({}));
            if (typeof body?.created === "number") createdCount += body.created;
            if (Array.isArray(body?.errors)) {
              for (const e of body.errors) plotErrors.push(e);
            }
            if (Array.isArray(body?.skippedExisting)) {
              for (const n of body.skippedExisting) skippedExisting.push(n);
            }
            if (body?.warnings && typeof body.warnings === "object") {
              Object.assign(warningsAcc, body.warnings);
            }
            if (Array.isArray(body?.inspectionWarnings)) {
              for (const w of body.inspectionWarnings) inspWarningsAcc.add(w);
            }
            if (Array.isArray(body?.documentWarnings)) {
              for (const w of body.documentWarnings) docWarningsAcc.add(w);
            }
          }
        } catch (e) {
          failedPlotCount += chunk.length;
          if (!firstChunkError) {
            firstChunkError = e instanceof Error ? e.message : "Network error";
          }
        }
        processed += chunk.length;
        opts?.onProgress?.(processed, total);
      }

      // Surface accumulated warnings ONCE (not once per chunk).
      if (!opts?.silent && inspWarningsAcc.size > 0) {
        const list = [...inspWarningsAcc];
        toast.error(
          `Plots created but ${list.length} inspection${list.length === 1 ? "" : "s"} could not be scheduled (anchor stage missing or undated): ${list.slice(0, 4).join(", ")}${list.length > 4 ? "…" : ""}. Add them manually from each plot's Overview tab.`,
          { ttlMs: 15000 },
        );
      }
      if (!opts?.silent && docWarningsAcc.size > 0) {
        const list = [...docWarningsAcc];
        toast.error(
          `Plots created but ${list.length} drawing${list.length === 1 ? "" : "s"} were not copied (placeholder — file never re-uploaded after clone): ${list.slice(0, 4).join(", ")}${list.length > 4 ? "…" : ""}. Re-upload them in Settings → Templates.`,
          { ttlMs: 15000 },
        );
      }

      const warnings = Object.keys(warningsAcc).length > 0 ? warningsAcc : undefined;

      // A chunk failed at the HTTP level → the batch is incomplete but
      // retryable. Report not-ok so the caller keeps its retry affordance;
      // re-running skips whatever already landed (idempotent endpoint).
      if (firstChunkError) {
        const msg = `${failedPlotCount} plot${failedPlotCount === 1 ? "" : "s"} didn't finish (${firstChunkError}). ${createdCount} created so far — press Create again to make the rest.`;
        if (!opts?.silent) toast.error(msg, { ttlMs: 15000 });
        return { ok: false, error: msg, created: createdCount, skippedExisting, plotErrors };
      }

      // Per-plot DATA errors (not retryable by re-sending the same data).
      if (plotErrors.length > 0) {
        if (!opts?.silent) {
          const preview = plotErrors
            .slice(0, 3)
            .map((e) => `Plot ${e.plotNumber}: ${e.error}`)
            .join("; ");
          toast.error(
            `${plotErrors.length} plot${plotErrors.length !== 1 ? "s" : ""} failed — ${preview}`,
          );
        }
        return { ok: true, warnings, plotErrors, created: createdCount, skippedExisting };
      }

      return { ok: true, warnings, created: createdCount, skippedExisting };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create plots";
      if (!opts?.silent) toast.error(msg);
      return { ok: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

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
