"use client";

import { useState, useRef, useCallback } from "react";
import { Camera, Upload, X, Loader2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface JobPhoto {
  id: string;
  url: string;
  fileName: string | null;
  caption: string | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string } | null;
}

interface PhotoUploadProps {
  jobId: string;
  photos: JobPhoto[];
  onPhotosChange?: (photos: JobPhoto[]) => void;
}

export function PhotoUpload({
  jobId,
  photos,
  onPhotosChange,
}: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;

      setUploading(true);
      try {
        const formData = new FormData();
        Array.from(files).forEach((file) => formData.append("photos", file));

        const res = await fetch(`/api/jobs/${jobId}/photos`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const newPhotos = await res.json();
          onPhotosChange?.([...newPhotos, ...photos]);
        }
      } catch (error) {
        console.error("Upload failed:", error);
      } finally {
        setUploading(false);
        // Reset file inputs
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
      }
    },
    [jobId, photos, onPhotosChange]
  );

  const handleDelete = useCallback(
    async (photoId: string) => {
      setDeletingId(photoId);
      try {
        const res = await fetch(
          `/api/jobs/${jobId}/photos?photoId=${photoId}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          onPhotosChange?.(photos.filter((p) => p.id !== photoId));
        }
      } catch (error) {
        console.error("Delete failed:", error);
      } finally {
        setDeletingId(null);
      }
    },
    [jobId, photos, onPhotosChange]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-4 text-muted-foreground" />
            <CardTitle>Photos</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {/* Camera input */}
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

            {/* File input */}
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
        {photos.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <ImageIcon className="size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              No photos uploaded yet
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Use the buttons above to upload or take photos
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
              >
                <img
                  src={photo.url}
                  alt={photo.fileName || "Job photo"}
                  className="size-full object-cover"
                />
                <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/20" />
                <button
                  className="absolute right-1 top-1 rounded-full bg-black/50 p-1 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleDelete(photo.id)}
                  disabled={deletingId === photo.id}
                >
                  {deletingId === photo.id ? (
                    <Loader2 className="size-3 animate-spin text-white" />
                  ) : (
                    <X className="size-3 text-white" />
                  )}
                </button>
                {photo.fileName && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1.5">
                    <p className="truncate text-[10px] text-white">
                      {photo.fileName}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
