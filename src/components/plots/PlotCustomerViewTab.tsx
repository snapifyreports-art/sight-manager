"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Trash2,
  Send,
  Eye,
  EyeOff,
  ImageIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useConfirm } from "@/hooks/useConfirm";

// Helper to combine a "title" and "description" into a single string
// for the lightweight toast api (which takes a single message arg).
function fmtToast(title: string, description?: string) {
  return description ? `${title} — ${description}` : title;
}

/**
 * Site-admin tab for managing a plot's customer-facing /progress/<token>
 * link. Three jobs:
 *   1. Generate / rotate / disable the link
 *   2. Post journal entries (the "story feed" surfaced to the customer)
 *   3. Tick photos to share (off by default — opt-in)
 *
 * Backed by:
 *   - GET/POST/PATCH /api/plots/[id]/customer-link
 *   - GET/POST       /api/plots/[id]/journal + DELETE [entryId]
 *   - GET/PATCH      /api/plots/[id]/customer-photos
 */

type LinkState = { token: string | null; enabled: boolean; url: string | null };
type JournalEntry = {
  id: string;
  body: string;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
};
type CuratedPhoto = {
  id: string;
  url: string;
  caption: string | null;
  tag: string | null;
  sharedWithCustomer: boolean;
  createdAt: string;
  job: { id: string; name: string; stageCode: string | null };
};

export function PlotCustomerViewTab({ plotId }: { plotId: string }) {
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  // ─── Link state ─────────────────────────────────────────────────────
  const [link, setLink] = useState<LinkState | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const { copy, copied } = useCopyToClipboard();

  // ─── Journal state ──────────────────────────────────────────────────
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);

  // ─── Photo state ────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<CuratedPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null); // photoId currently flipping
  const [loadingPhotos, setLoadingPhotos] = useState(true);

  const refreshAll = useCallback(async () => {
    const [linkRes, journalRes, photoRes] = await Promise.all([
      fetch(`/api/plots/${plotId}/customer-link`, { cache: "no-store" }),
      fetch(`/api/plots/${plotId}/journal`, { cache: "no-store" }),
      fetch(`/api/plots/${plotId}/customer-photos`, { cache: "no-store" }),
    ]);
    if (linkRes.ok) setLink(await linkRes.json());
    if (journalRes.ok) setEntries(await journalRes.json());
    if (photoRes.ok) setPhotos(await photoRes.json());
    setLoadingPhotos(false);
  }, [plotId]);

  // (May 2026 pattern sweep) Cancellation flag — rapid plot navigation
  // let an older plot's link / journal / photos land in the new tab.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/plots/${plotId}/customer-link`, { cache: "no-store" }),
      fetch(`/api/plots/${plotId}/journal`, { cache: "no-store" }),
      fetch(`/api/plots/${plotId}/customer-photos`, { cache: "no-store" }),
    ]).then(async ([linkRes, journalRes, photoRes]) => {
      if (cancelled) return;
      if (linkRes.ok) setLink(await linkRes.json());
      if (cancelled) return;
      if (journalRes.ok) setEntries(await journalRes.json());
      if (cancelled) return;
      if (photoRes.ok) setPhotos(await photoRes.json());
    }).finally(() => { if (!cancelled) setLoadingPhotos(false); });
    return () => { cancelled = true; };
  }, [plotId]);

  // ─── Link actions ───────────────────────────────────────────────────
  async function generateLink(rotate: boolean) {
    setLinkBusy(true);
    try {
      const res = await fetch(`/api/plots/${plotId}/customer-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate }),
      });
      if (!res.ok) {
        const msg = await fetchErrorMessage(res);
        toast.error(fmtToast("Couldn't update link", msg));
        return;
      }
      const data = await res.json();
      setLink(data);
      toast.success(
        fmtToast(
          rotate ? "Link rotated" : "Link generated",
          "Copy it from the field below to share with the buyer.",
        ),
      );
    } finally {
      setLinkBusy(false);
    }
  }

  async function toggleEnabled(enabled: boolean) {
    setLinkBusy(true);
    try {
      const res = await fetch(`/api/plots/${plotId}/customer-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        const msg = await fetchErrorMessage(res);
        toast.error(fmtToast("Couldn't update link", msg));
        return;
      }
      const data = await res.json();
      setLink(data);
      toast.success(
        fmtToast(
          enabled ? "Link enabled" : "Link disabled",
          enabled
            ? "The customer can now access the page."
            : "The customer will see an inactive link message.",
        ),
      );
    } finally {
      setLinkBusy(false);
    }
  }

  // ─── Journal actions ────────────────────────────────────────────────
  async function postEntry() {
    if (!draft.trim()) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/plots/${plotId}/journal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft.trim() }),
      });
      if (!res.ok) {
        const msg = await fetchErrorMessage(res);
        toast.error(fmtToast("Couldn't post update", msg));
        return;
      }
      const created = await res.json();
      setEntries((prev) => [created, ...prev]);
      setDraft("");
    } finally {
      setPosting(false);
    }
  }

  async function deleteEntry(entryId: string) {
    const ok = await confirm({
      title: "Delete this update?",
      body: "It will disappear from the customer page. This cannot be undone.",
      confirmLabel: "Delete update",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/plots/${plotId}/journal/${entryId}`, { method: "DELETE" });
    if (!res.ok) {
      const msg = await fetchErrorMessage(res);
      toast.error(fmtToast("Couldn't delete update", msg));
      return;
    }
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  // ─── Photo actions ──────────────────────────────────────────────────
  async function togglePhoto(photoId: string, shared: boolean) {
    setPhotoBusy(photoId);
    // Optimistic flip
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, sharedWithCustomer: shared } : p)),
    );
    try {
      const res = await fetch(`/api/plots/${plotId}/customer-photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: [{ photoId, shared }] }),
      });
      if (!res.ok) {
        // Revert on failure
        setPhotos((prev) =>
          prev.map((p) => (p.id === photoId ? { ...p, sharedWithCustomer: !shared } : p)),
        );
        const msg = await fetchErrorMessage(res);
        toast.error(fmtToast("Couldn't update photo", msg));
      }
    } finally {
      setPhotoBusy(null);
    }
  }

  const sharedCount = photos.filter((p) => p.sharedWithCustomer).length;

  return (
    <div className="space-y-8">
      {confirmDialog}
      {/* ─── Section: Customer link ───────────────────────────────── */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Customer link</h3>
            <p className="text-sm text-slate-500">
              A customer-facing progress page they can bookmark. No dates, no bad news — just stages, photos and updates.
            </p>
          </div>
          {link?.url && (
            <a
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
            >
              <Eye className="size-4" />
              Preview as customer
            </a>
          )}
        </div>

        {link?.url ? (
          <>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={link.url}
                className={`flex-1 rounded-lg border px-3 py-2 font-mono text-xs ${
                  link.enabled ? "bg-slate-50 text-slate-700" : "bg-amber-50 text-amber-900 line-through"
                }`}
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => copy(link.url!)}
                disabled={!link.enabled}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {link.enabled ? (
                <Button size="sm" variant="outline" onClick={() => toggleEnabled(false)} disabled={linkBusy}>
                  <EyeOff className="size-4" />
                  Disable link
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => toggleEnabled(true)} disabled={linkBusy}>
                  <Eye className="size-4" />
                  Enable link
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={() => generateLink(true)} disabled={linkBusy}>
                <RefreshCw className="size-4" />
                Rotate (invalidate old)
              </Button>
              <span className="ml-auto text-xs text-slate-500">
                {link.enabled ? "Active" : "Disabled — customer sees an inactive message"}
              </span>
            </div>
          </>
        ) : (
          <Button onClick={() => generateLink(false)} disabled={linkBusy}>
            {linkBusy ? <Loader2 className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
            Generate link
          </Button>
        )}
      </section>

      {/* ─── Section: Story / journal ─────────────────────────────── */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Updates feed</h3>
          <p className="text-sm text-slate-500">
            Short notes that appear on the customer's progress page. Keep it positive and engaging.
          </p>
        </div>

        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Roof tiles arrived today, the team will get them on first thing Monday!"
            rows={3}
            maxLength={4000}
            className="resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{draft.length}/4000</span>
            <Button onClick={postEntry} disabled={!draft.trim() || posting} size="sm">
              {posting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Post update
            </Button>
          </div>
        </div>

        {entries.length > 0 && (
          <ul className="mt-6 space-y-3">
            {entries.map((e) => (
              <li
                key={e.id}
                className="group flex items-start justify-between gap-3 rounded-lg border bg-slate-50 p-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500">
                    {e.createdBy?.name ?? "—"} · {new Date(e.createdAt).toLocaleDateString("en-GB")}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{e.body}</p>
                </div>
                <button
                  type="button"
                  onClick={() => deleteEntry(e.id)}
                  className="shrink-0 rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
                  aria-label="Delete update"
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Section: Photos ──────────────────────────────────────── */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Photos to share</h3>
            <p className="text-sm text-slate-500">
              Tick photos to include them on the customer page. Off by default — only ticked photos are visible.
            </p>
          </div>
          <p className="text-sm font-medium text-slate-600">
            {sharedCount} / {photos.length} shared
          </p>
        </div>

        {loadingPhotos ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ImageIcon className="size-10 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">
              No photos uploaded for this plot yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((p) => (
              <PhotoTile
                key={p.id}
                photo={p}
                busy={photoBusy === p.id}
                onToggle={(shared) => togglePhoto(p.id, shared)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PhotoTile({
  photo,
  busy,
  onToggle,
}: {
  photo: CuratedPhoto;
  busy: boolean;
  onToggle: (shared: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!photo.sharedWithCustomer)}
      disabled={busy}
      className={`group relative aspect-square overflow-hidden rounded-lg border-2 text-left transition-all ${
        photo.sharedWithCustomer
          ? "border-blue-500 ring-2 ring-blue-500/30"
          : "border-slate-200 hover:border-slate-300"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={photo.caption ?? ""} className="size-full object-cover" loading="lazy" />
      {/* Tick badge */}
      <div
        className={`absolute right-2 top-2 flex size-6 items-center justify-center rounded-full border-2 transition-colors ${
          photo.sharedWithCustomer
            ? "border-white bg-blue-500 text-white"
            : "border-white bg-white/70 text-transparent group-hover:bg-white"
        }`}
      >
        <Check className="size-4" />
      </div>
      {/* Loading spinner */}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
          <Loader2 className="size-5 animate-spin text-slate-600" />
        </div>
      )}
      {/* Bottom caption strip */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <p className="truncate text-[10px] font-medium text-white">{photo.job.name}</p>
        {photo.caption && (
          <p className="truncate text-[9px] text-white/70">{photo.caption}</p>
        )}
      </div>
    </button>
  );
}
