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
  const lastRefresh = useRef(Date.now());
  const mountTime = useRef(Date.now());

  useEffect(() => {
    mountTime.current = Date.now();

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
