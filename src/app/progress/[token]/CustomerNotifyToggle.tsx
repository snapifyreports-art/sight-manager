"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

/**
 * (May 2026 audit #196) Customer push subscribe button on the public
 * progress page. No external dependencies — uses the existing /sw.js
 * service worker and the public VAPID key. Posts subscribe / unsub
 * to /api/progress/[token]/push-subscribe.
 *
 * States:
 *   - unsupported  → not rendered
 *   - denied       → not rendered (we don't beg)
 *   - prompt       → button: "Get progress notifications"
 *   - subscribed   → button: "Notifications on" with toggle to off
 */

type State = "loading" | "unsupported" | "denied" | "prompt" | "subscribed";

function b64ToUint8(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const norm = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(norm);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufToB64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return window.btoa(bin);
}

// (May 2026 audit O-P0) VAPID key is a build-time env var — read once
// at module load. If it's missing, the toggle can't possibly work
// (the /api/.../push-subscribe round-trip would silently no-op
// because the server can't sign anything). Hide the button entirely
// rather than rendering a "Get progress notifications" prompt that
// looks broken when the buyer taps it.
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function CustomerNotifyToggle({ token }: { token: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setState("unsupported");
      return;
    }
    // (May 2026 audit O-P0) Without the public VAPID key the button
    // can't trigger a real subscription — treat as unsupported.
    if (!VAPID_PUBLIC_KEY) {
      setState("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }

    // Register the existing /sw.js — same file the dashboard app uses.
    void (async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setState(sub ? "subscribed" : "prompt");
      } catch {
        setState("prompt");
      }
    })();
  }, []);

  async function subscribe() {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "prompt");
        return;
      }
      if (!VAPID_PUBLIC_KEY) {
        // Belt-and-braces — by this point the useEffect should have
        // already short-circuited to "unsupported", so this branch
        // is unreachable. Kept for defensive symmetry.
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // TS's modern Uint8Array typing is stricter than the
        // PushSubscriptionOptionsInit signature; the runtime accepts
        // the Uint8Array fine.
        applicationServerKey: b64ToUint8(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
      const sj = sub.toJSON();
      // (May 2026 pattern sweep) Pre-fix the POST result was ignored.
      // A 4xx / 5xx left the browser subscribed (the push registration
      // happened locally) while the server had no record — so the
      // toggle flipped to "Notifications on" but no push notifications
      // ever arrived. Now: if the server rejects, unsubscribe locally
      // so the next attempt starts from a clean slate, and surface a
      // browser alert (this is the public buyer page — no in-app
      // toast system available here).
      const res = await fetch(`/api/progress/${token}/push-subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: sj.keys?.p256dh ?? bufToB64(sub.getKey("p256dh")!),
            auth: sj.keys?.auth ?? bufToB64(sub.getKey("auth")!),
          },
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        await sub.unsubscribe().catch(() => {});
        setState("prompt");
        alert("Couldn't enable notifications — please try again.");
        return;
      }
      setState("subscribed");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    if (busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // (May 2026 pattern sweep) Best-effort tell the server, but
        // even if the server is down we still unsubscribe locally —
        // the buyer's intent was to turn off push, and a stranded
        // server row will be GC'd on the next failed delivery.
        const res = await fetch(`/api/progress/${token}/push-subscribe`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => null);
        if (res && !res.ok) {
          // Log + carry on — local unsubscribe still happens below.
          console.warn("Server push-unsubscribe rejected", res.status);
        }
        await sub.unsubscribe();
      }
      setState("prompt");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported") {
    return null;
  }

  // (May 2026 audit O-P1) Render an explainer line when the browser
  // permission has been DENIED. Pre-fix the toggle just disappeared
  // when denied — buyer thought the button was broken with no
  // direction on what to do. Now they see a one-line message
  // pointing them at browser settings.
  if (state === "denied") {
    return (
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
        <BellOff className="size-3.5" aria-hidden />
        Notifications blocked — re-enable in your browser settings to get
        updates.
      </p>
    );
  }

  const subscribed = state === "subscribed";
  return (
    <button
      type="button"
      onClick={subscribed ? unsubscribe : subscribe}
      disabled={busy}
      aria-label={
        subscribed
          ? "Turn off progress notifications"
          : "Get progress notifications"
      }
      className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        subscribed
          ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
          : "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
      }`}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : subscribed ? (
        <Bell className="size-3.5 fill-current" aria-hidden />
      ) : (
        <BellOff className="size-3.5" aria-hidden />
      )}
      {subscribed ? "Notifications on" : "Get progress notifications"}
    </button>
  );
}
