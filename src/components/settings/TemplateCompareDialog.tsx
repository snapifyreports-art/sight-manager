"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Plus, Minus, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { TemplateData, TemplateJobData } from "./types";

/**
 * Side-by-side compare/diff for two templates.
 *
 * Shows every stage that exists in either template, with sub-job
 * deltas inline:
 *   - Stage in A only            → red minus row
 *   - Stage in B only            → green plus row
 *   - Stage in both, same        → grey
 *   - Stage in both, sub-job diff→ amber, with per-sub-job +/- detail
 *
 * MVP scope: name + durationDays differences. Order-level diff and
 * material-level diff are follow-ups.
 */
export function TemplateCompareDialog({
  open,
  onClose,
  templates,
  initialA,
  initialB,
}: {
  open: boolean;
  onClose: () => void;
  templates: TemplateData[];
  initialA?: string;
  initialB?: string;
}) {
  const [aId, setAId] = useState<string | null>(initialA ?? null);
  const [bId, setBId] = useState<string | null>(initialB ?? null);
  const [aDetail, setADetail] = useState<TemplateData | null>(null);
  const [bDetail, setBDetail] = useState<TemplateData | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);

  useEffect(() => {
    setAId(initialA ?? null);
    setBId(initialB ?? null);
  }, [initialA, initialB]);

  // Pull full data when ids change
  useEffect(() => {
    if (!aId) {
      setADetail(null);
      return;
    }
    setLoadingA(true);
    fetch(`/api/plot-templates/${aId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setADetail(d))
      .finally(() => setLoadingA(false));
  }, [aId]);
  useEffect(() => {
    if (!bId) {
      setBDetail(null);
      return;
    }
    setLoadingB(true);
    fetch(`/api/plot-templates/${bId}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setBDetail(d))
      .finally(() => setLoadingB(false));
  }, [bId]);

  const diff = useMemo(() => {
    if (!aDetail || !bDetail) return null;
    return diffTemplates(aDetail, bDetail);
  }, [aDetail, bDetail]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <ArrowLeftRight className="-mt-0.5 mr-2 inline size-4 text-blue-600" />
            Compare templates
          </DialogTitle>
          <DialogDescription>
            Pick two templates to see what's different. Useful when you've
            iterated and lost track of which version has what.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <PickerColumn
            label="A"
            value={aId}
            onChange={setAId}
            templates={templates}
            disabledIds={bId ? [bId] : []}
          />
          <PickerColumn
            label="B"
            value={bId}
            onChange={setBId}
            templates={templates}
            disabledIds={aId ? [aId] : []}
          />
        </div>

        <div className="max-h-[55vh] overflow-y-auto rounded border">
          {loadingA || loadingB ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : !diff ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Pick two templates above to see the diff.
            </p>
          ) : diff.length === 0 ? (
            <p className="p-6 text-center text-sm text-emerald-700">
              Identical — same stages, same sub-jobs, same durations.
            </p>
          ) : (
            <ul className="divide-y text-sm">
              {diff.map((row, i) => (
                <li
                  key={i}
                  className={`flex items-start gap-2 px-3 py-2 ${
                    row.kind === "added"
                      ? "bg-emerald-50/40"
                      : row.kind === "removed"
                        ? "bg-red-50/40"
                        : row.kind === "changed"
                          ? "bg-amber-50/40"
                          : ""
                  }`}
                >
                  <Marker kind={row.kind} />
                  <div className="flex-1">
                    <p className="font-medium">{row.label}</p>
                    {row.detail && (
                      <p className="text-xs text-muted-foreground">
                        {row.detail}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickerColumn({
  label,
  value,
  onChange,
  templates,
  disabledIds,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  templates: TemplateData[];
  disabledIds: string[];
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        Template {label}
      </label>
      <Select
        value={value ?? ""}
        onValueChange={(v) => onChange(v || null)}
      >
        <SelectTrigger>
          <SelectValue>
            {value
              ? templates.find((t) => t.id === value)?.name ?? "Select…"
              : <span className="text-muted-foreground">Select…</span>}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {templates.map((t) => (
            <SelectItem
              key={t.id}
              value={t.id}
              disabled={disabledIds.includes(t.id)}
            >
              {t.name}
              {t.typeLabel ? ` · ${t.typeLabel}` : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Marker({ kind }: { kind: DiffRow["kind"] }) {
  if (kind === "added")
    return <Plus className="mt-0.5 size-4 shrink-0 text-emerald-600" />;
  if (kind === "removed")
    return <Minus className="mt-0.5 size-4 shrink-0 text-red-600" />;
  if (kind === "changed")
    return <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-amber-600" />;
  return <span className="mt-1 size-4 shrink-0" />;
}

interface DiffRow {
  kind: "added" | "removed" | "changed" | "same";
  label: string;
  detail?: string;
}

function jobDays(j: TemplateJobData): number {
  if (j.durationDays && j.durationDays > 0) return j.durationDays;
  if (j.durationWeeks && j.durationWeeks > 0) return j.durationWeeks * 5;
  return 0;
}

function stageKey(j: TemplateJobData): string {
  return (j.stageCode ?? j.name).toLowerCase().trim();
}

function diffTemplates(a: TemplateData, b: TemplateData): DiffRow[] {
  const rows: DiffRow[] = [];
  const aMap = new Map(a.jobs.map((j) => [stageKey(j), j]));
  const bMap = new Map(b.jobs.map((j) => [stageKey(j), j]));

  // Walk in B-then-A-only order to feel chronologically right
  const seen = new Set<string>();
  for (const stageB of b.jobs) {
    const key = stageKey(stageB);
    seen.add(key);
    const stageA = aMap.get(key);
    if (!stageA) {
      rows.push({
        kind: "added",
        label: `+ ${stageB.name}`,
        detail: `Stage exists in B (${a.name}) only does not have it`,
      });
      continue;
    }
    // Compare sub-jobs
    const aKids = stageA.children ?? [];
    const bKids = stageB.children ?? [];
    const aKidMap = new Map(aKids.map((c) => [stageKey(c), c]));
    const bKidMap = new Map(bKids.map((c) => [stageKey(c), c]));
    const childChanges: string[] = [];
    for (const child of bKids) {
      const k = stageKey(child);
      const peer = aKidMap.get(k);
      if (!peer) {
        childChanges.push(`+ ${child.name} (${jobDays(child)}d)`);
      } else if (jobDays(peer) !== jobDays(child)) {
        childChanges.push(
          `~ ${child.name}: A=${jobDays(peer)}d → B=${jobDays(child)}d`,
        );
      }
    }
    for (const child of aKids) {
      const k = stageKey(child);
      if (!bKidMap.has(k)) {
        childChanges.push(`- ${child.name} (${jobDays(child)}d)`);
      }
    }
    if (childChanges.length === 0) {
      // Stage and all sub-jobs match — only push if we want a clean
      // "same" indicator. Skip to keep the diff focused on differences.
      continue;
    }
    rows.push({
      kind: "changed",
      label: stageB.name,
      detail: childChanges.join(" · "),
    });
  }
  // Stages only in A
  for (const stageA of a.jobs) {
    const k = stageKey(stageA);
    if (seen.has(k)) continue;
    rows.push({
      kind: "removed",
      label: `- ${stageA.name}`,
      detail: `Stage exists in A (${b.name}) only does not have it`,
    });
  }
  return rows;
}
