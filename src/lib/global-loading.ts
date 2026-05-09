/**
 * Tiny in-flight-fetch counter so a global progress indicator (the
 * `<GlobalLoadingBar />` rendered in the root layout) can flash whenever
 * the app is talking to the server.
 *
 * Why: Keith's feedback (May 2026) — "you don't have a clue if something's
 * being adjusted or not so you think it's broken and 10 seconds later it
 * does something. Is there a way to do this globally?". This is the way.
 *
 * Usage:
 *   - patchFetchNoStore (in lib/patch-fetch.ts) increments + decrements
 *     the counter on every same-origin fetch automatically.
 *   - GlobalLoadingBar subscribes and renders a thin bar at the top of
 *     the viewport whenever count > 0.
 *   - Mutations that don't go through window.fetch (e.g. websocket,
 *     XHR — none in this codebase today) would need to call
 *     trackInFlight()() manually. We don't have any of those, so the
 *     fetch patch covers everything.
 *
 * Only counts MUTATIONS (POST/PUT/PATCH/DELETE) — pure GETs would make
 * the bar flash for every page navigation/poll, which is just visual
 * noise. The "is something happening I should worry about" signal the
 * user actually cares about is "is my edit being saved".
 */

const subscribers = new Set<(count: number) => void>();
let inFlight = 0;

export function trackInFlight(): () => void {
  inFlight += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    inFlight = Math.max(0, inFlight - 1);
    emit();
  };
}

export function getInFlight(): number {
  return inFlight;
}

export function subscribeInFlight(fn: (count: number) => void): () => void {
  subscribers.add(fn);
  fn(inFlight);
  return () => {
    subscribers.delete(fn);
  };
}

function emit() {
  for (const fn of subscribers) {
    try {
      fn(inFlight);
    } catch {
      // Subscriber threw — ignore, keep notifying others.
    }
  }
}
