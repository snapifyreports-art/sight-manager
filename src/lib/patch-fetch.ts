/**
 * Patch the global fetch to always use cache: "no-store" for same-origin API requests.
 * This prevents stale browser-cached responses from showing outdated data.
 *
 * Call this once in a client-side provider at the app root.
 */
export function patchFetchNoStore() {
  if (typeof window === "undefined") return;

  const originalFetch = window.fetch;

  window.fetch = function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
    // Only patch same-origin requests (relative URLs or same host)
    let url = "";
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.href;
    else if (input instanceof Request) url = input.url;

    const isSameOrigin =
      url.startsWith("/") ||
      url.startsWith(window.location.origin);

    if (isSameOrigin && !init?.cache) {
      return originalFetch(input, { ...init, cache: "no-store" });
    }

    return originalFetch(input, init);
  };
}
