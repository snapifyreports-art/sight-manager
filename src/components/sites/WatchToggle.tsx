"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

/**
 * (May 2026 audit #152) Per-user "watch this site" toggle.
 *
 * Reads the current state from GET /api/sites/[id]/watch on mount,
 * POSTs / DELETEs on click. Optimistic UI — flips immediately, rolls
 * back if the server rejects. Filled gold star = watching, outline =
 * not watching.
 *
 * Distinct from UserSite (access control). Watching is a notification
 * opt-in that future cron handlers will read to scope per-user pushes.
 */
export function WatchToggle({
  siteId,
  siteName,
}: {
  siteId: string;
  siteName: string;
}) {
  const [watching, setWatching] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sites/${siteId}/watch`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && typeof data?.watching === "boolean") {
          setWatching(data.watching);
        }
      })
      .catch(() => {
        // Silent — the toggle just stays in its initial null state and
        // the user can still click it; the click handler will surface
        // any real error.
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  const toggle = async () => {
    if (pending) return;
    const next = !watching;
    setPending(true);
    setWatching(next); // optimistic
    try {
      const res = await fetch(`/api/sites/${siteId}/watch`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setWatching(!next); // rollback
        toast.error(await fetchErrorMessage(res, "Couldn't update watch state"));
      } else if (next) {
        toast.success(`Watching ${siteName}`);
      } else {
        toast.success(`Stopped watching ${siteName}`);
      }
    } catch {
      setWatching(!next); // rollback
      toast.error("Couldn't update watch state");
    } finally {
      setPending(false);
    }
  };

  // While we don't yet know the state (initial fetch in flight), show
  // an outline placeholder — clicking is fine because the server query
  // is still trustworthy at toggle time.
  const isWatching = watching === true;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      disabled={pending}
      aria-pressed={isWatching}
      aria-label={isWatching ? `Stop watching ${siteName}` : `Watch ${siteName}`}
      title={
        isWatching
          ? "You're watching this site — click to stop"
          : "Watch this site to get notifications"
      }
      className={
        isWatching
          ? "gap-1.5 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
          : "gap-1.5"
      }
    >
      <Star
        className={`size-4 ${isWatching ? "fill-amber-400 text-amber-500" : ""}`}
        aria-hidden="true"
      />
      <span className="hidden sm:inline">{isWatching ? "Watching" : "Watch"}</span>
    </Button>
  );
}
