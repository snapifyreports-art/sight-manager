/**
 * Patch the global fetch to:
 *
 *   1. Always use cache: "no-store" for same-origin API requests, so
 *      browser-cached responses don't show stale data.
 *   2. Bump a shared "in-flight mutation" counter for any same-origin
 *      POST/PUT/PATCH/DELETE so the global loading bar can flash.
 *      GETs are excluded — every page navigation triggers GETs and
 *      we don't want the bar twitching constantly. The signal the
 *      user wants is "is my edit landing?" not "is the page polling?".
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

    const shouldTrack = isSameOrigin && MUTATING_METHODS.has(method);
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
