"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Copy,
  Loader2,
  Layers,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useConfirmAction } from "@/hooks/useConfirmAction";
import type {
  TemplateData,
  TemplateJobData,
  TemplateVariantData,
} from "./types";

/**
 * Variants section inside the editor. Lets a single template carry
 * multiple plot variants (e.g. Keith's 2-storey covering 765/775/923/
 * 990/1047 sq-ft) without forcing 5 cloned templates that drift over
 * time.
 *
 * MVP scope: per-variant durationDays overrides on any sub-job. Material
 * overrides are wired in the schema but not yet surfaced — follow-up.
 *
 * Apply-template path picks one variant at apply time and the cascade
 * applies the variant's overrides on top of the base template.
 */
export function TemplateVariantsSection({
  template,
}: {
  template: TemplateData;
}) {
  const toast = useToast();
  const { confirmAction, dialogs: confirmDialogs } = useConfirmAction();

  const [variants, setVariants] = useState<TemplateVariantData[]>([]);

  const reload = async () => {
    const res = await fetch(
      `/api/plot-templates/${template.id}/variants`,
      { cache: "no-store" },
    );
    if (res.ok) setVariants(await res.json());
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  const onChanged = reload;

  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Currently-expanded variant for the override editor
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(
        `/api/plot-templates/${template.id}/variants`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newName.trim(),
            description: newDesc.trim() || null,
          }),
        },
      );
      if (!res.ok) {
        toast.error(
          await fetchErrorMessage(res, "Failed to create variant"),
        );
        return;
      }
      setNewName("");
      setNewDesc("");
      setOpenCreate(false);
      await onChanged();
      toast.success("Variant added");
    } finally {
      setCreating(false);
    }
  }

  function handleDelete(v: TemplateVariantData) {
    confirmAction({
      title: "Delete variant",
      description: (
        <>
          Delete <span className="font-medium text-foreground">{v.name}</span>{" "}
          and its overrides? Plots already created using this variant keep
          their snapshots — only the template-side variant is removed.
        </>
      ),
      confirmLabel: "Delete",
      onConfirm: async () => {
        const res = await fetch(
          `/api/plot-templates/${template.id}/variants/${v.id}`,
          { method: "DELETE" },
        );
        if (!res.ok) {
          throw new Error(
            await fetchErrorMessage(res, "Failed to delete variant"),
          );
        }
        await onChanged();
      },
    });
  }

  // Flat list of every leaf job (sub-job that has no children) for the
  // override editor — that's where durationDays makes sense.
  const overrideTargets = collectLeafJobs(template);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Layers className="size-4 text-blue-600" />
            Variants
            <span className="text-sm font-normal text-muted-foreground">
              ({variants.length})
            </span>
          </h3>
          <p className="text-xs text-muted-foreground">
            Per-variant duration overrides. Apply-template asks "which
            variant?" and uses the override values for that plot.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpenCreate(true)}>
          <Plus className="size-3.5" />
          Add Variant
        </Button>
      </div>

      {variants.length === 0 ? (
        <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
          No variants yet. Add one (e.g. "765", "Apple Tree") to give this
          template multiple flavours without cloning it.
        </p>
      ) : (
        <div className="space-y-2">
          {variants.map((v) => (
            <VariantCard
              key={v.id}
              variant={v}
              expanded={expandedId === v.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === v.id ? null : v.id))
              }
              onDelete={() => handleDelete(v)}
              templateId={template.id}
              overrideTargets={overrideTargets}
              onOverrideChanged={onChanged}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add variant</DialogTitle>
            <DialogDescription>
              Give this template a new variant. Same stages and sub-jobs;
              you'll set per-variant duration overrides next.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Variant name</Label>
              <Input
                placeholder="e.g. 765, Apple Tree"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Input
                placeholder="Square footage, layout notes…"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
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
              {creating ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Add Variant
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialogs}
    </div>
  );
}

function VariantCard({
  variant,
  expanded,
  onToggle,
  onDelete,
  templateId,
  overrideTargets,
  onOverrideChanged,
}: {
  variant: TemplateVariantData;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  templateId: string;
  overrideTargets: Array<{
    id: string;
    name: string;
    parentName: string;
    baseDays: number;
  }>;
  onOverrideChanged: () => void | Promise<void>;
}) {
  const overrideMap = new Map(
    variant.jobOverrides.map((o) => [o.templateJobId, o.durationDays]),
  );
  const overrideCount = variant.jobOverrides.filter(
    (o) => o.durationDays != null,
  ).length;

  return (
    <div className="rounded-lg border bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <Layers className="size-4 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{variant.name}</p>
            {variant.description && (
              <p className="truncate text-[11px] text-muted-foreground">
                {variant.description}
              </p>
            )}
          </div>
          <span className="shrink-0 rounded bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
            {overrideCount} override{overrideCount === 1 ? "" : "s"}
          </span>
        </button>
        <button
          onClick={onDelete}
          className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
          title="Delete variant"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-1 border-t bg-slate-50/40 p-3 text-xs">
          <p className="text-muted-foreground">
            Set a duration override for any sub-job. Leave blank to inherit
            the base template value.
          </p>
          <div className="mt-2 max-h-[280px] space-y-1 overflow-y-auto">
            {overrideTargets.length === 0 ? (
              <p className="italic text-muted-foreground">
                No sub-jobs yet — add stages first.
              </p>
            ) : (
              overrideTargets.map((t) => (
                <OverrideRow
                  key={t.id}
                  target={t}
                  override={overrideMap.get(t.id) ?? null}
                  templateId={templateId}
                  variantId={variant.id}
                  onChanged={onOverrideChanged}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function OverrideRow({
  target,
  override,
  templateId,
  variantId,
  onChanged,
}: {
  target: { id: string; name: string; parentName: string; baseDays: number };
  override: number | null;
  templateId: string;
  variantId: string;
  onChanged: () => void | Promise<void>;
}) {
  const [draft, setDraft] = useState<string>(
    override != null ? String(override) : "",
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(override != null ? String(override) : "");
  }, [override]);

  async function commit() {
    const trimmed = draft.trim();
    const newVal = trimmed === "" ? null : parseInt(trimmed, 10);
    if (
      (newVal == null && override == null) ||
      (newVal != null && newVal === override)
    ) {
      return;
    }
    if (newVal != null && (!Number.isFinite(newVal) || newVal < 1)) {
      setDraft(override != null ? String(override) : "");
      return;
    }
    setSaving(true);
    try {
      await fetch(
        `/api/plot-templates/${templateId}/variants/${variantId}/job-overrides`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateJobId: target.id,
            durationDays: newVal,
          }),
        },
      );
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  const overridden = override != null && override !== target.baseDays;

  return (
    <div className="flex items-center gap-2 rounded bg-white px-2 py-1 ring-1 ring-border/40">
      <span className="min-w-0 flex-1 truncate">
        <span className="text-muted-foreground">{target.parentName}</span>
        <span className="px-1 text-muted-foreground">›</span>
        <span className="font-medium">{target.name}</span>
      </span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        base {target.baseDays}d
      </span>
      <Input
        type="number"
        min={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={saving}
        placeholder={`= ${target.baseDays}`}
        className={`h-7 w-20 text-center text-xs ${
          overridden ? "border-blue-300 bg-blue-50" : ""
        }`}
      />
      <span className="w-3 shrink-0">
        {saving ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : overridden ? (
          <Check className="size-3 text-blue-600" />
        ) : null}
      </span>
    </div>
  );
}

function collectLeafJobs(template: TemplateData): Array<{
  id: string;
  name: string;
  parentName: string;
  baseDays: number;
}> {
  const result: Array<{
    id: string;
    name: string;
    parentName: string;
    baseDays: number;
  }> = [];
  function leafDays(j: TemplateJobData): number {
    if (j.durationDays && j.durationDays > 0) return j.durationDays;
    if (j.durationWeeks && j.durationWeeks > 0) return j.durationWeeks * 5;
    return 0;
  }
  for (const stage of template.jobs) {
    const kids = stage.children ?? [];
    if (kids.length === 0) {
      result.push({
        id: stage.id,
        name: stage.name,
        parentName: "(stage)",
        baseDays: leafDays(stage),
      });
      continue;
    }
    for (const child of kids) {
      // For now, only first-level sub-jobs are override-able. Three-level
      // templates are uncommon and adding the third level here can come
      // later if needed.
      result.push({
        id: child.id,
        name: child.name,
        parentName: stage.name,
        baseDays: leafDays(child),
      });
    }
  }
  return result;
}
