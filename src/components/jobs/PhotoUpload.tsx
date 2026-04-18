"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Camera,
  Upload,
  X,
  Loader2,
  ImageIcon,
  ChevronLeft,
  ChevronRight,
  Tag,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

interface JobPhoto {
  id: string;
  url: string;
  fileName: string | null;
  caption: string | null;
  tag: string | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string } | null;
}

interface PhotoUploadProps {
  jobId: string;
  photos: JobPhoto[];
  onPhotosChange?: (photos: JobPhoto[]) => void;
}

const TAG_OPTIONS = [
  { value: "", label: "No tag" },
  { value: "before", label: "Before" },
  { value: "after", label: "After" },
  { value: "progress", label: "Progress" },
];

const TAG_COLORS: Record<string, string> = {
  before: "bg-blue-500",
  after: "bg-green-500",
  progress: "bg-amber-500",
};

export function PhotoUpload({
  jobId,
  photos,
  onPhotosChange,
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState("");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const filteredPhotos =
    filterTag === "all"
      ? photos
      : filterTag === "untagged"
        ? photos.filter((p) => !p.tag)
        : photos.filter((p) => p.tag === filterTag);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setUploading(true);
      try {
        const formData = new FormData();
        Array.from(files).forEach((file) => formData.append("photos", file));
        if (selectedTag) formData.append("tag", selectedTag);

        const res = await fetch(`/api/jobs/${jobId}/photos`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to upload photos"));
          return;
        }
        const newPhotos = await res.json();
        onPhotosChange?.([...newPhotos, ...photos]);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
      }
    },
    [jobId, photos, onPhotosChange, selectedTag, toast]
  );

  const handleDelete = useCallback(
    async (photoId: string) => {
      setDeletingId(photoId);
      try {
        const res = await fetch(
          `/api/jobs/${jobId}/photos?photoId=${photoId}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to delete photo"));
          return;
        }
        onPhotosChange?.(photos.filter((p) => p.id !== photoId));
        if (lightboxIndex !== null) setLightboxIndex(null);
      } finally {
        setDeletingId(null);
      }
    },
    [jobId, photos, onPhotosChange, lightboxIndex, toast]
  );

  const handleUpdateTag = useCallback(
    async (photoId: string, newTag: string) => {
      const res = await fetch(`/api/jobs/${jobId}/photos`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoId, tag: newTag || null }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to update photo tag"));
        return;
      }
      onPhotosChange?.(
        photos.map((p) =>
          p.id === photoId ? { ...p, tag: newTag || null } : p
        )
      );
    },
    [jobId, photos, onPhotosChange, toast]
  );

  // Keyboard nav for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setLightboxIndex((i) =>
          i !== null && i > 0 ? i - 1 : filteredPhotos.length - 1
        );
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((i) =>
          i !== null && i < filteredPhotos.length - 1 ? i + 1 : 0
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, filteredPhotos.length]);

  const lightboxPhoto =
    lightboxIndex !== null ? filteredPhotos[lightboxIndex] : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-4 text-muted-foreground" />
            <CardTitle>Photos</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {/* Tag selector for upload */}
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              className="rounded-md border bg-white px-2 py-1 text-xs"
            >
              {TAG_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
            >
              <Camera className="size-3.5" />
              Camera
            </Button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>
        <CardDescription>
          {photos.length} photo{photos.length !== 1 ? "s" : ""} attached
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filter chips */}
        {photos.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {[
              { value: "all", label: "All" },
              { value: "before", label: "Before" },
              { value: "after", label: "After" },
              { value: "progress", label: "Progress" },
              { value: "untagged", label: "Untagged" },
            ].map((chip) => (
              <button
                key={chip.value}
                onClick={() => setFilterTag(chip.value)}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  filterTag === chip.value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        )}

        {filteredPhotos.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <ImageIcon className="size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              {photos.length === 0
                ? "No photos uploaded yet"
                : "No photos match this filter"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {filteredPhotos.map((photo, idx) => (
              <button
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
                onClick={() => setLightboxIndex(idx)}
              >
                <img
                  src={photo.url}
                  alt={photo.fileName || "Job photo"}
                  className="size-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                {photo.tag && (
                  <span
                    className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase text-white ${TAG_COLORS[photo.tag] || "bg-slate-500"}`}
                  >
                    {photo.tag}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Lightbox Dialog */}
        <Dialog
          open={lightboxIndex !== null}
          onOpenChange={() => setLightboxIndex(null)}
        >
          <DialogContent className="max-w-3xl p-0 overflow-hidden">
            {lightboxPhoto && (
              <div>
                <div className="relative flex items-center justify-center bg-black">
                  <img
                    src={lightboxPhoto.url}
                    alt={lightboxPhoto.fileName || "Photo"}
                    className="max-h-[70vh] w-auto object-contain"
                  />

                  {filteredPhotos.length > 1 && (
                    <>
                      <button
                        className="absolute left-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                        onClick={() =>
                          setLightboxIndex((i) =>
                            i !== null && i > 0
                              ? i - 1
                              : filteredPhotos.length - 1
                          )
                        }
                      >
                        <ChevronLeft className="size-5" />
                      </button>
                      <button
                        className="absolute right-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                        onClick={() =>
                          setLightboxIndex((i) =>
                            i !== null && i < filteredPhotos.length - 1
                              ? i + 1
                              : 0
                          )
                        }
                      >
                        <ChevronRight className="size-5" />
                      </button>
                    </>
                  )}
                </div>

                <div className="flex items-center justify-between border-t p-3">
                  <div className="flex items-center gap-3 text-sm">
                    <div className="flex items-center gap-1.5">
                      <Tag className="size-3.5 text-muted-foreground" />
                      <select
                        value={lightboxPhoto.tag || ""}
                        onChange={(e) =>
                          handleUpdateTag(lightboxPhoto.id, e.target.value)
                        }
                        className="rounded border bg-white px-2 py-0.5 text-xs"
                      >
                        {TAG_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {lightboxPhoto.uploadedBy?.name || "Unknown"} &middot;{" "}
                      {new Date(lightboxPhoto.createdAt).toLocaleDateString()}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {lightboxIndex! + 1} / {filteredPhotos.length}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-600"
                    onClick={() => handleDelete(lightboxPhoto.id)}
                    disabled={deletingId === lightboxPhoto.id}
                  >
                    {deletingId === lightboxPhoto.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
