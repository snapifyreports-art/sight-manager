"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  LayoutTemplate,
  Briefcase,
  Calendar,
  Trash2,
  FolderOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { TemplateEditor } from "./TemplateEditor";
import { TemplateExtras } from "./TemplateExtras";
import type { TemplateData } from "./types";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

export function PlotTemplatesSection({
  initialTemplates,
}: {
  initialTemplates: TemplateData[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [templates, setTemplates] = useState(initialTemplates);
  const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(
    null
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTypeLabel, setNewTypeLabel] = useState("");

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/plot-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          description: newDescription || null,
          typeLabel: newTypeLabel || null,
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to create template"));
        return;
      }
      const created = await res.json();
      setTemplates((prev) => [created, ...prev]);
      setNewName("");
      setNewDescription("");
      setNewTypeLabel("");
      setCreateDialogOpen(false);
      // Open the editor for the new template
      setEditingTemplate(created);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create template");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/plot-templates/${deletingId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to delete template"));
        return;
      }
      setTemplates((prev) => prev.filter((t) => t.id !== deletingId));
      setDeleteDialogOpen(false);
      setDeletingId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete template");
    } finally {
      setDeleting(false);
    }
  }

  function handleTemplateUpdated(updated: TemplateData) {
    setTemplates((prev) =>
      prev.map((t) => (t.id === updated.id ? updated : t))
    );
    setEditingTemplate(updated);
  }

  // If editing, show the editor + materials/drawings extras panel below
  if (editingTemplate) {
    return (
      <div className="space-y-6">
        <TemplateEditor
          template={editingTemplate}
          onBack={() => {
            setEditingTemplate(null);
            router.refresh();
          }}
          onUpdate={handleTemplateUpdated}
        />
        <TemplateExtras templateId={editingTemplate.id} templateName={editingTemplate.name} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Plot Templates</h2>
          <p className="text-sm text-muted-foreground">
            Create reusable templates for standard plot builds
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="size-4" />
          New Template
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <FolderOpen className="size-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No templates yet</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Create your first plot template to define standard house builds
              with jobs, orders, and timelines.
            </p>
            <Button
              className="mt-4"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="size-4" />
              Create Template
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => {
            const totalWeeks =
              template.jobs.length > 0
                ? Math.max(...template.jobs.map((j) => j.endWeek))
                : 0;

            return (
              <Card
                key={template.id}
                className="cursor-pointer overflow-hidden border-border/50 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                onClick={() => setEditingTemplate(template)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="flex items-center gap-2 truncate">
                        <LayoutTemplate className="size-4 shrink-0 text-blue-600" />
                        {template.name}
                      </CardTitle>
                    </div>
                    {template.typeLabel && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 text-xs"
                      >
                        {template.typeLabel}
                      </Badge>
                    )}
                  </div>
                  {template.description && (
                    <CardDescription className="line-clamp-2">
                      {template.description}
                    </CardDescription>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Briefcase className="size-3.5" />
                      {template.jobs.length}{" "}
                      {template.jobs.length === 1 ? "job" : "jobs"}
                    </span>
                    {totalWeeks > 0 && (
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3.5" />
                        {totalWeeks} {totalWeeks === 1 ? "week" : "weeks"}
                      </span>
                    )}
                  </div>

                  {/* Mini timeline preview */}
                  {template.jobs.length > 0 && totalWeeks > 0 && (
                    <div className="mt-3 flex gap-0.5">
                      {template.jobs.map((job) => {
                        const leftPct =
                          ((job.startWeek - 1) / totalWeeks) * 100;
                        const widthPct =
                          ((job.endWeek - job.startWeek + 1) / totalWeeks) *
                          100;
                        return (
                          <div
                            key={job.id}
                            className="h-1.5 rounded-full bg-blue-500/60"
                            style={{
                              marginLeft: `${leftPct}%`,
                              width: `${widthPct}%`,
                            }}
                            title={`${job.name}: Wk ${job.startWeek}–${job.endWeek}`}
                          />
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Click to edit
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingId(template.id);
                        setDeleteDialogOpen(true);
                      }}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Template Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Template</DialogTitle>
            <DialogDescription>
              Create a new plot template to define standard builds.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="tpl-name">Template Name</Label>
              <Input
                id="tpl-name"
                placeholder="e.g. House - Appletree"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-type">Type Label</Label>
              <Input
                id="tpl-type"
                placeholder="e.g. Detached 4-Bed"
                value={newTypeLabel}
                onChange={(e) => setNewTypeLabel(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea
                id="tpl-desc"
                placeholder="Describe this template..."
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
            >
              {creating ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Template</DialogTitle>
            <DialogDescription>
              This will permanently delete this template and all its jobs and
              orders. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
