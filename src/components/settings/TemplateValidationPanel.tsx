"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, AlertCircle, ChevronDown, ChevronRight, Check } from "lucide-react";
import {
  validateTemplate,
  summariseIssues,
  type TemplateIssue,
} from "@/lib/template-validation";
import type { TemplateData } from "./types";

/**
 * Shows validation issues for a template inline in the editor.
 *
 * Collapsed by default if there are no issues — a green "looks good"
 * pill that takes up almost no vertical space. Auto-expands the first
 * time errors appear so users notice (subsequent renders preserve
 * whatever the user set explicitly).
 *
 * Materials + documents counts are fetched separately (they don't ride
 * along with the template payload) so completeness checks for "no
 * drawings" / "no quants" can fire as warnings.
 */
export function TemplateValidationPanel({
  template,
}: {
  template: TemplateData;
}) {
  const tplBaseId = template.templateId ?? template.id;
  const variantId = template.variantId ?? null;
  const variantQ = variantId ? `?variantId=${variantId}` : "";

  const [materialCount, setMaterialCount] = useState<number | undefined>(
    undefined,
  );
  const [documentCount, setDocumentCount] = useState<number | undefined>(
    undefined,
  );

  // Fetch counts on mount + when scope changes. The /materials and
  // /documents endpoints already exist and are cheap (just rows in
  // the template's scope).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/plot-templates/${tplBaseId}/materials${variantQ}`, {
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/plot-templates/${tplBaseId}/documents${variantQ}`, {
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : [])),
    ]).then(([mats, docs]) => {
      if (cancelled) return;
      setMaterialCount(Array.isArray(mats) ? mats.length : 0);
      setDocumentCount(Array.isArray(docs) ? docs.length : 0);
    });
    return () => {
      cancelled = true;
    };
  }, [tplBaseId, variantQ]);

  const issues = useMemo(
    () =>
      validateTemplate(template, {
        materialCount,
        documentCount,
      }),
    [template, materialCount, documentCount],
  );
  const { errorCount, warningCount } = summariseIssues(issues);
  const total = issues.length;

  // Default expanded only when there's something to look at AND it's
  // an error. Warnings stay collapsed by default so the panel doesn't
  // dominate.
  const [open, setOpen] = useState(errorCount > 0);

  // (May 2026 audit #27) Re-expand whenever errors transition from 0
  // → >0 so silent regressions don't hide. Pre-fix the panel was
  // useState(errorCount > 0) on first render only — fix the errors,
  // introduce new ones, and the panel stayed collapsed.
  const [prevErrorCount, setPrevErrorCount] = useState(errorCount);
  useEffect(() => {
    if (prevErrorCount === 0 && errorCount > 0) {
      setOpen(true);
    }
    setPrevErrorCount(errorCount);
  }, [errorCount, prevErrorCount]);

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
        <Check className="size-4 text-emerald-600" />
        <span className="font-medium">Template looks good</span>
        <span className="text-emerald-700/80">— no issues detected.</span>
      </div>
    );
  }

  const headerColour =
    errorCount > 0
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-900";
  const Icon = errorCount > 0 ? AlertCircle : AlertTriangle;
  const summary = [
    errorCount > 0 ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : null,
    warningCount > 0
      ? `${warningCount} warning${warningCount === 1 ? "" : "s"}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className={`rounded-lg border ${headerColour}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs"
        aria-expanded={open}
      >
        <Icon
          className={`size-4 shrink-0 ${errorCount > 0 ? "text-red-600" : "text-amber-600"}`}
        />
        <span className="font-medium">Template needs attention</span>
        <span className="opacity-80">— {summary}</span>
        <span className="ml-auto opacity-70">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </span>
      </button>

      {open && (
        <ul className="space-y-1 border-t border-current/10 px-3 py-2 text-xs">
          {issues.map((issue, i) => (
            <IssueRow key={i} issue={issue} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: TemplateIssue }) {
  const isError = issue.severity === "error";
  const Icon = isError ? AlertCircle : AlertTriangle;
  const [expanded, setExpanded] = useState(false);
  const hasItems = !!(issue.affectedItems && issue.affectedItems.length > 0);

  return (
    <li className={isError ? "text-red-900" : "text-amber-900"}>
      <div className="flex items-start gap-2">
        <Icon
          className={`mt-0.5 size-3.5 shrink-0 ${isError ? "text-red-600" : "text-amber-600"}`}
        />
        <div className="flex flex-1 flex-wrap items-baseline gap-x-2">
          <span className="flex-1">{issue.message}</span>
          {hasItems && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
              className="shrink-0 rounded border border-current/30 bg-white/60 px-2 py-0.5 text-[11px] font-medium hover:bg-white"
            >
              {expanded ? "Hide" : `Show ${issue.affectedItems!.length}`}
            </button>
          )}
          {issue.action && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // Cross-component dispatch — TemplateEditor handles the
                // "open-*-table" / "scroll-to-jobs" / "edit-*" cases,
                // TemplateExtras handles "add-material" / "upload-drawing".
                window.dispatchEvent(
                  new CustomEvent("template-action", {
                    detail: { kind: issue.action!.kind },
                  }),
                );
              }}
              className="shrink-0 rounded border border-current/30 bg-white/60 px-2 py-0.5 text-[11px] font-medium hover:bg-white"
            >
              {issue.action.label} →
            </button>
          )}
        </div>
      </div>
      {hasItems && expanded && (
        <ul className="ml-5 mt-1 max-h-[280px] space-y-0.5 overflow-y-auto rounded border border-current/20 bg-white/40 p-1.5">
          {issue.affectedItems!.map((it) => (
            <li key={it.itemId}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  window.dispatchEvent(
                    new CustomEvent("template-action", {
                      detail: {
                        kind: it.kind,
                        itemId: it.itemId,
                        jobId: it.jobId,
                      },
                    }),
                  );
                }}
                className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-0.5 text-left text-[11px] hover:bg-white"
              >
                <span className="truncate">{it.label}</span>
                <span className="shrink-0 text-muted-foreground">Edit →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
