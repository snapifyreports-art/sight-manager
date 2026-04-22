"use client";

/**
 * HelpTip — a ? icon that expands into an explanation panel on click.
 *
 * Keith's feedback (Apr 2026): default copy in dialogs / buttons was too
 * wordy but removing it loses context for new users. Solution: keep
 * default copy crisp, put the long explanation behind a ? button that
 * anyone can click to get the full "what does this do / why does it
 * exist / common gotchas" view.
 *
 * Usage:
 *   <HelpTip title="About Delay Job">
 *     <p>Shifts this job and everything downstream forward by N working days.</p>
 *     <p>Reason categorises the delay on the Delay Report (weather / other).</p>
 *   </HelpTip>
 *
 * Default position is top-right of the parent (absolutely positioned).
 * Use inline={true} for a normal inline ? button in body text.
 */

import { useState, useRef, useEffect, type ReactNode } from "react";
import { HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpTipProps {
  /** Short title shown at the top of the panel, e.g. "About Pull Forward". */
  title: string;
  /** Explanation content. Prefer a few short paragraphs or a short list. */
  children: ReactNode;
  /** If true, renders inline rather than absolutely top-right. Default false. */
  inline?: boolean;
  /** Override the default top-right positioning. Only used when inline=false. */
  className?: string;
  /** Where the popover opens relative to the icon. Default "below-right". */
  anchor?: "below-right" | "below-left" | "above-right" | "above-left";
}

export function HelpTip({
  title,
  children,
  inline = false,
  className,
  anchor = "below-right",
}: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  // Close on click outside or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Anchor positioning for the popover panel.
  const panelPositionClass = {
    "below-right": "left-0 top-6",
    "below-left": "right-0 top-6",
    "above-right": "left-0 bottom-6",
    "above-left": "right-0 bottom-6",
  }[anchor];

  return (
    <span
      ref={containerRef}
      className={cn(
        "relative inline-flex items-center",
        // Default (non-inline) position: sit LEFT of the Dialog's close X
        // rather than on top of it. DialogContent renders a 28px close
        // button at right-2 top-2 — so our right-10 top-2.5 slots the ?
        // next to it with a 4px gap. (Keith Apr 2026: was overlapping
        // the X, which was "terrible" and I can't disagree.)
        !inline && "absolute right-10 top-2.5 z-20",
        className,
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          // Prevent parent forms/dialogs from interpreting the click.
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className={cn(
          // Bigger + coloured by default so it's obvious something is here
          // (Keith Apr 2026: "the ? button is far too small it needs to be
          // prominent"). Uses the blue accent family so it reads clearly
          // as a help affordance even against slate UI.
          "flex size-6 items-center justify-center rounded-full border transition-colors",
          open
            ? "border-blue-300 bg-blue-100 text-blue-700"
            : "border-blue-200 bg-blue-50 text-blue-600 hover:border-blue-300 hover:bg-blue-100 hover:text-blue-700",
        )}
        aria-label={`What is ${title}?`}
        title={`What is ${title}?`}
      >
        <HelpCircle className="size-4" />
      </button>

      {open && (
        <div
          className={cn(
            "absolute z-50 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg",
            panelPositionClass,
          )}
          role="dialog"
          aria-label={title}
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-900">{title}</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close help"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="space-y-1.5 text-[11px] leading-relaxed text-slate-600 [&_p]:my-0 [&_ul]:my-0 [&_ul]:list-disc [&_ul]:pl-4 [&_strong]:text-slate-800">
            {children}
          </div>
        </div>
      )}
    </span>
  );
}
