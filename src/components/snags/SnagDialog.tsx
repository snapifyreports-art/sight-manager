"use client";

import { useState, useRef } from "react";
import { Camera, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SnagUser {
  id: string;
  name: string;
}

interface SnagData {
  id: string;
  description: string;
  location: string | null;
  priority: string;
  status: string;
  assignedTo: SnagUser | null;
  raisedBy: SnagUser;
  notes: string | null;
  _count: { photos: number };
}

interface SnagDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snag?: SnagData | null;
  plotId: string;
  users: SnagUser[];
  onSaved: () => void;
}

export function SnagDialog({
  open,
  onOpenChange,
  snag,
  plotId,
  users,
  onSaved,
}: SnagDialogProps) {
  const isEditing = !!snag;
  const [form, setForm] = useState({
    description: snag?.description || "",
    location: snag?.location || "",
    priority: snag?.priority || "MEDIUM",
    assignedToId: snag?.assignedTo?.id || "",
    notes: snag?.notes || "",
    status: snag?.status || "OPEN",
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoTag, setPhotoTag] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    if (!form.description.trim()) return;
    setSaving(true);
    try {
      if (isEditing) {
        await fetch(`/api/snags/${snag!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: form.description,
            location: form.location || null,
            priority: form.priority,
            assignedToId: form.assignedToId || null,
            notes: form.notes || null,
            status: form.status,
          }),
        });
      } else {
        await fetch(`/api/plots/${plotId}/snags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: form.description,
            location: form.location || null,
            priority: form.priority,
            assignedToId: form.assignedToId || null,
            notes: form.notes || null,
          }),
        });
      }
      onSaved();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !snag) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("photos", f));
      if (photoTag) formData.append("tag", photoTag);
      await fetch(`/api/snags/${snag.id}/photos`, {
        method: "POST",
        body: formData,
      });
      onSaved();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!snag || !confirm("Delete this snag?")) return;
    await fetch(`/api/snags/${snag.id}`, { method: "DELETE" });
    onSaved();
    onOpenChange(false);
  };

  // Reset form when dialog opens with different snag
  const resetForm = () => {
    setForm({
      description: snag?.description || "",
      location: snag?.location || "",
      priority: snag?.priority || "MEDIUM",
      assignedToId: snag?.assignedTo?.id || "",
      notes: snag?.notes || "",
      status: snag?.status || "OPEN",
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) resetForm();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Snag" : "Raise Snag"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Assign To</label>
              <select
                value={form.assignedToId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, assignedToId: e.target.value }))
                }
                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            {isEditing && (
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
            )}
          </div>

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

          {/* Photo upload for existing snags */}
          {isEditing && (
            <div>
              <label className="text-xs font-medium">
                Photos ({snag!._count.photos})
              </label>
              <div className="mt-1 space-y-2">
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">Tag as:</span>
                  {[
                    { value: "", label: "None" },
                    { value: "before", label: "Before" },
                    { value: "after", label: "After" },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-1">
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
          )}

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
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!form.description.trim() || saving}
                onClick={handleSave}
              >
                {saving
                  ? "Saving..."
                  : isEditing
                    ? "Update"
                    : "Raise Snag"}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
