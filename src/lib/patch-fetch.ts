/**
 * Patch the global fetch to:
 *
 *   1. Always use cache: "no-store" for same-origin API requests, so
 *      browser-cached responses don't show stale data.
 *   2. Bump a shared "in-flight" counter for any same-origin request
 *      that's part of a "save chain" — POST/PUT/PATCH/DELETE OR a GET
 *      with explicit `cache: "no-store"`. Routine page-navigation GETs
 *      (which don't override cache) are excluded so the loading bar
 *      doesn't twitch constantly during normal browsing.
 *
 * Why no-store GETs count: after a save, the editor refreshes its
 * data with `fetch(url, { cache: "no-store" })`. The user is still
 * waiting at that point — the bar should remain visible until that
 * refresh completes. Pre May-2026, those GETs weren't tracked and
 * the indicator went silent during the 100-500ms refresh phase,
 * making it look like nothing was happening.
 *
 * Call once in a client-side provider at the app root.
 */
import { trackInFlight } from "@/lib/global-loading";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function patchFetchNoStore() {
  if (typeof window === "undefined") return;

  const originalFetch = window.fetch;

  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    // Resolve URL + method for both string + URL + Request inputs.
    let url = "";
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.href;
    else if (input instanceof Request) url = input.url;

    const method = (
      init?.method ??
      (input instanceof Request ? input.method : "GET")
    ).toUpperCase();

    const isSameOrigin =
      url.startsWith("/") ||
      url.startsWith(window.location.origin);

    const isMutation = MUTATING_METHODS.has(method);
    // Caller explicitly asked for fresh data — almost always part of a
    // save chain (post-save reload). Worth tracking so the indicator
    // stays visible during the data-refresh phase too.
    const isExplicitNoStore =
      method === "GET" &&
      (init?.cache === "no-store" ||
        (input instanceof Request && input.cache === "no-store"));

    const shouldTrack = isSameOrigin && (isMutation || isExplicitNoStore);
    const release = shouldTrack ? trackInFlight() : null;

    try {
      if (isSameOrigin && !init?.cache) {
        return await originalFetch(input, { ...init, cache: "no-store" });
      }
      return await originalFetch(input, init);
    } finally {
      release?.();
    }
  };
}
