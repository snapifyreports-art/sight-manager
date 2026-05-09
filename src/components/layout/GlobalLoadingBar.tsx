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

      {/* "Saving…" pill — top-right floating indicator. Big enough to
          be unmissable, small enough not to obstruct anything. Slides
          in from the right when active. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-[9999] transition-all duration-200"
        style={{
          opacity: active ? 1 : 0,
          transform: active ? "translateX(0)" : "translateX(20px)",
        }}
      >
        <div className="flex items-center gap-2 rounded-full border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-900 shadow-md">
          <Loader2 className="size-3.5 animate-spin text-blue-600" />
          <span>Saving…</span>
        </div>
      </div>
    </>
  );
}
