"use client";

/**
 * (Jun 2026) Cabin / TV view button.
 *
 * The /live/[token] wall-cabin screen + its token-minting API have existed
 * since May 2026 but were never given a front door — there was no way to get
 * the link from the UI. This button closes that gap: it POSTs to
 * /api/sites/[id]/live-token (5-year read-only token, gated on canAccessSite),
 * then shows the ready-to-paste URL with copy + open actions so a manager can
 * pin it to a screen in the site cabin.
 */

import { useState } from "react";
import { Tv, Copy, Check, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";

export function CabinViewButton({ siteId }: { siteId: string }) {
  const toast = useToast();
  const { copy, copiedKey } = useCopyToClipboard();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);

  async function ensureLink() {
    if (url || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/live-token`, {
        method: "POST",
      });
      if (!res.ok) {
        toast.error("Couldn't generate the cabin link");
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (data.url) setUrl(data.url);
      else toast.error("Couldn't generate the cabin link");
    } catch {
      toast.error("Couldn't generate the cabin link");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => {
          setOpen(true);
          ensureLink();
        }}
        title="Open a read-only wall-cabin TV view of this site"
      >
        <Tv className="size-4" />
        Cabin view
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cabin / TV view</DialogTitle>
            <DialogDescription>
              A read-only, auto-refreshing screen of today&apos;s jobs,
              deliveries, snags and safety — built for a screen mounted in the
              site cabin. Open this link on the cabin TV and leave it running;
              no login is needed.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Generating link…
            </div>
          ) : url ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  onClick={() => copy(url, "cabin")}
                  title="Copy link"
                >
                  {copiedKey === "cabin" ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The link stays valid for 5 years, so you can pin it to the
                cabin screen for the whole project. Anyone with the link can
                view this site&apos;s live screen (read-only) — treat it like a
                screen-share link.
              </p>
            </div>
          ) : (
            <div className="py-4 text-sm text-muted-foreground">
              Couldn&apos;t generate the link.{" "}
              <button className="underline" onClick={ensureLink}>
                Try again
              </button>
              .
            </div>
          )}

          <DialogFooter>
            {url && (
              <Button
                render={
                  <a href={url} target="_blank" rel="noopener noreferrer" />
                }
              >
                <ExternalLink className="size-4" /> Open cabin view
              </Button>
            )}
            <DialogClose render={<Button variant="outline" />}>
              Close
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
