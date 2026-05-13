"use client";

import { Children, useState, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

/**
 * (#186/188/190 + May 2026 audit SM-P0-6) Action-button strip for
 * Daily Brief job rows.
 *
 * Two modes:
 *
 *   Mode A — children only (legacy / simple usage)
 *     <JobActionStrip>{buttons}</JobActionStrip>
 *     Mobile: FIRST child is always visible (this is the primary
 *     action — typically Complete / Sign Off / Mark Delivered). Any
 *     remaining children collapse behind "More ▾". Desktop: every
 *     child inline as today.
 *
 *   Mode B — primary + secondary split (explicit)
 *     <JobActionStrip primary={primary} secondary={secondary} />
 *     Mobile: primary visible always, secondary behind "More ▾".
 *     Desktop: everything inline.
 *
 * Keith's rule, May 2026: "anything that can require attention
 * shouldn't be collapsed". The audit found Mode A in actual use
 * burying Sign Off behind Actions ▾ — every Mode A caller in
 * DailySiteBrief.tsx puts the primary action first, so the same
 * "first child inline, rest collapsible" pattern as Mode B is now
 * applied to Mode A too.
 */
export function JobActionStrip({
  primary,
  secondary,
  children,
  className,
}: {
  primary?: ReactNode;
  secondary?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  // Mode detection. Mode B if EITHER primary or secondary is passed.
  // Mode A if only children.
  const isModeB = primary !== undefined || secondary !== undefined;

  // (May 2026 audit SM-P0-6) Split Mode A children into primary
  // (first child) + secondary (rest) so the highest-priority action
  // is always visible on mobile. Desktop still renders everything
  // inline so power users don't lose the at-a-glance layout.
  const childArray = isModeB ? [] : Children.toArray(children);
  const modeAPrimary = childArray[0];
  const modeASecondary = childArray.slice(1);
  const hasModeASecondary = modeASecondary.length > 0;

  return (
    <div className={`mt-1.5 border-t pt-1.5 print:hidden ${className ?? ""}`}>
      {/* Mode A — primary inline always; secondary collapses behind
          "More ▾" on mobile, inline on md+. */}
      {!isModeB && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-auto text-[10px] font-medium text-muted-foreground">
              Actions
            </span>
            {modeAPrimary}
            {hasModeASecondary && (
              <div className="hidden md:contents">{modeASecondary}</div>
            )}
            {hasModeASecondary && (
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
          {hasModeASecondary && open && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 md:hidden [&>*]:w-full">
              {modeASecondary}
            </div>
          )}
        </>
      )}

      {/* Mode B — primary always visible; secondary collapses behind
          "More ▾" on mobile, inline on md+. */}
      {isModeB && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-auto text-[10px] font-medium text-muted-foreground">
              Actions
            </span>
            {primary}
            {secondary && (
              <div className="hidden md:contents">{secondary}</div>
            )}
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
          {secondary && open && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 md:hidden [&>*]:w-full">
              {secondary}
            </div>
          )}
        </>
      )}
    </div>
  );
}
