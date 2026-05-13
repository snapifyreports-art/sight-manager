"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, AlertCircle, Loader2 } from "lucide-react";
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  // (May 2026 audit SM-P0-11) Pre-fix a failed GET silently left
  // `muted=null` which fell through to `isMuted=false` and rendered
  // "Notifying" (green bell) — user believed they were subscribed
  // when the system hadn't actually verified anything. Track the
  // failure explicitly so the UI can show the unknown state.
  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    fetch(`/api/sites/${siteId}/watch`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`status ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (typeof data?.watching === "boolean") {
          setMuted(data.watching);
        } else {
          setLoadFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
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

  // (May 2026 audit SM-P0-11) Render an explicit "unknown" state while
  // we're still loading or after the GET failed — pre-fix this fell
  // through to "Notifying" and lied to the user about the subscription.
  if (loadFailed) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          // retry by forcing the effect to re-run via a soft refresh
          setLoadFailed(false);
          setMuted(null);
          fetch(`/api/sites/${siteId}/watch`)
            .then(async (r) => (r.ok ? r.json() : null))
            .then((data) => {
              if (typeof data?.watching === "boolean") setMuted(data.watching);
              else setLoadFailed(true);
            })
            .catch(() => setLoadFailed(true));
        }}
        aria-label="Notification preference unknown — click to retry"
        title="Notification preference unknown — click to retry"
        className="gap-1.5 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
      >
        <AlertCircle className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Retry</span>
      </Button>
    );
  }
  if (muted === null) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        aria-busy="true"
        aria-label={`Loading notification preference for ${siteName}`}
        className="gap-1.5"
      >
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      </Button>
    );
  }

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
