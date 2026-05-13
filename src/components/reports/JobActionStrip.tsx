"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

/**
 * (#186/188) Action-button strip for Daily Brief job rows.
 *
 * Three-way split, so attention-needing primary actions are NEVER
 * hidden but the long tail of secondary actions doesn't drown the
 * mobile UI:
 *
 *   - primary  → always visible (Complete, Sign Off, Mark Delivered…
 *                anything that takes a job FORWARD in its lifecycle).
 *   - secondary → on md+ inline alongside primary; on mobile collapsed
 *                 behind a "More ▾" disclosure button.
 *
 * Keith's rule, May 2026: "anything that can require attention
 * shouldn't be collapsed". Primary actions resolve a state — they
 * must be one tap away.
 *
 * For full-strip cases that don't have a primary action (e.g. a job
 * card showing only Note / Photos / Snag) pass `primary={null}` and
 * the secondary collapse takes the whole strip.
 */
export function JobActionStrip({
  primary,
  secondary,
  children,
  className,
}: {
  /** Primary buttons — always visible. Pass null for none. */
  primary?: ReactNode;
  /** Secondary buttons — collapses on mobile under "More". */
  secondary?: ReactNode;
  /** Backwards-compat: if no primary/secondary split is provided,
   *  children render as primary (always visible). Newer callers should
   *  pass primary + secondary explicitly. */
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // If caller didn't split, treat children as primary so existing
  // usages still render their full action set inline.
  const effectivePrimary = primary !== undefined ? primary : children;

  return (
    <div className={`mt-1.5 border-t pt-1.5 print:hidden ${className ?? ""}`}>
      {/* Label + primary row (mobile + desktop) */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-auto text-[10px] font-medium text-muted-foreground">
          Actions
        </span>
        {effectivePrimary}
        {/* Secondary inline on desktop only */}
        {secondary && (
          <div className="hidden md:contents">{secondary}</div>
        )}
        {/* Mobile "More" toggle — only renders if there's something to
            hide behind it. */}
        {secondary && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-600 hover:bg-slate-50 md:hidden"
          >
            <MoreHorizontal className="size-3.5" aria-hidden />
            More
            <ChevronDown
              className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        )}
      </div>

      {/* Mobile expanded secondary buttons — 2-col full-width grid. */}
      {secondary && open && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 md:hidden [&>*]:w-full">
          {secondary}
        </div>
      )}
    </div>
  );
}
