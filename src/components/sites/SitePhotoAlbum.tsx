"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Camera, Loader2, X, Star } from "lucide-react";
import { format, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";

interface AlbumPhoto {
  id: string;
  url: string;
  caption: string | null;
  tag: string | null;
  sharedWithCustomer: boolean;
  createdAt: string;
  jobId: string;
  jobName: string;
  stageCode: string | null;
  plotId: string;
  plotName: string;
  plotNumber: string | null;
  uploadedBy: string | null;
}

/**
 * (May 2026 audit #154) Site-wide photo album.
 *
 * Aggregates every JobPhoto across every plot on a site into one
 * grid, sorted newest-first. Filters: shared-with-customer-only +
 * by-stage. Click a thumbnail to open a lightbox; lightbox links
 * back to the originating job + plot.
 *
 * Pre-fix the only way to see "all photos for site X" was to drill
 * into each plot one by one and check its job photos individually.
 */
export function SitePhotoAlbum({
  siteId,
  siteName,
}: {
  siteId: string;
  siteName: string;
}) {
  const [photos, setPhotos] = useState<AlbumPhoto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "shared">("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [lightbox, setLightbox] = useState<AlbumPhoto | null>(null);

  const loadPage = useCallback(
    async (cursorParam: string | null) => {
      setLoading(true);
      try {
        const url = `/api/sites/${siteId}/photos${cursorParam ? `?cursor=${cursorParam}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        setPhotos((prev) =>
          cursorParam ? [...prev, ...data.photos] : data.photos,
        );
        setCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [siteId],
  );

  // (May 2026 pattern sweep) Cancellation flag — switching sites
  // quickly let an older site's photos land in the album.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sites/${siteId}/photos`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || cancelled) return;
        setPhotos(data.photos);
        setCursor(data.nextCursor);
        setHasMore(!!data.nextCursor);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

  const stageOptions = Array.from(
    new Set(photos.map((p) => p.stageCode).filter((s): s is string => !!s)),
  ).sort();

  const visible = photos.filter((p) => {
    if (filter === "shared" && !p.sharedWithCustomer) return false;
    if (stageFilter !== "all" && p.stageCode !== stageFilter) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Camera className="size-4 text-muted-foreground" aria-hidden="true" />
          Photo album
          <span className="text-sm font-normal text-muted-foreground">
            ({visible.length} of {photos.length})
          </span>
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <label htmlFor="album-filter" className="sr-only">
            Filter photos
          </label>
          <select
            id="album-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "shared")}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="all">All photos</option>
            <option value="shared">Shared with customer</option>
          </select>
          {stageOptions.length > 0 && (
            <>
              <label htmlFor="album-stage" className="sr-only">
                Filter by stage
              </label>
              <select
                id="album-stage"
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="all">All stages</option>
                {stageOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {visible.length === 0 && !loading && (
        <div className="rounded-lg border border-dashed bg-white p-12 text-center text-sm text-muted-foreground">
          No photos {photos.length > 0 ? "match the current filters" : `uploaded for ${siteName} yet`}.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {visible.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setLightbox(p)}
            className="group relative aspect-square overflow-hidden rounded-lg border bg-slate-50 hover:ring-2 hover:ring-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            aria-label={`Photo of ${p.plotNumber ? `Plot ${p.plotNumber}` : p.plotName} — ${p.caption || p.jobName}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt={p.caption || p.jobName || "Construction photo"}
              loading="lazy"
              className="size-full object-cover"
            />
            {p.sharedWithCustomer && (
              <span
                className="absolute right-1 top-1 rounded bg-blue-600 p-0.5 text-white"
                title="Shared with customer"
              >
                <Star className="size-3 fill-current" aria-hidden="true" />
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
              <p className="truncate text-[10px] font-medium text-white">
                {p.plotNumber ? `Plot ${p.plotNumber}` : p.plotName}
              </p>
              <p className="truncate text-[9px] text-white/70">
                {p.stageCode ? `${p.stageCode} · ` : ""}{p.jobName}
              </p>
            </div>
          </button>
        ))}
      </div>

      {hasMore && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => loadPage(cursor)}
          >
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Load more
          </Button>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox(null);
            }}
            aria-label="Close lightbox"
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
          <div
            className="max-h-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.caption || lightbox.jobName}
              className="max-h-[80vh] w-auto rounded-lg object-contain"
            />
            <div className="mt-3 rounded-md bg-white/10 p-3 text-white">
              <p className="text-sm font-semibold">
                {lightbox.plotNumber ? `Plot ${lightbox.plotNumber}` : lightbox.plotName} · {lightbox.jobName}
              </p>
              {lightbox.caption && (
                <p className="mt-0.5 text-xs text-white/80">{lightbox.caption}</p>
              )}
              <p className="mt-1 text-[11px] text-white/60">
                {format(parseISO(lightbox.createdAt), "dd MMM yyyy")}
                {lightbox.uploadedBy ? ` · ${lightbox.uploadedBy}` : ""}
                {lightbox.sharedWithCustomer ? " · Shared with customer" : ""}
              </p>
              <Link
                href={`/sites/${siteId}/plots/${lightbox.plotId}`}
                className="mt-2 inline-block text-xs text-blue-300 underline-offset-2 hover:underline"
              >
                Open plot →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
