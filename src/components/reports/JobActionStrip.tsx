"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";

/**
 * (#186/188/190) Action-button strip for Daily Brief job rows.
 *
 * Two modes:
 *
 *   Mode A — children only (legacy / simple usage)
 *     <JobActionStrip>{buttons}</JobActionStrip>
 *     Mobile: collapsed behind "Actions ▾" tap target. Tap expands a
 *     2-col grid below.
 *     Desktop: inline as today.
 *
 *   Mode B — primary + secondary split (new)
 *     <JobActionStrip primary={primary} secondary={secondary} />
 *     Mobile: primary visible always, secondary behind "More ▾".
 *     Desktop: everything inline.
 *
 * Keith's rule, May 2026: "anything that can require attention
 * shouldn't be collapsed". Mode B is for rows with one URGENT
 * forward-state action (Complete, Sign Off, Mark Delivered) — that
 * action must be one tap away. Mode A is for rows where every action
 * is roughly equal priority.
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

  return (
    <div className={`mt-1.5 border-t pt-1.5 print:hidden ${className ?? ""}`}>
      {/* Mobile header — toggle bar */}
      {!isModeB && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between gap-2 rounded-md text-left text-[12px] font-medium text-muted-foreground hover:text-foreground md:hidden"
          aria-expanded={open}
        >
          <span>Actions</span>
          <ChevronDown
            className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>
      )}

      {/* Mode A — desktop inline. Mobile: only shown when open. */}
      {!isModeB && (
        <>
          <div className="hidden md:flex md:flex-wrap md:items-center md:gap-1">
            <span className="mr-auto text-[10px] font-medium text-muted-foreground">
              Actions
            </span>
            {children}
          </div>
          {open && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 md:hidden [&>*]:w-full">
              {children}
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
