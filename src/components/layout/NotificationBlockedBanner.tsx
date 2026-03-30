"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellOff, X } from "lucide-react";

export function NotificationBlockedBanner() {
  const [blocked, setBlocked] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only check if the Notification API is available and permission has been explicitly denied
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") {
      setBlocked(true);
    }
  }, []);

  if (!blocked || dismissed) return null;

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
        <Link href="/settings" className="font-semibold underline hover:text-red-100">
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
