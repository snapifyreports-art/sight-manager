"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  LayoutTemplate,
  Briefcase,
  Calendar,
  Trash2,
  FolderOpen,
  Copy,
  Loader2,
  Search,
  X,
  ArrowLeftRight,
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
import { formatWeekRange } from "@/lib/week-format";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TemplateEditor } from "./TemplateEditor";
import { TemplateExtras } from "./TemplateExtras";
import { TemplateVariantsSection } from "./TemplateVariantsSection";
import { TemplateCompareDialog } from "./TemplateCompareDialog";
import { TemplateAuditLog } from "./TemplateAuditLog";
import type { TemplateData } from "./types";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useConfirmAction } from "@/hooks/useConfirmAction";

type SortKey =
  | "recent"
  | "created"
  | "name-asc"
  | "name-desc"
  | "jobs-desc"
  | "weeks-desc";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently edited",
  created: "Recently created",
  "name-asc": "Name A → Z",
  "name-desc": "Name Z → A",
  "jobs-desc": "Most jobs",
  "weeks-desc": "Longest build",
};

export function PlotTemplatesSection({
  initialTemplates,
}: {
  initialTemplates: TemplateData[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [templates, setTemplates] = useState(initialTemplates);
  const [cloningId, setCloningId] = useState<string | null>(null);

  const handleClone = async (id: string, name: string) => {
    setCloningId(id);
    try {
      const res = await fetch(`/api/plot-templates/${id}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${name} (copy)` }),
      });
      if (res.ok) {
        const copy = await res.json();
        toast.success(`Cloned as "${copy.name}"`);
        router.refresh();
      } else {
        toast.error(await fetchErrorMessage(res, "Failed to clone template"));
      }
    } finally {
      setCloningId(null);
    }
  };
  const [editingTemplate, setEditingTemplate] = useState<TemplateData | null>(
    null
  );
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const { confirmAction, dialogs: confirmDialogs } = useConfirmAction();

  // Create form
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newTypeLabel, setNewTypeLabel] = useState("");

  // List filters / sort
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("recent");
  // Draft visibility: "all" shows live + drafts; "live" hides drafts;
  // "drafts" shows only drafts. Keith's most common ask is "what's
  // ready to apply right now?" so default to "all" — but the bar
  // makes it one click to filter to live-only.
  const [draftFilter, setDraftFilter] = useState<"all" | "live" | "drafts">(
    "all",
  );
  const [compareOpen, setCompareOpen] = useState(false);

  // Distinct typeLabels for the filter dropdown. Trim + dedupe so
  // "2 STOREY" / "2 storey" don't both appear; we keep the first
  // casing we see for display.
  const typeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of templates) {
      const raw = t.typeLabel?.trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!seen.has(key)) seen.set(key, raw);
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [templates]);

  // Reset typeFilter if the chosen value disappears (e.g. last template
  // of that type deleted). Avoids "filtered to a value that no longer
  // exists, list mysteriously empty".
  useEffect(() => {
    if (typeFilter === "all") return;
    const stillExists = typeOptions.some(
      (t) => t.toLowerCase() === typeFilter.toLowerCase(),
    );
    if (!stillExists) setTypeFilter("all");
  }, [typeFilter, typeOptions]);

  const filteredTemplates = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = templates.filter((t) => {
      if (draftFilter === "live" && t.isDraft) return false;
      if (draftFilter === "drafts" && !t.isDraft) return false;
      if (typeFilter !== "all") {
        const tl = t.typeLabel?.trim().toLowerCase() ?? "";
        if (tl !== typeFilter.toLowerCase()) return false;
      }
      if (!q) return true;
      const haystack = [t.name, t.typeLabel ?? "", t.description ?? ""]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const totalWeeksOf = (t: TemplateData) =>
      t.jobs.length > 0 ? Math.max(...t.jobs.map((j) => j.endWeek)) : 0;

    switch (sortBy) {
      case "recent":
        list = [...list].sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        break;
      case "created":
        list = [...list].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        break;
      case "name-asc":
        list = [...list].sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        );
        break;
      case "name-desc":
        list = [...list].sort((a, b) =>
          b.name.localeCompare(a.name, undefined, { sensitivity: "base" }),
        );
        break;
      case "jobs-desc":
        list = [...list].sort((a, b) => b.jobs.length - a.jobs.length);
        break;
      case "weeks-desc":
        list = [...list].sort((a, b) => totalWeeksOf(b) - totalWeeksOf(a));
        break;
    }

    return list;
  }, [templates, search, typeFilter, sortBy, draftFilter]);

  const filtersActive =
    search.trim() !== "" ||
    typeFilter !== "all" ||
    sortBy !== "recent" ||
    draftFilter !== "all";

  function clearFilters() {
    setSearch("");
    setTypeFilter("all");
    setSortBy("recent");
    setDraftFilter("all");
  }

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

  function handleOpenDelete(templateId: string, templateName: string) {
    confirmAction({
      title: "Delete Template",
      description: (
        <>
          Delete <span className="font-medium text-foreground">{templateName}</span>?
          This will permanently delete this template and all its jobs and orders.
          This action cannot be undone.
        </>
      ),
      confirmLabel: "Delete Template",
      onConfirm: async () => {
        const res = await fetch(`/api/plot-templates/${templateId}`, { method: "DELETE" });
        if (!res.ok) {
          throw new Error(await fetchErrorMessage(res, "Failed to delete template"));
        }
        setTemplates((prev) => prev.filter((t) => t.id !== templateId));
        toast.success(`${templateName} deleted`);
      },
    });
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
        <TemplateVariantsSection template={editingTemplate} />
        <TemplateExtras templateId={editingTemplate.id} templateName={editingTemplate.name} />
        <TemplateAuditLog templateId={editingTemplate.id} />
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
        <div className="flex flex-wrap items-center gap-2">
          {templates.length >= 2 && (
            <Button
              variant="outline"
              onClick={() => setCompareOpen(true)}
              title="Pick two templates and see what's different"
            >
              <ArrowLeftRight className="size-4" />
              Compare
            </Button>
          )}
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="size-4" />
            New Template
          </Button>
        </div>
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
        <>
          {/* Search + filters */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search templates…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-8"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>

            {typeOptions.length > 0 && (
              <Select
                value={typeFilter}
                onValueChange={(v) => setTypeFilter((v as string) || "all")}
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue>
                    {typeFilter === "all"
                      ? <span className="text-muted-foreground">All types</span>
                      : typeFilter}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {typeOptions.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select
              value={draftFilter}
              onValueChange={(v) =>
                setDraftFilter((v as "all" | "live" | "drafts") || "all")
              }
            >
              <SelectTrigger className="w-full sm:w-36">
                <SelectValue>
                  {draftFilter === "all" && (
                    <span className="text-muted-foreground">All</span>
                  )}
                  {draftFilter === "live" && "Live only"}
                  {draftFilter === "drafts" && "Drafts only"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="live">Live only</SelectItem>
                <SelectItem value="drafts">Drafts only</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy((v as SortKey) || "recent")}
            >
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue>
                  <span className="text-muted-foreground">Sort:</span>{" "}
                  {SORT_LABELS[sortBy]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {SORT_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground"
              >
                Clear
              </Button>
            )}

            <span className="ml-auto text-xs text-muted-foreground">
              {filteredTemplates.length} of {templates.length}
            </span>
          </div>

          {filteredTemplates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="mb-3 rounded-full bg-muted p-3">
                  <Search className="size-6 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold">No matching templates</h3>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  Try a different search term or clear the filters.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              </CardContent>
            </Card>
          ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => {
            const totalWeeks =
              template.jobs.length > 0
                ? Math.max(...template.jobs.map((j) => j.endWeek))
                : 0;

            return (
              <Card
                key={template.id}
                className={`cursor-pointer overflow-hidden border-border/50 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${template.isDraft ? "ring-1 ring-amber-200" : ""}`}
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
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                      {template.isDraft && (
                        <Badge
                          variant="outline"
                          className="border-amber-300 bg-amber-50 text-[10px] font-medium text-amber-800"
                          title="Draft templates are hidden from the apply-to-plot picker"
                        >
                          Draft
                        </Badge>
                      )}
                      {template.typeLabel && (
                        <Badge variant="secondary" className="text-xs">
                          {template.typeLabel}
                        </Badge>
                      )}
                    </div>
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
                            title={`${job.name}: ${formatWeekRange(job.startWeek, job.endWeek)}`}
                          />
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Click to edit
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleClone(template.id, template.name);
                        }}
                        disabled={cloningId === template.id}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-600 disabled:opacity-50"
                        title="Clone this template"
                      >
                        {cloningId === template.id ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenDelete(template.id, template.name);
                        }}
                        className="rounded p-1 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
          )}
        </>
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

      {/* Compare templates */}
      <TemplateCompareDialog
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        templates={templates}
      />

      {/* Shared confirm-delete dialog (useConfirmAction) */}
      {confirmDialogs}
    </div>
  );
}
