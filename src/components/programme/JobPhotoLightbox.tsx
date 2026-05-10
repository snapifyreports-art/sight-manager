"use client";

import { format } from "date-fns";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
  AlertTriangle,
  Trash2,
  Loader2,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * (May 2026 audit) Photo lightbox extracted from JobWeekPanel.
 *
 * Self-contained: full-screen photo viewer with caption editor,
 * navigation arrows, raise-snag + delete actions.
 *
 * Lifecycle is index-based: the parent owns the `lightboxIndex`
 * state and passes it in. Setting null closes the dialog; setting
 * a number opens to that photo.
 */

export interface LightboxPhoto {
  id: string;
  url: string;
  fileName: string | null;
  caption: string | null;
  tag: string | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string } | null;
}

interface JobPhotoLightboxProps {
  photos: LightboxPhoto[];
  index: number | null;
  onIndexChange: (next: number | null) => void;
  isSynthetic: boolean;
  // Caption editing — parent owns the persistence; pass empty handler
  // when caption editing isn't supported.
  editingCaption: boolean;
  setEditingCaption: (v: boolean) => void;
  captionDraft: string;
  setCaptionDraft: (v: string) => void;
  onSaveCaption: (photoId: string, caption: string) => void;
  savingCaption: boolean;
  onRaiseSnag: (photo: LightboxPhoto) => void;
  onDelete: (photoId: string) => void;
  deletingId: string | null;
}

export function JobPhotoLightbox({
  photos,
  index,
  onIndexChange,
  isSynthetic,
  editingCaption,
  setEditingCaption,
  captionDraft,
  setCaptionDraft,
  onSaveCaption,
  savingCaption,
  onRaiseSnag,
  onDelete,
  deletingId,
}: JobPhotoLightboxProps) {
  const photo = index !== null ? photos[index] : null;

  const close = () => {
    onIndexChange(null);
    setEditingCaption(false);
  };

  return (
    <Dialog
      open={index !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="max-w-3xl p-0 overflow-hidden [&>button]:hidden">
        {photo && (
          <div>
            {/* Image area */}
            <div className="relative flex items-center justify-center bg-black min-h-[300px]">
              <img
                src={photo.url}
                alt={photo.caption || photo.fileName || "Photo"}
                className="max-h-[70vh] w-auto object-contain"
              />
              <button
                className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 z-10"
                onClick={close}
                aria-label="Close lightbox"
              >
                <X className="size-4" aria-hidden />
              </button>
              {photos.length > 1 && (
                <>
                  <button
                    className="absolute left-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                    onClick={(e) => {
                      e.stopPropagation();
                      onIndexChange(
                        index !== null && index > 0 ? index - 1 : photos.length - 1,
                      );
                      setEditingCaption(false);
                    }}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft className="size-5" aria-hidden />
                  </button>
                  <button
                    className="absolute right-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                    onClick={(e) => {
                      e.stopPropagation();
                      onIndexChange(
                        index !== null && index < photos.length - 1 ? index + 1 : 0,
                      );
                      setEditingCaption(false);
                    }}
                    aria-label="Next photo"
                  >
                    <ChevronRight className="size-5" aria-hidden />
                  </button>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t p-3 space-y-2">
              {/* Caption */}
              <div className="flex items-center gap-2">
                {editingCaption ? (
                  <div className="flex flex-1 gap-2">
                    <Input
                      value={captionDraft}
                      onChange={(e) => setCaptionDraft(e.target.value)}
                      placeholder="Add a caption..."
                      className="h-7 text-xs flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onSaveCaption(photo.id, captionDraft);
                        } else if (e.key === "Escape") {
                          setEditingCaption(false);
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => onSaveCaption(photo.id, captionDraft)}
                      disabled={savingCaption}
                    >
                      {savingCaption ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Save"
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setEditingCaption(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-1 items-center gap-2 min-w-0">
                    <p className="text-sm truncate flex-1">
                      {photo.caption || (
                        <span className="text-muted-foreground italic">
                          No caption
                        </span>
                      )}
                    </p>
                    {!isSynthetic && (
                      <button
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setCaptionDraft(photo.caption || "");
                          setEditingCaption(true);
                        }}
                        aria-label="Edit caption"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Info + actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>
                    {photo.uploadedBy?.name || "Unknown"} &middot;{" "}
                    {format(new Date(photo.createdAt), "d MMM HH:mm")}
                  </span>
                  <span>
                    {(index ?? 0) + 1} / {photos.length}
                  </span>
                </div>
                {!isSynthetic && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                      onClick={() => onRaiseSnag(photo)}
                    >
                      <AlertTriangle className="size-3" aria-hidden />
                      Raise Snag
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-red-500 hover:text-red-600"
                      onClick={() => onDelete(photo.id)}
                      disabled={deletingId === photo.id}
                    >
                      {deletingId === photo.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Trash2 className="size-3" />
                      )}
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
