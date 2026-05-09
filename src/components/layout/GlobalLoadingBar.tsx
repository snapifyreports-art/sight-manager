"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { subscribeInFlight } from "@/lib/global-loading";

/**
 * Global "something's happening" indicator. Two pieces:
 *
 *   1. A 3px progress bar at the top of the viewport with an
 *      indeterminate slide animation. Hard to miss but doesn't
 *      block interaction.
 *   2. A floating "Saving…" pill in the top-right that's IMPOSSIBLE
 *      to miss when something is actually being persisted. Drops
 *      after a 300ms tail so a quick burst of mutations doesn't
 *      flicker the indicator.
 *
 * Connected to the in-flight counter in `src/lib/global-loading.ts`,
 * which `patchFetchNoStore` increments for any same-origin
 * POST/PUT/PATCH/DELETE OR same-origin GET with `cache: "no-store"`.
 *
 * Keith's UX requirement (May 2026): "i'm still not seeing loading on
 * some changes when its figuring stuff out — this needs to happen and
 * be very clear because the user might think nothing is happening."
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
        // (PUT + recalc + GET-refresh) doesn't flicker the indicator
        // multiple times. 300ms is just below "did that finish?"
        // perceptual threshold but well above network jitter.
        hideTimer = setTimeout(() => setActive(false), 300);
      }
    });
  }, []);

  return (
    <>
      {/* Top-of-viewport progress bar — beefier than before so it's
          actually visible. 3px tall with a darker base + brighter
          slider. Animation kicks in only when active. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-[9999] h-[3px] overflow-hidden transition-opacity duration-200"
        style={{ opacity: active ? 1 : 0 }}
      >
        <div className="h-full bg-blue-500/20" />
        <div
          className="absolute inset-y-0 h-full w-1/3 bg-blue-600 shadow-[0_0_8px_rgba(37,99,235,0.6)]"
          style={{
            animation: active
              ? "global-loading-slide 1.1s ease-in-out infinite"
              : "none",
          }}
        />
        <style jsx>{`
          @keyframes global-loading-slide {
            0% {
              transform: translateX(-100%);
            }
            50% {
              transform: translateX(180%);
            }
            100% {
              transform: translateX(380%);
            }
          }
        `}</style>
      </div>

      {/* "Saving…" indicator — dead-centre of the viewport so it's
          impossible to miss. pointer-events-none so it doesn't block
          clicks on whatever's underneath. Soft scale-in animation
          rather than a hard pop, so it doesn't feel jarring. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-200"
        style={{ opacity: active ? 1 : 0 }}
      >
        <div
          className="flex items-center gap-3 rounded-2xl border border-blue-200 bg-white/95 px-6 py-4 text-base font-medium text-blue-900 shadow-2xl backdrop-blur-sm transition-transform duration-200"
          style={{ transform: active ? "scale(1)" : "scale(0.92)" }}
        >
          <Loader2 className="size-6 animate-spin text-blue-600" />
          {/* "Working" rather than "Saving" — the indicator fires on
              both writes AND no-store reads (post-write data refresh
              + variant context fetches), so "Saving" was misleading
              when the user was just loading data. */}
          <span>Working…</span>
        </div>
      </div>
    </>
  );
}
