"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Loader2, Pencil } from "lucide-react";

/**
 * (May 2026 Surfacing audit) Render the PhotoAnnotation rows attached
 * to a single JobPhoto. The annotation strokes themselves are stored
 * as opaque JSON ({@link src/app/api/photos/[photoId]/annotations/route.ts:90})
 * — no write-side canvas currently exists in the codebase, so a full
 * SVG overlay would have no source data to render today. This panel
 * surfaces the metadata that DOES exist (captions, authors, dates) so
 * the audit trail is visible. When the canvas tool ships, swap the
 * "Strokes recorded" caption for an inline SVG overlay using the
 * stroke geometry.
 */

interface AnnotationRow {
  id: string;
  caption: string | null;
  strokes: string;
  createdAt: string;
  createdById: string | null;
}

interface CreatorMap {
  [id: string]: string;
}

export function PhotoAnnotationsPanel({
  photoId,
  creatorMap,
}: {
  photoId: string;
  /** Optional id → name lookup so we can render the author. The
   *  lightbox parent may already have a users map; pass it through
   *  to avoid an extra fetch. */
  creatorMap?: CreatorMap;
}) {
  const [rows, setRows] = useState<AnnotationRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/photos/${photoId}/annotations`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && Array.isArray(d)) setRows(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [photoId]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading annotations…
      </p>
    );
  }
  if (!rows || rows.length === 0) return null;

  return (
    <div className="mt-2 rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
        <Pencil className="size-3" aria-hidden /> Annotations ({rows.length})
      </p>
      <ul className="space-y-1.5">
        {rows.map((a) => {
          const strokeCount = (() => {
            try {
              const parsed = JSON.parse(a.strokes);
              if (Array.isArray(parsed)) return parsed.length;
            } catch {
              /* opaque payload, no stroke count derivable */
            }
            return null;
          })();
          const authorName = a.createdById
            ? creatorMap?.[a.createdById] ?? "(unknown)"
            : "(unknown)";
          return (
            <li key={a.id} className="text-xs text-slate-200">
              {a.caption ? (
                <p className="font-medium">&ldquo;{a.caption}&rdquo;</p>
              ) : (
                <p className="italic text-slate-400">(no caption)</p>
              )}
              <p className="text-[10px] text-slate-400">
                {authorName} ·{" "}
                {format(parseISO(a.createdAt), "dd MMM yy · HH:mm")}
                {strokeCount !== null && (
                  <> · {strokeCount} stroke{strokeCount === 1 ? "" : "s"}</>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
