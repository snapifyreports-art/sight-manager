"use client";

import { Dispatch, RefObject, SetStateAction } from "react";
import { format } from "date-fns";
import {
  Image as ImageIcon,
  Camera,
  Upload,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * (May 2026 JobWeekPanel split) Photos section + "Raise as Snag?"
 * post-upload prompt — extracted from JobWeekPanel.
 *
 * Pure presentational: receives state + handlers from the parent, owns
 * no async logic. The parent still drives upload/delete/caption flows;
 * this component just renders the UI.
 */

export interface PanelPhoto {
  id: string;
  url: string;
  fileName: string | null;
  caption: string | null;
  tag: string | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string } | null;
}

interface Props {
  photos: PanelPhoto[];
  isSynthetic: boolean;
  uploading: boolean;
  pendingFiles: FileList | null;
  setPendingFiles: Dispatch<SetStateAction<FileList | null>>;
  photoCaption: string;
  setPhotoCaption: Dispatch<SetStateAction<string>>;
  snagPromptPhotos: PanelPhoto[] | null;
  setSnagPromptPhotos: Dispatch<SetStateAction<PanelPhoto[] | null>>;
  cameraInputRef: RefObject<HTMLInputElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onFileSelect: (files: FileList | null) => void;
  onUpload: () => void;
  onSnagPromptYes: () => void;
  onOpenLightbox: (index: number) => void;
}

export function JobPhotosSection({
  photos,
  isSynthetic,
  uploading,
  pendingFiles,
  setPendingFiles,
  photoCaption,
  setPhotoCaption,
  snagPromptPhotos,
  setSnagPromptPhotos,
  cameraInputRef,
  fileInputRef,
  onFileSelect,
  onUpload,
  onSnagPromptYes,
  onOpenLightbox,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon className="size-4 text-muted-foreground" aria-hidden />
          <h4 className="text-sm font-semibold">Photos</h4>
          <span className="text-xs text-muted-foreground">({photos.length})</span>
        </div>
        {!isSynthetic && (
          <div className="flex items-center gap-1.5">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onFileSelect(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="h-7 text-xs"
            >
              <Camera className="size-3" aria-hidden />
              Camera
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => onFileSelect(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-7 text-xs"
            >
              <Upload className="size-3" aria-hidden />
              Upload
            </Button>
          </div>
        )}
      </div>

      {/* Caption input — shown after selecting files */}
      {pendingFiles && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 space-y-2">
          <p className="text-xs text-muted-foreground">
            {pendingFiles.length} photo{pendingFiles.length > 1 ? "s" : ""} selected
          </p>
          <Input
            placeholder="Add a caption (optional)..."
            value={photoCaption}
            onChange={(e) => setPhotoCaption(e.target.value)}
            className="h-8 text-sm"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={onUpload}
              disabled={uploading}
              className="h-7 text-xs"
            >
              {uploading ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-3" aria-hidden />
              )}
              {uploading ? "Uploading..." : "Upload"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPendingFiles(null);
                setPhotoCaption("");
                if (fileInputRef.current) fileInputRef.current.value = "";
                if (cameraInputRef.current) cameraInputRef.current.value = "";
              }}
              disabled={uploading}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* "Raise as Snag?" prompt after upload */}
      {snagPromptPhotos && !isSynthetic && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 flex items-center justify-between gap-2">
          <p className="text-xs text-amber-800">Photo uploaded — raise as a snag?</p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={onSnagPromptYes}
            >
              <AlertTriangle className="size-3" aria-hidden />
              Yes
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => setSnagPromptPhotos(null)}
            >
              No
            </Button>
          </div>
        </div>
      )}

      {photos.length === 0 ? (
        !isSynthetic ? (
          <div className="flex flex-col items-center py-4 text-center">
            <ImageIcon className="size-6 text-muted-foreground/40" aria-hidden />
            <p className="mt-1.5 text-xs text-muted-foreground">
              No photos yet — use the buttons above
            </p>
          </div>
        ) : null
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((photo, idx) => (
            <button
              key={photo.id}
              className="group relative aspect-square overflow-hidden rounded-lg border bg-muted cursor-pointer"
              onClick={() => onOpenLightbox(idx)}
            >
              <img
                src={photo.url}
                alt={photo.caption || photo.fileName || "Job photo"}
                className="size-full object-cover"
              />
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                {photo.caption && (
                  <p className="truncate text-[9px] font-medium text-white">
                    {photo.caption}
                  </p>
                )}
                {photo.createdAt && (
                  <p className="truncate text-[9px] text-white/80">
                    {format(new Date(photo.createdAt), "d MMM HH:mm")}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
