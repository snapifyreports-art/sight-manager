"use client";

import { useState, useEffect, useRef } from "react";
import {
  Camera,
  CheckCircle,
  Loader2,
  Mail,
  X,
  ChevronLeft,
  ChevronRight,
  Pencil,
  MapPin,
  User,
  HardHat,
  Briefcase,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

interface SnagUser {
  id: string;
  name: string;
}

interface SnagContact {
  id: string;
  name: string;
  email: string | null;
  company: string | null;
}

interface SnagPhoto {
  id: string;
  url: string;
  fileName: string | null;
  tag: string | null;
  createdAt?: string;
}

interface SnagData {
  id: string;
  description: string;
  location: string | null;
  priority: string;
  status: string;
  assignedTo: SnagUser | null;
  contact: SnagContact | null;
  raisedBy: SnagUser;
  notes: string | null;
  jobId?: string | null;
  job?: { id: string; name: string; parent?: { name: string } | null } | null;
  _count: { photos: number };
}

interface PhotoAttachment {
  url: string;
  fileName: string;
}

interface JobItem {
  id: string;
  name: string;
  parentId: string | null;
  children?: JobItem[];
}

interface SnagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snag?: SnagData | null;
  plotId: string;
  users?: SnagUser[];
  onSaved: () => void;
  /** Pre-attached photos (from job panel lightbox or upload prompt) */
  initialPhotos?: PhotoAttachment[];
  /** Pre-fill job when raising from a sub-job context */
  initialJobId?: string;
  /** Pre-fill contractor when raising from a sub-job context */
  initialContactId?: string;
}

const TAG_COLORS: Record<string, string> = {
  before: "bg-blue-500",
  after: "bg-green-500",
};

export function SnagDialog({
  open,
  onOpenChange,
  snag,
  plotId,
  users: usersProp,
  onSaved,
  initialPhotos,
  initialJobId,
  initialContactId,
}: SnagDialogProps) {
  const toast = useToast();
  const isEditing = !!snag;
  const [viewMode, setViewMode] = useState(isEditing);

  // Reset to view mode when opening an existing snag
  useEffect(() => {
    if (open && isEditing) setViewMode(true);
    if (open && !isEditing) setViewMode(false);
  }, [open, isEditing]);

  const [form, setForm] = useState({
    description: snag?.description || "",
    location: snag?.location || "",
    priority: snag?.priority || "MEDIUM",
    assignedToId: snag?.assignedTo?.id || "",
    contactId: snag?.contact?.id || initialContactId || "",
    jobId: snag?.jobId || snag?.job?.id || initialJobId || "",
    notes: snag?.notes || "",
    status: snag?.status || "OPEN",
  });
  // After creating a snag, show email prompt before closing
  const [justCreatedSnagId, setJustCreatedSnagId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoTag, setPhotoTag] = useState<string>("");
  const [photoAttachments, setPhotoAttachments] = useState<PhotoAttachment[]>(
    initialPhotos || []
  );
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingPreviews, setPendingPreviews] = useState<string[]>([]);
  const [users, setUsers] = useState<SnagUser[]>(usersProp || []);
  const [contacts, setContacts] = useState<SnagContact[]>([]);
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Close snag state (view mode)
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const [closingInProgress, setClosingInProgress] = useState(false);
  const [pendingCloseFile, setPendingCloseFile] = useState<File | null>(null);
  const [pendingClosePreview, setPendingClosePreview] = useState<string | null>(null);
  const closeFileRef = useRef<HTMLInputElement>(null);

  // Photo gallery state
  const [snagPhotos, setSnagPhotos] = useState<SnagPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Email state
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch users, contacts, and jobs when dialog opens
  useEffect(() => {
    if (!open) return;

    if ((!usersProp || usersProp.length === 0) && users.length === 0) {
      setLoadingUsers(true);
      fetch("/api/users", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setUsers(data.map((u: SnagUser) => ({ id: u.id, name: u.name })));
          }
        })
        .catch(console.error)
        .finally(() => setLoadingUsers(false));
    }

    if (contacts.length === 0) {
      fetch("/api/contacts?type=CONTRACTOR", { cache: "no-store" })
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setContacts(
              data.map((c: SnagContact & { company?: string }) => ({
                id: c.id,
                name: c.name,
                email: c.email,
                company: c.company || null,
              }))
            );
          }
        })
        .catch(console.error);
    }
  }, [open, usersProp, users.length, contacts.length]);

  // Fetch jobs for the plot
  useEffect(() => {
    if (!open || !plotId) return;

    fetch(`/api/plots/${plotId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        // The plot endpoint should include jobs — if not, fetch separately
        if (data.jobs && Array.isArray(data.jobs)) {
          setJobs(data.jobs);
        }
      })
      .catch(console.error);
  }, [open, plotId]);

  // Fetch photos for existing snags
  useEffect(() => {
    if (!open || !snag) {
      setSnagPhotos([]);
      return;
    }

    setLoadingPhotos(true);
    fetch(`/api/snags/${snag.id}/photos`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setSnagPhotos(data);
      })
      .catch(console.error)
      .finally(() => setLoadingPhotos(false));
  }, [open, snag]);

  // Sync initialPhotos when they change
  useEffect(() => {
    if (initialPhotos && initialPhotos.length > 0) {
      setPhotoAttachments(initialPhotos);
    }
  }, [initialPhotos]);

  // Keyboard nav for lightbox
  useEffect(() => {
    if (lightboxIndex === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setLightboxIndex((i) =>
          i !== null && i > 0 ? i - 1 : snagPhotos.length - 1
        );
      } else if (e.key === "ArrowRight") {
        setLightboxIndex((i) =>
          i !== null && i < snagPhotos.length - 1 ? i + 1 : 0
        );
      } else if (e.key === "Escape") {
        setLightboxIndex(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [lightboxIndex, snagPhotos.length]);

  // Clean up pending previews on unmount
  useEffect(() => {
    return () => {
      pendingPreviews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [pendingPreviews]);

  const handleSave = async () => {
    if (!form.description.trim()) return;
    setSaving(true);
    try {
      let snagId = snag?.id;

      if (isEditing) {
        const res = await fetch(`/api/snags/${snag!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: form.description,
            location: form.location || null,
            priority: form.priority,
            assignedToId: form.assignedToId || null,
            contactId: form.contactId || null,
            jobId: form.jobId || null,
            notes: form.notes || null,
            status: form.status,
          }),
        });
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to update snag"));
          return;
        }
      } else {
        const res = await fetch(`/api/plots/${plotId}/snags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: form.description,
            location: form.location || null,
            priority: form.priority,
            assignedToId: form.assignedToId || null,
            contactId: form.contactId || null,
            jobId: form.jobId || null,
            notes: form.notes || null,
          }),
        });
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to raise snag"));
          return;
        }
        const created = await res.json();
        snagId = created.id;
      }

      // Upload pre-attached photos (from job panel) to the snag
      let photoUploadFailed = false;
      if (snagId && photoAttachments.length > 0) {
        const results = await Promise.all(
          photoAttachments.map((photo) =>
            fetch(`/api/snags/${snagId}/photos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                copyFromUrl: photo.url,
                fileName: photo.fileName,
                tag: photoTag || null,
              }),
            }).then((r) => r.ok).catch(() => false)
          )
        );
        if (results.some((ok) => !ok)) photoUploadFailed = true;
      }

      // Upload pending files (selected during creation) to the snag
      if (snagId && pendingFiles.length > 0) {
        const formData = new FormData();
        pendingFiles.forEach((f) => formData.append("photos", f));
        if (photoTag) formData.append("tag", photoTag);
        const pendingRes = await fetch(`/api/snags/${snagId}/photos`, {
          method: "POST",
          body: formData,
        }).catch(() => null);
        if (!pendingRes || !pendingRes.ok) photoUploadFailed = true;
      }

      if (photoUploadFailed) {
        toast.error("Snag saved but one or more photos failed to upload.");
      }

      onSaved();

      // After creation, if a contractor with email is selected, show email prompt
      const createdContact = !isEditing && form.contactId
        ? contacts.find((c) => c.id === form.contactId)
        : null;
      if (createdContact?.email && snagId) {
        setJustCreatedSnagId(snagId);
      } else {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    if (isEditing && snag) {
      // Edit mode: upload immediately
      setUploading(true);
      try {
        const formData = new FormData();
        Array.from(files).forEach((f) => formData.append("photos", f));
        if (photoTag) formData.append("tag", photoTag);
        const res = await fetch(`/api/snags/${snag.id}/photos`, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const newPhotos = await res.json();
          if (Array.isArray(newPhotos)) {
            setSnagPhotos((prev) => [...newPhotos, ...prev]);
          }
        }
        onSaved();
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    } else {
      // Create mode: queue files for upload after save
      const newFiles = Array.from(files);
      setPendingFiles((prev) => [...prev, ...newFiles]);
      const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
      setPendingPreviews((prev) => [...prev, ...newPreviews]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!snag || !confirm("Delete this snag?")) return;
    const res = await fetch(`/api/snags/${snag.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error(await fetchErrorMessage(res, "Failed to delete snag"));
      return;
    }
    onSaved();
    onOpenChange(false);
  };

  const handleCloseSnag = async () => {
    if (!snag) return;
    setClosingInProgress(true);
    try {
      // Upload "after" photo if provided
      let photoUploadFailed = false;
      if (pendingCloseFile) {
        const formData = new FormData();
        formData.append("photos", pendingCloseFile);
        formData.append("tag", "after");
        const photoRes = await fetch(`/api/snags/${snag.id}/photos`, {
          method: "POST",
          body: formData,
        }).catch(() => null);
        if (!photoRes || !photoRes.ok) photoUploadFailed = true;
      }

      // Build updated notes
      const existingNotes = snag.notes || "";
      const dateStr = new Date().toLocaleDateString("en-GB");
      const closingNote = closeNote.trim()
        ? `${existingNotes ? existingNotes + "\n\n" : ""}[${dateStr}] Closed: ${closeNote.trim()}`
        : undefined;

      // PATCH snag to CLOSED
      const res = await fetch(`/api/snags/${snag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CLOSED",
          ...(closingNote !== undefined && { notes: closingNote }),
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to close snag"));
        return;
      }

      if (photoUploadFailed) {
        toast.error("Snag closed but after-photo failed to upload.");
      }

      // Clean up and refresh
      setShowCloseForm(false);
      if (pendingClosePreview) URL.revokeObjectURL(pendingClosePreview);
      setPendingClosePreview(null);
      setPendingCloseFile(null);
      setCloseNote("");
      onSaved();
      onOpenChange(false);
    } finally {
      setClosingInProgress(false);
    }
  };

  const handleSendEmail = async () => {
    const selectedContact = contacts.find((c) => c.id === form.contactId);
    if (!selectedContact?.email) return;

    setSendingEmail(true);
    try {
      const photoUrls = snagPhotos.map((p) => p.url);
      const allPhotoUrls = [
        ...photoUrls,
        ...photoAttachments.map((p) => p.url),
      ];

      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "snag_raised",
          to: selectedContact.email,
          recipientName: selectedContact.name,
          data: {
            description: form.description,
            priority: form.priority,
            location: form.location || "",
            plotName: "",
            siteName: "",
            photoUrls: allPhotoUrls,
          },
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to send email"));
        return;
      }
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 3000);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send email"
      );
    } finally {
      setSendingEmail(false);
    }
  };

  const resetForm = () => {
    setForm({
      description: snag?.description || "",
      location: snag?.location || "",
      priority: snag?.priority || "MEDIUM",
      assignedToId: snag?.assignedTo?.id || "",
      contactId: snag?.contact?.id || initialContactId || "",
      jobId: snag?.jobId || snag?.job?.id || initialJobId || "",
      notes: snag?.notes || "",
      status: snag?.status || "OPEN",
    });
    setViewMode(isEditing);
    setShowCloseForm(false);
    setCloseNote("");
    if (pendingClosePreview) URL.revokeObjectURL(pendingClosePreview);
    setPendingClosePreview(null);
    setPendingCloseFile(null);
    setEmailSent(false);
    setJustCreatedSnagId(null);
    setPendingFiles([]);
    pendingPreviews.forEach((url) => URL.revokeObjectURL(url));
    setPendingPreviews([]);
    if (!initialPhotos || initialPhotos.length === 0) {
      setPhotoAttachments([]);
    }
  };

  // Build grouped job options — parent jobs as optgroups, children as selectable options
  const parentJobs = jobs.filter((j) => !j.parentId);
  const childJobsByParent = new Map<string, JobItem[]>();
  const standaloneJobs: JobItem[] = [];

  for (const pj of parentJobs) {
    const children = jobs.filter((j) => j.parentId === pj.id);
    if (children.length > 0) {
      childJobsByParent.set(pj.id, children);
    } else {
      standaloneJobs.push(pj);
    }
  }

  const allUsers = usersProp && usersProp.length > 0 ? usersProp : users;
  const selectedContact = contacts.find((c) => c.id === form.contactId);
  const lightboxPhoto =
    lightboxIndex !== null ? snagPhotos[lightboxIndex] : null;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (o) resetForm();
          if (!o) setLightboxIndex(null);
          onOpenChange(o);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {!isEditing ? "Raise Snag" : viewMode ? "Snag Details" : "Edit Snag"}
            </DialogTitle>
          </DialogHeader>

          {/* ── View Mode ── */}
          {isEditing && viewMode && snag && (
            <div className="space-y-4">
              {/* Description */}
              <div>
                <p className="text-sm">{snag.description}</p>
              </div>

              {/* Status + Priority row */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  snag.status === "OPEN" ? "bg-red-100 text-red-700" :
                  snag.status === "IN_PROGRESS" ? "bg-blue-100 text-blue-700" :
                  snag.status === "RESOLVED" ? "bg-green-100 text-green-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {snag.status === "IN_PROGRESS" ? "In Progress" : snag.status.charAt(0) + snag.status.slice(1).toLowerCase()}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                  snag.priority === "CRITICAL" ? "bg-red-100 text-red-700" :
                  snag.priority === "HIGH" ? "bg-amber-100 text-amber-700" :
                  snag.priority === "MEDIUM" ? "bg-blue-100 text-blue-700" :
                  "bg-slate-100 text-slate-600"
                }`}>
                  {snag.priority.charAt(0) + snag.priority.slice(1).toLowerCase()}
                </span>
              </div>

              {/* Completion progress indicator */}
              {(() => {
                const total = 5;
                let filled = 0;
                if (snag.location) filled++;
                if (snag.assignedTo) filled++;
                if (snag.contact) filled++;
                if (snag.job) filled++;
                if (snagPhotos.length > 0) filled++;
                const isComplete = filled === total;
                return !isComplete ? (
                  <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                    <AlertTriangle className="size-3.5" />
                    <span>{filled}/{total} fields complete</span>
                  </div>
                ) : null;
              })()}

              {/* Detail rows */}
              <div className="space-y-2 text-sm">
                {/* Location */}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" />
                  {snag.location ? (
                    <span>{snag.location}</span>
                  ) : (
                    <button
                      onClick={() => setViewMode(false)}
                      className="flex items-center gap-1 text-amber-600 hover:text-amber-700"
                    >
                      <AlertTriangle className="size-3" />
                      <span className="text-xs">No location set</span>
                    </button>
                  )}
                </div>
                {/* Linked Job */}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Briefcase className="size-3.5 shrink-0" />
                  {snag.job ? (
                    <span>{snag.job.parent ? `${snag.job.parent.name} › ` : ""}{snag.job.name}</span>
                  ) : (
                    <button
                      onClick={() => setViewMode(false)}
                      className="flex items-center gap-1 text-amber-600 hover:text-amber-700"
                    >
                      <AlertTriangle className="size-3" />
                      <span className="text-xs">Not linked to a job</span>
                    </button>
                  )}
                </div>
                {/* Contractor */}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <HardHat className="size-3.5 shrink-0" />
                  {snag.contact ? (
                    <span>{snag.contact.company ? `${snag.contact.company} — ${snag.contact.name}` : snag.contact.name}</span>
                  ) : (
                    <button
                      onClick={() => setViewMode(false)}
                      className="flex items-center gap-1 text-amber-600 hover:text-amber-700"
                    >
                      <AlertTriangle className="size-3" />
                      <span className="text-xs">No contractor</span>
                    </button>
                  )}
                </div>
                {/* Assigned To */}
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="size-3.5 shrink-0" />
                  {snag.assignedTo ? (
                    <span>{snag.assignedTo.name}</span>
                  ) : (
                    <button
                      onClick={() => setViewMode(false)}
                      className="flex items-center gap-1 text-amber-600 hover:text-amber-700"
                    >
                      <AlertTriangle className="size-3" />
                      <span className="text-xs">Unassigned</span>
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="size-3.5 shrink-0" />
                  <span>Raised by {snag.raisedBy.name}</span>
                </div>
              </div>

              {/* Notes */}
              {snag.notes && (
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{snag.notes}</p>
                </div>
              )}

              {/* Photos */}
              {loadingPhotos ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : snagPhotos.length > 0 ? (
                <div>
                  <label className="text-xs font-medium">Photos ({snagPhotos.length})</label>
                  <div className="mt-2 grid grid-cols-4 gap-1.5">
                    {snagPhotos.map((photo, idx) => (
                      <button
                        key={photo.id}
                        className="group relative aspect-square overflow-hidden rounded-lg border bg-muted cursor-pointer"
                        onClick={() => setLightboxIndex(idx)}
                      >
                        <img
                          src={photo.url}
                          alt={photo.fileName || "Snag photo"}
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
                </div>
              ) : null}

              {/* Add Photos button (always visible in view mode) */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handlePhotoUpload(e.target.files)}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  {uploading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Camera className="size-3.5" />
                  )}
                  {uploading ? "Uploading..." : "Add Photos"}
                </button>
              </div>

              {/* Email contractor */}
              {selectedContact?.email && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5">
                  <div className="flex items-center justify-between">
                    <div className="text-xs">
                      <p className="font-medium text-blue-800">
                        Email snag to {selectedContact.company ? `${selectedContact.company} — ${selectedContact.name}` : selectedContact.name}
                      </p>
                      <p className="text-blue-600">{selectedContact.email}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                      onClick={handleSendEmail}
                      disabled={sendingEmail || emailSent}
                    >
                      {sendingEmail ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Mail className="size-3" />
                      )}
                      {emailSent ? "Sent!" : sendingEmail ? "Sending..." : "Send Email"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Close Snag Form */}
              {snag.status !== "CLOSED" && !showCloseForm && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-1 text-green-700 border-green-200 hover:bg-green-50"
                  onClick={() => setShowCloseForm(true)}
                >
                  <CheckCircle className="size-3.5" />
                  Close Snag
                </Button>
              )}

              {showCloseForm && (
                <div className="space-y-3 rounded-lg border border-green-200 bg-green-50/50 p-3">
                  <p className="text-xs font-medium text-green-800">Close this snag</p>
                  <div>
                    <label className="text-xs font-medium">Closing Note</label>
                    <textarea
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                      rows={2}
                      value={closeNote}
                      onChange={(e) => setCloseNote(e.target.value)}
                      placeholder="e.g. Fixed and verified on site..."
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium">After Photo</label>
                    <p className="text-[11px] text-muted-foreground">
                      Upload an &quot;after&quot; photo to show the fix
                    </p>
                    <div className="mt-2">
                      {pendingClosePreview ? (
                        <div className="relative inline-block">
                          <img
                            src={pendingClosePreview}
                            alt="After photo preview"
                            className="size-24 rounded-lg border object-cover"
                          />
                          <button
                            className="absolute -right-1 -top-1 rounded-full bg-black/60 p-0.5"
                            onClick={() => {
                              URL.revokeObjectURL(pendingClosePreview);
                              setPendingClosePreview(null);
                              setPendingCloseFile(null);
                            }}
                          >
                            <X className="size-3 text-white" />
                          </button>
                          <span className="absolute left-1 bottom-1 rounded-full bg-green-500 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">
                            after
                          </span>
                        </div>
                      ) : (
                        <>
                          <input
                            ref={closeFileRef}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={(e) => {
                              const files = e.target.files;
                              if (!files || files.length === 0) return;
                              const file = files[0];
                              if (pendingClosePreview) URL.revokeObjectURL(pendingClosePreview);
                              setPendingCloseFile(file);
                              setPendingClosePreview(URL.createObjectURL(file));
                              if (closeFileRef.current) closeFileRef.current.value = "";
                            }}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => closeFileRef.current?.click()}
                          >
                            <Camera className="size-3.5" />
                            Add After Photo
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowCloseForm(false);
                        setCloseNote("");
                        if (pendingClosePreview) URL.revokeObjectURL(pendingClosePreview);
                        setPendingClosePreview(null);
                        setPendingCloseFile(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
                      disabled={closingInProgress}
                      onClick={handleCloseSnag}
                    >
                      {closingInProgress ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <CheckCircle className="size-3.5" />
                      )}
                      {closingInProgress ? "Closing..." : "Confirm Close"}
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-between gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-500 hover:text-red-600"
                  onClick={handleDelete}
                >
                  Delete
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                  >
                    Close
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setViewMode(false)}
                  >
                    <Pencil className="size-3" />
                    Edit
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* ── Edit / Create Mode ── */}
          {(!isEditing || !viewMode) && (
          <div className="space-y-3">
            {/* Pre-attached photo thumbnails (from job panel — new snags only) */}
            {!isEditing && photoAttachments.length > 0 && (
              <div>
                <label className="text-xs font-medium">Attached Photos</label>
                <div className="mt-1 flex gap-1.5 flex-wrap">
                  {photoAttachments.map((att, i) => (
                    <div
                      key={i}
                      className="relative size-14 rounded border overflow-hidden"
                    >
                      <img
                        src={att.url}
                        alt=""
                        className="size-full object-cover"
                      />
                      <button
                        className="absolute -right-0.5 -top-0.5 rounded-full bg-black/60 p-0.5"
                        onClick={() =>
                          setPhotoAttachments((prev) =>
                            prev.filter((_, idx) => idx !== i)
                          )
                        }
                      >
                        <X className="size-2.5 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium">Description *</label>
              <textarea
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Describe the defect..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Location</label>
                <Input
                  value={form.location}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, location: e.target.value }))
                  }
                  placeholder="e.g. Kitchen, En-suite"
                />
              </div>
              <div>
                <label className="text-xs font-medium">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, priority: e.target.value }))
                  }
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>

            {/* Sub-job selector */}
            {jobs.length > 0 && (
              <div>
                <label className="text-xs font-medium">Sub-Job</label>
                <select
                  value={form.jobId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, jobId: e.target.value }))
                  }
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                >
                  <option value="">Not linked to a job</option>
                  {/* Parent jobs with children → optgroup */}
                  {parentJobs
                    .filter((pj) => childJobsByParent.has(pj.id))
                    .map((pj) => (
                      <optgroup key={pj.id} label={pj.name}>
                        {childJobsByParent.get(pj.id)!.map((child) => (
                          <option key={child.id} value={child.id}>
                            {child.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  {/* Standalone jobs (no children) */}
                  {standaloneJobs.length > 0 && (
                    <optgroup label="Other">
                      {standaloneJobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium">Contractor</label>
                <select
                  value={form.contactId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contactId: e.target.value }))
                  }
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company ? `${c.company} — ${c.name}` : c.name}
                      {c.email ? "" : " (no email)"}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium">Assign To (Internal)</label>
                <select
                  value={form.assignedToId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, assignedToId: e.target.value }))
                  }
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  disabled={loadingUsers}
                >
                  <option value="">Unassigned</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isEditing && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value }))
                    }
                    className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  >
                    <option value="OPEN">Open</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="RESOLVED">Resolved</option>
                    <option value="CLOSED">Closed</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium">Notes</label>
              <textarea
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Additional notes..."
              />
            </div>

            {/* Photo section — available for both create and edit */}
            <div>
              <label className="text-xs font-medium">
                Photos
                {isEditing && ` (${snagPhotos.length})`}
                {!isEditing && pendingFiles.length > 0 && ` (${pendingFiles.length} queued)`}
              </label>

              {/* Existing photo grid (edit mode) */}
              {isEditing && (
                <>
                  {loadingPhotos ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : snagPhotos.length > 0 ? (
                    <div className="mt-2 grid grid-cols-4 gap-1.5">
                      {snagPhotos.map((photo, idx) => (
                        <button
                          key={photo.id}
                          className="group relative aspect-square overflow-hidden rounded-lg border bg-muted cursor-pointer"
                          onClick={() => setLightboxIndex(idx)}
                        >
                          <img
                            src={photo.url}
                            alt={photo.fileName || "Snag photo"}
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
                  ) : null}
                </>
              )}

              {/* Pending photo previews (create mode) */}
              {!isEditing && pendingPreviews.length > 0 && (
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {pendingPreviews.map((previewUrl, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
                    >
                      <img
                        src={previewUrl}
                        alt="Pending upload"
                        className="size-full object-cover"
                      />
                      <button
                        className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5"
                        onClick={() => {
                          URL.revokeObjectURL(previewUrl);
                          setPendingPreviews((prev) =>
                            prev.filter((_, i) => i !== idx)
                          );
                          setPendingFiles((prev) =>
                            prev.filter((_, i) => i !== idx)
                          );
                        }}
                      >
                        <X className="size-2.5 text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Tag selector + upload button */}
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">Tag as:</span>
                  {[
                    { value: "", label: "None" },
                    { value: "before", label: "Before" },
                    { value: "after", label: "After" },
                  ].map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-1"
                    >
                      <input
                        type="radio"
                        name="photoTag"
                        value={opt.value}
                        checked={photoTag === opt.value}
                        onChange={(e) => setPhotoTag(e.target.value)}
                        className="size-3 accent-blue-600"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePhotoUpload(e.target.files)}
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
                      <Camera className="size-3.5" />
                    )}
                    {uploading ? "Uploading..." : "Add Photos"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Photo tag selector for new snags with pre-attached photos */}
            {!isEditing && photoAttachments.length > 0 && (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">Tag attached photos as:</span>
                {[
                  { value: "", label: "None" },
                  { value: "before", label: "Before" },
                  { value: "after", label: "After" },
                ].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="photoTagNew"
                      value={opt.value}
                      checked={photoTag === opt.value}
                      onChange={(e) => setPhotoTag(e.target.value)}
                      className="size-3 accent-blue-600"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}

            {/* Email contractor button — show in edit mode OR after just creating */}
            {(isEditing || justCreatedSnagId) && selectedContact?.email && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5">
                {justCreatedSnagId && (
                  <p className="text-xs font-medium text-green-700 mb-2">
                    Snag raised successfully. Send an email to the contractor?
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <div className="text-xs">
                    <p className="font-medium text-blue-800">
                      Email snag to {selectedContact.company ? `${selectedContact.company} — ${selectedContact.name}` : selectedContact.name}
                    </p>
                    <p className="text-blue-600">{selectedContact.email}</p>
                  </div>
                  <div className="flex gap-2">
                    {justCreatedSnagId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setJustCreatedSnagId(null);
                          onOpenChange(false);
                        }}
                      >
                        Skip
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                      onClick={async () => {
                        await handleSendEmail();
                        if (justCreatedSnagId) {
                          setJustCreatedSnagId(null);
                          onOpenChange(false);
                        }
                      }}
                      disabled={sendingEmail || emailSent}
                    >
                      {sendingEmail ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Mail className="size-3" />
                      )}
                      {emailSent ? "Sent!" : sendingEmail ? "Sending..." : "Send Email"}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!justCreatedSnagId && (
              <div className="flex justify-between gap-2 pt-2">
                <div>
                  {isEditing && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-600"
                      onClick={handleDelete}
                    >
                      Delete
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (isEditing) {
                        resetForm();
                        setViewMode(true);
                      } else {
                        onOpenChange(false);
                      }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={!form.description.trim() || saving}
                    onClick={async () => {
                      await handleSave();
                      if (isEditing) setViewMode(true);
                    }}
                  >
                    {saving
                      ? "Saving..."
                      : isEditing
                        ? "Update"
                        : "Raise Snag"}
                  </Button>
                </div>
              </div>
            )}
          </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Photo Lightbox */}
      <Dialog
        open={lightboxIndex !== null}
        onOpenChange={() => setLightboxIndex(null)}
      >
        <DialogContent className="max-w-3xl p-0 overflow-hidden [&>button]:hidden">
          {lightboxPhoto && (
            <div>
              <div className="relative flex items-center justify-center bg-black min-h-[300px]">
                <img
                  src={lightboxPhoto.url}
                  alt={lightboxPhoto.fileName || "Snag photo"}
                  className="max-h-[70vh] w-auto object-contain"
                />

                <button
                  className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 z-10"
                  onClick={() => setLightboxIndex(null)}
                >
                  <X className="size-4" />
                </button>

                {snagPhotos.length > 1 && (
                  <>
                    <button
                      className="absolute left-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                      onClick={() =>
                        setLightboxIndex((i) =>
                          i !== null && i > 0 ? i - 1 : snagPhotos.length - 1
                        )
                      }
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <button
                      className="absolute right-2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                      onClick={() =>
                        setLightboxIndex((i) =>
                          i !== null && i < snagPhotos.length - 1 ? i + 1 : 0
                        )
                      }
                    >
                      <ChevronRight className="size-5" />
                    </button>
                  </>
                )}
              </div>

              <div className="border-t p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {lightboxPhoto.tag && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white ${TAG_COLORS[lightboxPhoto.tag] || "bg-slate-500"}`}
                    >
                      {lightboxPhoto.tag}
                    </span>
                  )}
                  <span>
                    {lightboxIndex! + 1} / {snagPhotos.length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
