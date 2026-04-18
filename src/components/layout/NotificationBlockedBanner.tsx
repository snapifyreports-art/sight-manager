"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { BellOff, X } from "lucide-react";

// Notification.permission is read-only and changes via user action outside the
// page — treat it as an external store. The browser fires "permissionchange"
// on Notification.requestPermission results; some browsers don't, so we poll
// on focus.
function subscribeNotificationPermission(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("focus", callback);
  return () => {
    window.removeEventListener("focus", callback);
  };
}
function getPermissionSnapshot(): NotificationPermission | "unavailable" {
  if (typeof Notification === "undefined") return "unavailable";
  return Notification.permission;
}
function getServerPermissionSnapshot(): NotificationPermission | "unavailable" {
  return "unavailable";
}

export function NotificationBlockedBanner() {
  const [dismissed, setDismissed] = useState(false);
  const permission = useSyncExternalStore(
    subscribeNotificationPermission,
    getPermissionSnapshot,
    getServerPermissionSnapshot
  );

  if (permission !== "denied" || dismissed) return null;

  return (
    <div className="flex items-center gap-3 bg-red-600 px-4 py-2 text-sm text-white">
      <BellOff className="size-4 shrink-0" />
      <span className="flex-1">
        Browser notifications are blocked. You won&apos;t receive alerts for deliveries, delays, or daily briefs.{" "}
        <Link
          href="/settings?tab=notifications"
          className="font-semibold underline hover:text-red-100"
        >
          Enable in browser settings
        </Link>
        {" "}then go to{" "}
        <Link href="/settings?tab=notifications" className="font-semibold underline hover:text-red-100">
          Notification Settings
        </Link>
        .
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-0.5 hover:bg-red-500"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
