"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * (#186) Action-button strip wrapper for Daily Brief job rows.
 *
 * On mobile a Daily Brief job card can carry up to six action buttons
 * (Extend, Complete, Sign Off, Snag, Note, Photos…). They wrap across
 * two rows of awkward right-aligned chips — visually overwhelming and
 * the user isn't always there to take an action. Keith asked for a
 * dropdown/collapsable.
 *
 * Behaviour:
 *   - md+:  always expanded, inline row (current desktop look).
 *   - mobile: collapsed by default. A single "Actions ▾" tap-target
 *     expands the buttons in a wrap-friendly grid below the header.
 *
 * Caller passes the action buttons as children; the strip handles the
 * collapsed vs expanded chrome.
 */
export function JobActionStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`mt-1.5 border-t pt-1.5 print:hidden ${className ?? ""}`}>
      {/* Mobile header — toggles open/closed. */}
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

      {/* Desktop label — unchanged. */}
      <div className="hidden md:flex md:flex-wrap md:items-center md:gap-1">
        <span className="mr-auto text-[10px] font-medium text-muted-foreground">
          Actions
        </span>
        {children}
      </div>

      {/* Mobile expanded buttons — 2-col grid; each button stretches
          to fill its cell via `[&>*]:w-full` so they're consistently
          sized and tap-friendly, instead of awkward auto-width chips
          right-aligned with whitespace gaps. */}
      {open && (
        <div className="mt-2 grid grid-cols-2 gap-1.5 md:hidden [&>*]:w-full">
          {children}
        </div>
      )}
    </div>
  );
}
