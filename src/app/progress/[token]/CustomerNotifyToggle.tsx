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
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        // Server config missing — fail silently rather than show an
        // error to a customer who doesn't know what VAPID means.
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // TS's modern Uint8Array typing is stricter than the
        // PushSubscriptionOptionsInit signature; the runtime accepts
        // the Uint8Array fine.
        applicationServerKey: b64ToUint8(vapidKey) as unknown as BufferSource,
      });
      const sj = sub.toJSON();
      await fetch(`/api/progress/${token}/push-subscribe`, {
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
        await fetch(`/api/progress/${token}/push-subscribe`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("prompt");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading" || state === "unsupported" || state === "denied") {
    return null;
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
