"use client";

import { useEffect, useState } from "react";
import { subscribeInFlight } from "@/lib/global-loading";

/**
 * Thin top-of-viewport progress bar that flashes whenever any same-origin
 * POST/PUT/PATCH/DELETE is in flight. Connected to the counter in
 * `src/lib/global-loading.ts`, which `patchFetchNoStore` increments
 * automatically.
 *
 * Keith's UX feedback (May 2026): "you don't have a clue if something's
 * being adjusted or not so you think it's broken and 10 seconds later
 * it does something". Bar makes the latency visible.
 *
 * Visual: 2px-tall blue bar with an indeterminate slide animation. We
 * fade to invisible 200ms after the last mutation completes so a quick
 * burst of mutations doesn't flicker — the bar settles smoothly.
 */
export function GlobalLoadingBar() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    return subscribeInFlight((count) => {
      if (count > 0) {
        if (hideTimer) {
          clearTimeout(hideTimer);
          hideTimer = null;
        }
        setActive(true);
      } else {
        // Wait a beat before hiding so a burst of small mutations
        // (e.g. saving a sub-job duration which fires PUT + recalc + GET)
        // doesn't flicker the bar three times. The 200ms tail is below
        // perceptual threshold for a "did that finish?" signal.
        hideTimer = setTimeout(() => setActive(false), 200);
      }
    });
  }, []);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-0.5 overflow-hidden transition-opacity duration-200"
      style={{ opacity: active ? 1 : 0 }}
    >
      <div className="h-full bg-blue-500/15" />
      <div
        className="absolute inset-y-0 h-full w-1/3 bg-blue-500"
        style={{
          animation: active
            ? "global-loading-slide 1.1s ease-in-out infinite"
            : "none",
        }}
      />
      <style jsx>{`
        @keyframes global-loading-slide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(180%); }
          100% { transform: translateX(380%); }
        }
      `}</style>
    </div>
  );
}
