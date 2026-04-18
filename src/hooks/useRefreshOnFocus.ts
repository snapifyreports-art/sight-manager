"use client";

import { useEffect, useRef } from "react";

/**
 * Auto-refresh data when:
 * 1. Browser tab regains focus
 * 2. User navigates back (popstate / browser back button)
 * 3. Page becomes visible again
 *
 * Prevents refresh if triggered less than `minInterval` ms ago.
 */
export function useRefreshOnFocus(
  refreshFn: () => void,
  minInterval = 5000 // 5 seconds minimum between refreshes
) {
  // Initialise to 0; useEffect sets them to Date.now() after mount.
  // We can't call Date.now() during render — it's impure and triggers
  // react-hooks/purity warnings under React 19.
  const lastRefresh = useRef(0);
  const mountTime = useRef(0);

  useEffect(() => {
    const mountedAt = Date.now();
    mountTime.current = mountedAt;
    lastRefresh.current = mountedAt;

    const handleRefresh = () => {
      const now = Date.now();
      // Don't fire within 2s of mount (prevents race with initial interactions)
      if (now - mountTime.current < 2000) return;
      if (now - lastRefresh.current >= minInterval) {
        lastRefresh.current = now;
        refreshFn();
      }
    };

    // Tab focus
    window.addEventListener("focus", handleRefresh);

    // Visibility change (tab switch)
    const handleVisibility = () => {
      if (document.visibilityState === "visible") handleRefresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Browser back/forward navigation
    window.addEventListener("popstate", handleRefresh);

    // Next.js client-side navigation (pageshow fires on bfcache restore)
    window.addEventListener("pageshow", handleRefresh);

    return () => {
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("popstate", handleRefresh);
      window.removeEventListener("pageshow", handleRefresh);
    };
  }, [refreshFn, minInterval]);
}
