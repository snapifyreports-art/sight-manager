"use client";

import { useState, useEffect, useCallback } from "react";

type PushStatus =
  | "loading"
  | "unsupported"
  | "denied"
  | "prompt"
  | "subscribed"
  | "unsubscribed";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Decide the initial status synchronously from feature detection so we don't
// have to call setState inside an effect for the "unsupported" branch.
function detectInitialStatus(): PushStatus {
  if (typeof window === "undefined") return "loading";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  return "loading";
}

export function usePush() {
  const [status, setStatus] = useState<PushStatus>(detectInitialStatus);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null
  );

  useEffect(() => {
    if (status === "unsupported") return;

    let cancelled = false;

    async function checkStatus() {
      const permission = Notification.permission;
      if (permission === "denied") {
        if (!cancelled) setStatus("denied");
        return;
      }

      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub) {
          setSubscription(sub);
          setStatus("subscribed");
        } else {
          setStatus(permission === "granted" ? "unsubscribed" : "prompt");
        }
      } catch {
        if (!cancelled) setStatus("prompt");
      }
    }

    checkStatus();
    return () => { cancelled = true; };
  }, [status]);

  const subscribe = useCallback(async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
        ),
      });

      // Send subscription to server
      const p256dh = sub.getKey("p256dh");
      const auth = sub.getKey("auth");

      if (!p256dh || !auth) {
        console.error("Missing push subscription keys");
        return;
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: sub.endpoint,
          keys: {
            p256dh: arrayBufferToBase64(p256dh),
            auth: arrayBufferToBase64(auth),
          },
          userAgent: navigator.userAgent,
        }),
      });

      if (res.ok) {
        setSubscription(sub);
        setStatus("subscribed");
      }
    } catch (err) {
      console.error("Push subscription failed:", err);
      if (Notification.permission === "denied") {
        setStatus("denied");
      }
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    if (!subscription) return;

    try {
      // Tell server to remove subscription
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });

      // Unsubscribe from push manager
      await subscription.unsubscribe();
      setSubscription(null);
      setStatus("unsubscribed");
    } catch (err) {
      console.error("Push unsubscribe failed:", err);
    }
  }, [subscription]);

  return { status, subscribe, unsubscribe };
}
