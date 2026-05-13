"use client";

import { useState } from "react";
import Link from "next/link";
import { BellOff, BellRing, Loader2, X } from "lucide-react";
import { usePush } from "@/lib/use-push";

/**
 * (#184) Push-notification health banner.
 *
 * Keith's rule: "this notification cannot fail — it always needs to be
 * working, or display a banner to reset if it's not". Three states
 * trigger a banner:
 *
 *   1. denied      — browser-blocked. Banner red. Link to enable in
 *                    browser settings + Notification Settings page.
 *   2. unsubscribed — permission was granted, but the active push
 *                    subscription is gone (browser cleared IndexedDB,
 *                    service worker unregistered, etc.). Amber banner
 *                    with one-tap re-subscribe button.
 *   3. prompt      — user hasn't been asked yet. Blue banner with the
 *                    same one-tap enable button.
 *
 * State "subscribed" or "unsupported" → no banner (either healthy, or
 * the browser can't do it anyway). Each banner is dismissible (per-
 * session) so the user can stop seeing it on every navigation.
 */
export function NotificationBlockedBanner() {
  const { status, subscribe } = usePush();
  const [dismissedDenied, setDismissedDenied] = useState(false);
  const [dismissedPrompt, setDismissedPrompt] = useState(false);
  const [busy, setBusy] = useState(false);

  if (status === "subscribed" || status === "unsupported" || status === "loading") {
    return null;
  }

  if (status === "denied" && !dismissedDenied) {
    return (
      <div className="flex items-center gap-3 bg-red-600 px-4 py-2 text-sm text-white">
        <BellOff className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">
          Notifications are blocked. You won&apos;t see delivery alerts, delays,
          daily briefs.{" "}
          <Link
            href="/settings?tab=notifications"
            className="font-semibold underline hover:text-red-100"
          >
            Open browser settings to allow
          </Link>
          .
        </span>
        <button
          type="button"
          onClick={() => setDismissedDenied(true)}
          className="shrink-0 rounded p-0.5 hover:bg-red-500"
          aria-label="Dismiss"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  // "unsubscribed" = permission granted but no active subscription
  // (evicted). "prompt" = never asked. Both resolve with a single
  // subscribe() call (the browser will either re-prompt or just
  // resubscribe silently if permission is already granted).
  if ((status === "unsubscribed" || status === "prompt") && !dismissedPrompt) {
    const isEvicted = status === "unsubscribed";
    return (
      <div
        className={`flex items-center gap-3 px-4 py-2 text-sm ${
          isEvicted ? "bg-amber-500 text-white" : "bg-blue-600 text-white"
        }`}
      >
        <BellRing className="size-4 shrink-0" aria-hidden />
        <span className="flex-1">
          {isEvicted
            ? "Notifications are off — your subscription has lapsed. Re-enable to keep getting alerts."
            : "Get push notifications for deliveries, delays, daily briefs and snags."}
        </span>
        <button
          type="button"
          onClick={async () => {
            setBusy(true);
            try {
              await subscribe();
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${
            isEvicted ? "bg-amber-700 hover:bg-amber-800" : "bg-blue-800 hover:bg-blue-900"
          } disabled:opacity-60`}
        >
          {busy ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Enabling…
            </span>
          ) : isEvicted ? (
            "Re-enable"
          ) : (
            "Enable"
          )}
        </button>
        <button
          type="button"
          onClick={() => setDismissedPrompt(true)}
          className="shrink-0 rounded p-0.5 hover:bg-black/10"
          aria-label="Dismiss"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    );
  }

  return null;
}
