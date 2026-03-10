"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { format } from "date-fns";
import Link from "next/link";
import {
  Loader2,
  ArrowRight,
  CalendarDays,
  User,
  Users,
  StickyNote,
  Send,
  Camera,
  Upload,
  X,
  ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getStageCode, getStageColor } from "@/lib/stage-codes";

// ---------- Types ----------

interface JobPhoto {
  id: string;
  url: string;
  fileName: string | null;
  caption: string | null;
  createdAt: string;
  uploadedBy?: { id: string; name: string } | null;
}

interface JobAction {
  id: string;
  action: string;
  notes: string | null;
  createdAt: string;
  user: { id: string; name: string };
}

interface PanelJob {
  id: string;
  name: string;
  status: string;
  stageCode: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface PanelContext {
  job: PanelJob;
  plotName: string;
  plotId: string;
  siteName: string;
  siteId: string;
}

interface JobWeekPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: PanelContext | null;
}

// ---------- Status Config ----------

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  NOT_STARTED: {
    label: "Not Started",
    className: "bg-slate-100 text-slate-600",
  },
  IN_PROGRESS: {
    label: "In Progress",
    className: "bg-blue-100 text-blue-700",
  },
  ON_HOLD: {
    label: "On Hold",
    className: "bg-amber-100 text-amber-700",
  },
  COMPLETED: {
    label: "Completed",
    className: "bg-green-100 text-green-700",
  },
};

const ACTION_LABELS: Record<string, string> = {
  start: "Started",
  stop: "Stopped",
  complete: "Signed Off",
  edit: "Edited",
  note: "Note",
};

// ---------- Component ----------

export function JobWeekPanel({ open, onOpenChange, context }: JobWeekPanelProps) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [actions, setActions] = useState<JobAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Fetch job data when panel opens
  useEffect(() => {
    if (!open || !context) {
      setPhotos([]);
      setActions([]);
      setNoteText("");
      return;
    }

    setLoading(true);
    Promise.all([
      fetch(`/api/jobs/${context.job.id}/photos`).then((r) => r.json()),
      fetch(`/api/jobs/${context.job.id}`).then((r) => r.json()),
    ])
      .then(([photosData, jobData]) => {
        setPhotos(Array.isArray(photosData) ? photosData : []);
        setActions(Array.isArray(jobData.actions) ? jobData.actions : []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open, context]);

  // Add note
  const handleAddNote = useCallback(async () => {
    if (!context || !noteText.trim()) return;

    setSubmittingNote(true);
    try {
      const res = await fetch(`/api/jobs/${context.job.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "note", notes: noteText.trim() }),
      });

      if (res.ok) {
        // Refetch actions to get the new one with user info
        const jobData = await fetch(`/api/jobs/${context.job.id}`).then((r) =>
          r.json()
        );
        setActions(Array.isArray(jobData.actions) ? jobData.actions : []);
        setNoteText("");
      }
    } catch (error) {
      console.error("Failed to add note:", error);
    } finally {
      setSubmittingNote(false);
    }
  }, [context, noteText]);

  // Upload photos
  const handleUpload = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0 || !context) return;

      setUploading(true);
      try {
        const formData = new FormData();
        Array.from(files).forEach((file) => formData.append("photos", file));

        const res = await fetch(`/api/jobs/${context.job.id}/photos`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const newPhotos = await res.json();
          setPhotos((prev) => [...newPhotos, ...prev]);
        }
      } catch (error) {
        console.error("Upload failed:", error);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        if (cameraInputRef.current) cameraInputRef.current.value = "";
      }
    },
    [context]
  );

  // Delete photo
  const handleDeletePhoto = useCallback(
    async (photoId: string) => {
      if (!context) return;
      setDeletingId(photoId);
      try {
        const res = await fetch(
          `/api/jobs/${context.job.id}/photos?photoId=${photoId}`,
          { method: "DELETE" }
        );
        if (res.ok) {
          setPhotos((prev) => prev.filter((p) => p.id !== photoId));
        }
      } catch (error) {
        console.error("Delete failed:", error);
      } finally {
        setDeletingId(null);
      }
    },
    [context]
  );

  if (!context) return null;

  const { job, plotName, plotId, siteName, siteId } = context;
  const stageCode = getStageCode(job);
  const stageColors = getStageColor(job.status);
  const statusConfig = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.NOT_STARTED;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div
              className="flex size-8 items-center justify-center rounded text-xs font-bold"
              style={{
                backgroundColor: stageColors.bg,
                color: stageColors.text,
              }}
            >
              {stageCode}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{job.name}</DialogTitle>
              <DialogDescription className="truncate">
                {siteName} &rsaquo; {plotName}
              </DialogDescription>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusConfig.className}`}
            >
              {statusConfig.label}
            </span>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 pt-1">
            {/* Info */}
            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
              {(job.startDate || job.endDate) && (
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  <span>
                    {job.startDate
                      ? format(new Date(job.startDate), "d MMM")
                      : "?"}
                    {" → "}
                    {job.endDate
                      ? format(new Date(job.endDate), "d MMM yyyy")
                      : "?"}
                  </span>
                </div>
              )}
            </div>

            {/* Notes Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <StickyNote className="size-4 text-muted-foreground" />
                <h4 className="text-sm font-semibold">Notes & Actions</h4>
                <span className="text-xs text-muted-foreground">
                  ({actions.length})
                </span>
              </div>

              {/* Add Note */}
              <div className="flex gap-2">
                <Textarea
                  placeholder="Add a note..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={2}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={handleAddNote}
                  disabled={submittingNote || !noteText.trim()}
                  className="shrink-0 self-end"
                >
                  {submittingNote ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                </Button>
              </div>

              {/* Notes timeline */}
              {actions.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {actions.map((a) => {
                    const label = ACTION_LABELS[a.action] || a.action;
                    const isNote = a.action === "note";

                    return (
                      <div
                        key={a.id}
                        className={`rounded-lg border p-2.5 text-sm ${
                          isNote
                            ? "border-amber-200 bg-amber-50/50"
                            : "bg-slate-50/50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            {isNote ? "📝" : "⚡"} {label} by {a.user.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {format(new Date(a.createdAt), "d MMM HH:mm")}
                          </span>
                        </div>
                        {a.notes && (
                          <p className="mt-1 text-sm">{a.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {actions.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No notes yet. Add one above.
                </p>
              )}
            </div>

            {/* Photos Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="size-4 text-muted-foreground" />
                  <h4 className="text-sm font-semibold">Photos</h4>
                  <span className="text-xs text-muted-foreground">
                    ({photos.length})
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
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
                    className="h-7 text-xs"
                  >
                    <Camera className="size-3" />
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
                    className="h-7 text-xs"
                  >
                    {uploading ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Upload className="size-3" />
                    )}
                    {uploading ? "Uploading..." : "Upload"}
                  </Button>
                </div>
              </div>

              {photos.length === 0 ? (
                <div className="flex flex-col items-center py-4 text-center">
                  <ImageIcon className="size-6 text-muted-foreground/40" />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    No photos yet — use the buttons above
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
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
                        onClick={() => handleDeletePhoto(photo.id)}
                        disabled={deletingId === photo.id}
                      >
                        {deletingId === photo.id ? (
                          <Loader2 className="size-3 animate-spin text-white" />
                        ) : (
                          <X className="size-3 text-white" />
                        )}
                      </button>
                      {photo.createdAt && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
                          <p className="truncate text-[9px] text-white">
                            {format(new Date(photo.createdAt), "d MMM HH:mm")}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* View Full Job Link */}
            <div className="border-t pt-3">
              <Link
                href={`/jobs/${job.id}`}
                className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                View Full Job
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
