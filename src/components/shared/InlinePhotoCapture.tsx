"use client";

/**
 * Shared lightweight photo-capture component. Wraps multipart FormData
 * POST to the job-photo or snag-photo endpoint.
 *
 * Before: 14 places (6 for job photos, 8 for snag photos) built their
 * own FormData + fetch inline. Tag conventions differed — Walkthrough
 * appended no tag, Daily Brief hardcoded "after", SnagDialog let the
 * user pick. Photos captured in the Walkthrough couldn't be filtered
 * by "after" on the gallery because they had no tag.
 *
 * Now: every inline photo capture uses this. `tag` is passed explicitly
 * by the caller (construction workflow requires it — before/during/
 * after is meaningful for snag evidence and job progress shots).
 *
 * For the full gallery view (thumbnails + tag dropdown + caption
 * editing + drag-drop), use PhotoUpload.tsx. This component is for
 * the quick "attach a photo now" case.
 */

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export type PhotoTarget = "job" | "snag";
export type PhotoTag = "before" | "during" | "after" | "signoff";

interface InlinePhotoCaptureProps {
  target: PhotoTarget;
  /** The job or snag id this photo is attached to. */
  id: string;
  /** Tag for the upload. Caller picks — construction gallery filter
   *  relies on this being set consistently. */
  tag: PhotoTag;
  /** Optional caption to save with the photo. */
  caption?: string;
  /** Called with the list of uploaded URLs after every file completes.
   *  Partial failures still call this with the successful ones. */
  onUploaded?: (urls: string[]) => void;
  /** If true, render as a compact icon-only button. Otherwise render
   *  a full labelled button ("Add Photos"). */
  compact?: boolean;
  /** Override the button label. Ignored when compact. */
  label?: string;
  /** Optional className forwarded to the button. */
  className?: string;
  /** Disable the button externally (e.g. during a parent mutation). */
  disabled?: boolean;
}

export function InlinePhotoCapture({
  target,
  id,
  tag,
  caption,
  onUploaded,
  compact = false,
  label,
  className,
  disabled,
}: InlinePhotoCaptureProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const endpoint = target === "job"
    ? `/api/jobs/${id}/photos`
    : `/api/snags/${id}/photos`;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    const uploaded: string[] = [];
    let failed = 0;
    try {
      // Post each file as its own FormData — both endpoints accept an
      // array under the "photos" key and the single-file pattern, so
      // we use single-file posts for simplicity and max error fidelity.
      await Promise.all(
        Array.from(files).map(async (file) => {
          try {
            const fd = new FormData();
            fd.append("photos", file);
            fd.append("tag", tag);
            if (caption) fd.append("caption", caption);
            const res = await fetch(endpoint, { method: "POST", body: fd });
            if (!res.ok) {
              failed++;
              return;
            }
            const data = await res.json().catch(() => null);
            // Different endpoints return differently-shaped responses;
            // accept any URL-bearing property.
            const url = data?.url ?? data?.photos?.[0]?.url ?? data?.publicUrl;
            if (url) uploaded.push(url);
          } catch {
            failed++;
          }
        })
      );
      if (uploaded.length > 0) {
        toast.success(
          `${uploaded.length} photo${uploaded.length !== 1 ? "s" : ""} uploaded`
        );
      }
      if (failed > 0) {
        toast.error(
          `${failed} photo${failed !== 1 ? "s" : ""} failed to upload`
        );
      }
      onUploaded?.(uploaded);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const buttonText = label ?? "Add Photos";

  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1 text-xs font-medium text-foreground hover:bg-accent",
        "disabled:opacity-50",
        disabled && "pointer-events-none opacity-50",
        uploading && "pointer-events-none opacity-70",
        className
      )}
    >
      {uploading ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Camera className="size-3.5" />
      )}
      {!compact && <span>{uploading ? "Uploading…" : buttonText}</span>}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={uploading || disabled}
      />
    </label>
  );
}

// X icon re-export guard so the icon is referenced somewhere (prevents
// accidental unused-import complaints if consumers rely on it from here).
void X;
