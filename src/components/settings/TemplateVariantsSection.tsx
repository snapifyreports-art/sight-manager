"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Layers,
  ChevronRight,
  Copy,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useBusyOverlay } from "@/components/ui/busy-overlay";
import { useConfirmAction } from "@/hooks/useConfirmAction";
import type { TemplateData, TemplateVariantData } from "./types";

/**
 * Variants section inside the editor. Each variant is a fully
 * independent template (its own stages/sub-jobs/orders/materials/
 * documents) — May 2026 rework. Clicking a card hands control to the
 * parent so it can swap to the variant editor view.
 *
 * On creation the user picks "Copy from base", "Copy from another
 * variant", or "Start blank". Copy operations fire on the server.
 */
export function TemplateVariantsSection({
  template,
  onOpenVariant,
}: {
  template: TemplateData;
  onOpenVariant: (variantId: string) => void;
}) {
  const toast = useToast();
  const { withLock } = useBusyOverlay();
  const { confirmAction, dialogs: confirmDialogs } = useConfirmAction();

  const [variants, setVariants] = useState<TemplateVariantData[]>([]);
  const [counts, setCounts] = useState<Record<string, VariantSummary>>({});
  const [loading, setLoading] = useState(true);

  const [openCreate, setOpenCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [seedFrom, setSeedFrom] = useState<string>("base"); // "base" | "blank" | <variantId>
  const [creating, setCreating] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/plot-templates/${template.id}/variants`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data: TemplateVariantData[] = await res.json();
      setVariants(data);

      // Pull counts for each variant in parallel — small per-variant
      // summaries (jobs, orders, materials, docs) for the cards.
      const byId: Record<string, VariantSummary> = {};
      await Promise.all(
        data.map(async (v) => {
          byId[v.id] = await fetchSummary(template.id, v.id);
        }),
      );
      setCounts(byId);
    } finally {
      setLoading(false);
    }
  };

  // (May 2026 pattern sweep) Cancellation flag — switching between
  // templates quickly could land the previous template's variants in
  // the new template's view.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `/api/plot-templates/${template.id}/variants`,
          { cache: "no-store" },
        );
        if (cancelled || !res.ok) return;
        const data: TemplateVariantData[] = await res.json();
        if (cancelled) return;
        setVariants(data);
        const byId: Record<string, VariantSummary> = {};
        await Promise.all(
          data.map(async (v) => {
            byId[v.id] = await fetchSummary(template.id, v.id);
          }),
        );
        if (!cancelled) setCounts(byId);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    // (May 2026 Keith bug report) Lock the screen across the
    // multi-step create flow (POST variant → POST seed → reload list
    // → open editor). Pre-fix the user could click around mid-create
    // and end up in a half-built state.
    await withLock("Creating variant…", async () => {
    try {
      // 1. Create the variant
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
      const created: TemplateVariantData = await res.json();

      // 2. If seeding from another source, fire the seed
      if (seedFrom !== "blank") {
        const seedRes = await fetch(
          `/api/plot-templates/${template.id}/variants/${created.id}/seed`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fromVariantId: seedFrom === "base" ? null : seedFrom,
            }),
          },
        );
        if (!seedRes.ok) {
          toast.error(
            await fetchErrorMessage(seedRes, "Variant created but seed failed"),
          );
          // Continue — the variant exists, user can manually populate.
        }
      }

      setNewName("");
      setNewDesc("");
      setSeedFrom("base");
      setOpenCreate(false);
      toast.success(`Variant "${created.name}" added`);
      await reload();
      // Auto-open the new variant so the user lands on the editor.
      onOpenVariant(created.id);
    } finally {
      setCreating(false);
    }
    });
  }

  function handleDelete(v: TemplateVariantData) {
    confirmAction({
      title: "Delete variant",
      description: (
        <>
          Delete <span className="font-medium text-foreground">{v.name}</span>?
          All its stages, orders, materials and documents are removed. Plots
          already created using this variant keep their snapshots.
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
        await reload();
      },
    });
  }

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
            Each variant is its own full template — own stages, orders,
            materials, drawings. Tap a variant to edit.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpenCreate(true)}>
          <Plus className="size-3.5" />
          Add Variant
        </Button>
      </div>

      {loading && variants.length === 0 ? (
        <div className="flex items-center justify-center rounded border p-4">
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : variants.length === 0 ? (
        <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
          No variants yet. Add one (e.g. "765", "Apple Tree") and choose to
          copy from the base template so you don't restart from scratch.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {variants.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onOpenVariant(v.id)}
              className="group flex items-center gap-3 rounded-lg border bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-sm"
            >
              <Layers className="size-4 shrink-0 text-blue-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.name}</p>
                {v.description && (
                  <p className="line-clamp-1 text-[11px] text-muted-foreground">
                    {v.description}
                  </p>
                )}
                <SummaryLine summary={counts[v.id]} />
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(v);
                }}
                className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                title="Delete variant"
              >
                <Trash2 className="size-3.5" />
              </button>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={openCreate} onOpenChange={setOpenCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add variant</DialogTitle>
            <DialogDescription>
              A variant is its own full template within this group. Copy
              from a starting point so you don&apos;t restart from zero.
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
            <div className="space-y-1.5">
              <Label className="text-xs">Start from</Label>
              <Select
                value={seedFrom}
                onValueChange={(v) => setSeedFrom(v ?? "base")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">
                    <span className="flex items-center gap-2">
                      <Copy className="size-3.5" /> Copy from base template
                    </span>
                  </SelectItem>
                  {variants.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <span className="flex items-center gap-2">
                        <Copy className="size-3.5" /> Copy from "{v.name}"
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="blank">
                    <span className="flex items-center gap-2">
                      <Plus className="size-3.5" /> Start blank
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Stages and sub-jobs will be deep-cloned so editing this
                variant doesn&apos;t affect the source.
              </p>
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

interface VariantSummary {
  jobs: number;
  orders: number;
  materials: number;
  documents: number;
  totalDays: number;
}

async function fetchSummary(
  templateId: string,
  variantId: string,
): Promise<VariantSummary> {
  try {
    const res = await fetch(
      `/api/plot-templates/${templateId}/variants/${variantId}/full`,
      { cache: "no-store" },
    );
    if (!res.ok)
      return {
        jobs: 0,
        orders: 0,
        materials: 0,
        documents: 0,
        totalDays: 0,
      };
    const data = await res.json();
    let jobs = 0;
    let orders = 0;
    let totalDays = 0;
    type J = {
      id: string;
      durationDays: number | null;
      durationWeeks: number | null;
      orders?: unknown[];
      children?: J[];
    };
    function walk(j: J) {
      jobs += 1;
      if (j.orders) orders += j.orders.length;
      const days =
        j.durationDays && j.durationDays > 0
          ? j.durationDays
          : j.durationWeeks
            ? j.durationWeeks * 5
            : 0;
      // Only count leaf days
      if (!j.children || j.children.length === 0) totalDays += days;
      if (j.children) j.children.forEach(walk);
    }
    if (data?.jobs) data.jobs.forEach(walk);
    // Material + document counts via the parallel endpoints
    const [matRes, docRes] = await Promise.all([
      fetch(
        `/api/plot-templates/${templateId}/materials?variantId=${variantId}`,
        { cache: "no-store" },
      ),
      fetch(
        `/api/plot-templates/${templateId}/documents?variantId=${variantId}`,
        { cache: "no-store" },
      ),
    ]);
    const materials = matRes.ok ? (await matRes.json()).length : 0;
    const documents = docRes.ok ? (await docRes.json()).length : 0;
    return { jobs, orders, materials, documents, totalDays };
  } catch {
    return { jobs: 0, orders: 0, materials: 0, documents: 0, totalDays: 0 };
  }
}

function SummaryLine({ summary }: { summary?: VariantSummary }) {
  if (!summary)
    return (
      <p className="mt-0.5 text-[10px] text-muted-foreground">loading…</p>
    );
  const parts: string[] = [];
  if (summary.jobs > 0) parts.push(`${summary.jobs} jobs`);
  if (summary.totalDays > 0) parts.push(`${summary.totalDays} working days`);
  if (summary.orders > 0) parts.push(`${summary.orders} orders`);
  if (summary.materials > 0) parts.push(`${summary.materials} materials`);
  if (summary.documents > 0) parts.push(`${summary.documents} drawings`);
  if (parts.length === 0) parts.push("empty — start setting up");
  return (
    <p className="mt-0.5 text-[10px] text-muted-foreground">{parts.join(" · ")}</p>
  );
}
