"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

/**
 * (#183) Per-user "mute notifications for this site" toggle.
 *
 * Default state: every user with access to a site is subscribed to
 * its notifications automatically. This toggle MUTES — clicking it
 * adds a row to WatchedSite to mean "user has muted this site".
 * Clicking again deletes the row to unmute.
 *
 * Previously this was an opt-IN star ("Watch"). Result: notifications
 * silently never reached anyone who hadn't toggled it on. Now it's
 * opt-OUT (a bell) and the default = on for everyone with access.
 *
 * The component name `WatchToggle` is kept for diff cleanliness;
 * conceptually it's now a notification mute toggle. Server-side the
 * WatchedSite row's meaning has been flipped too — see
 * sendPushToSiteAudience in src/lib/push.ts.
 */
export function WatchToggle({
  siteId,
  siteName,
}: {
  siteId: string;
  siteName: string;
}) {
  // muted = true when a WatchedSite row exists. The /watch GET still
  // returns `{ watching }` for compatibility; we read it as "muted".
  const [muted, setMuted] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sites/${siteId}/watch`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && typeof data?.watching === "boolean") {
          setMuted(data.watching);
        }
      })
      .catch(() => {
        // Silent — toggle stays in its initial state and the click
        // handler will surface any real error.
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const toggle = async () => {
    if (pending) return;
    const next = !muted;
    setPending(true);
    setMuted(next); // optimistic
    try {
      const res = await fetch(`/api/sites/${siteId}/watch`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setMuted(!next); // rollback
        toast.error(await fetchErrorMessage(res, "Couldn't update notification preference"));
      } else if (next) {
        toast.success(`Muted notifications for ${siteName}`);
      } else {
        toast.success(`Notifications on for ${siteName}`);
      }
    } catch {
      setMuted(!next); // rollback
      toast.error("Couldn't update notification preference");
    } finally {
      setPending(false);
    }
  };

  const isMuted = muted === true;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={pending}
      aria-pressed={isMuted}
      aria-label={isMuted ? `Unmute notifications for ${siteName}` : `Mute notifications for ${siteName}`}
      title={
        isMuted
          ? "Notifications muted for this site — click to re-enable"
          : "Click to mute notifications for this site"
      }
      className={
        isMuted
          ? "gap-1.5 border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100"
          : "gap-1.5 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      }
    >
      {isMuted ? (
        <BellOff className="size-4" aria-hidden="true" />
      ) : (
        <Bell className="size-4 fill-emerald-400 text-emerald-600" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{isMuted ? "Muted" : "Notifying"}</span>
    </Button>
  );
}
