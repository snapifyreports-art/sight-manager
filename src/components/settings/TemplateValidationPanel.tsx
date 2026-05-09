"use client";

import { useMemo, useState } from "react";
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
 */
export function TemplateValidationPanel({
  template,
}: {
  template: TemplateData;
}) {
  const issues = useMemo(() => validateTemplate(template), [template]);
  const { errorCount, warningCount } = summariseIssues(issues);
  const total = issues.length;

  // Default expanded only when there's something to look at AND it's
  // an error. Warnings stay collapsed by default so the panel doesn't
  // dominate.
  const [open, setOpen] = useState(errorCount > 0);

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
  return (
    <li className="flex items-start gap-2">
      <Icon
        className={`mt-0.5 size-3.5 shrink-0 ${isError ? "text-red-600" : "text-amber-600"}`}
      />
      <span className={isError ? "text-red-900" : "text-amber-900"}>
        {issue.message}
      </span>
    </li>
  );
}
