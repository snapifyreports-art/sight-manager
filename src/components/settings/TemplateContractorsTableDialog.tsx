"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, HardHat, Save, RotateCcw, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useConfirm } from "@/hooks/useConfirm";
import type { TemplateData, TemplateJobData } from "./types";

interface ContactRow {
  id: string;
  name: string;
  company: string | null;
  type: string | null;
}

/**
 * Spreadsheet-style "all sub-jobs" contractor assignment dialog.
 *
 * Same pattern as TemplateOrdersTableDialog: every leaf sub-job gets
 * a row with a contractor dropdown. Edits batch — hit Save when done.
 *
 * Surfaced from the validation panel's "N sub-jobs have no contractor
 * assigned" warning. Avoids the "click each pencil one at a time"
 * pain on big templates (the 2-storey has 31 sub-jobs).
 */
export function TemplateContractorsTableDialog({
  open,
  onClose,
  template,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  template: TemplateData;
  onChanged: () => void | Promise<void>;
}) {
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<ContactRow[]>([]);

  const rows = useMemo(() => collectLeafJobs(template), [template]);

  // Local draft state — keyed by sub-job id.
  const initialDrafts = useMemo<Record<string, string | null>>(() => {
    const out: Record<string, string | null> = {};
    for (const r of rows) out[r.job.id] = r.job.contactId ?? null;
    return out;
  }, [rows]);
  const [drafts, setDrafts] = useState<Record<string, string | null>>(
    initialDrafts,
  );

  useEffect(() => {
    if (open) setDrafts(initialDrafts);
  }, [open, initialDrafts]);

  // Lazy-fetch contacts. The /api/contacts endpoint returns all contact
  // rows; we filter to "contractor"-type loosely (any contact with a
  // company is a likely candidate; type is sometimes null on legacy
  // rows).
  useEffect(() => {
    if (!open) return;
    // (May 2026 pattern sweep) Cancellation flag — close+reopen rapidly
    // could land an earlier response on a newer dialog state.
    let cancelled = false;
    fetch("/api/contacts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d: ContactRow[]) => { if (!cancelled) setContacts(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setContacts([]); });
    return () => { cancelled = true; };
  }, [open]);

  const dirtyIds = useMemo(
    () => rows.filter((r) => drafts[r.job.id] !== initialDrafts[r.job.id]).map((r) => r.job.id),
    [drafts, rows, initialDrafts],
  );

  // Group rows by parent stage so the table reads top-to-bottom.
  type Group = { stageName: string; rows: typeof rows };
  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const r of rows) {
      if (!map.has(r.stageName)) {
        map.set(r.stageName, { stageName: r.stageName, rows: [] });
      }
      map.get(r.stageName)!.rows.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  // Bulk-set contractor on all visible rows in a stage. Useful when
  // one contractor handles every sub-job in a stage (e.g. one
  // bricklaying gang covers all 4 brickwork lifts).
  function applyToStage(stageName: string, contactId: string | null) {
    const stageRows = groups.find((g) => g.stageName === stageName)?.rows ?? [];
    setDrafts((prev) => {
      const next = { ...prev };
      for (const r of stageRows) next[r.job.id] = contactId;
      return next;
    });
  }

  async function saveAll() {
    if (dirtyIds.length === 0) return;
    setSaving(true);
    let failures = 0;
    try {
      for (const jobId of dirtyIds) {
        const row = rows.find((r) => r.job.id === jobId);
        if (!row) continue;
        const variantQ = row.job
          ? template.variantId
            ? `?variantId=${template.variantId}`
            : ""
          : "";
        const tplBaseId = template.templateId ?? template.id;
        const res = await fetch(
          `/api/plot-templates/${tplBaseId}/jobs/${jobId}${variantQ}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactId: drafts[jobId] }),
          },
        );
        if (!res.ok) {
          failures += 1;
          toast.error(
            await fetchErrorMessage(
              res,
              `Failed to update ${row.job.name}`,
            ),
          );
        }
      }
      if (failures === 0) {
        toast.success(
          `Updated ${dirtyIds.length} sub-job${dirtyIds.length === 1 ? "" : "s"}`,
        );
      }
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  function discardAll() {
    setDrafts(initialDrafts);
  }

  async function attemptClose() {
    if (dirtyIds.length === 0) {
      onClose();
      return;
    }
    const proceed = await confirm({
      title: `Discard ${dirtyIds.length} unsaved change${dirtyIds.length === 1 ? "" : "s"}?`,
      body: "Your edits will not be saved.",
      confirmLabel: "Discard changes",
      danger: true,
    });
    if (proceed) onClose();
  }

  return (
    <>
      {confirmDialog}
      <Dialog open={open} onOpenChange={(v) => { if (!v) void attemptClose(); }}>
        <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            <HardHat className="-mt-0.5 mr-2 inline size-4 text-blue-600" />
            Assign contractors
          </DialogTitle>
          <DialogDescription>
            One row per sub-job. Use the per-stage dropdown at the top of
            each group to apply the same contractor to all sub-jobs in
            that stage. Changes batch — hit Save when done.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded border">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No sub-jobs yet. Add stages first, then assign contractors here.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-30 border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left"></th>
                  <th className="px-2 py-1.5 text-left">Sub-job</th>
                  <th className="px-2 py-1.5 text-left">Contractor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {groups.map((g) => (
                  <FragmentGroup
                    key={g.stageName}
                    group={g}
                    drafts={drafts}
                    initialDrafts={initialDrafts}
                    contacts={contacts}
                    onChange={(jobId, contactId) =>
                      setDrafts((prev) => ({ ...prev, [jobId]: contactId }))
                    }
                    onApplyToStage={applyToStage}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-between">
          <div className="text-xs text-muted-foreground">
            {dirtyIds.length === 0 ? (
              <span className="flex items-center gap-1.5">
                <Check className="size-3.5 text-emerald-600" />
                All saved
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-blue-700">
                <span className="inline-block size-2 rounded-full bg-blue-500" />
                {dirtyIds.length} unsaved change
                {dirtyIds.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={discardAll}
              disabled={saving || dirtyIds.length === 0}
              className="text-muted-foreground"
            >
              <RotateCcw className="size-3.5" />
              Discard
            </Button>
            <Button variant="outline" onClick={attemptClose} disabled={saving}>
              Close
            </Button>
            <Button onClick={saveAll} disabled={saving || dirtyIds.length === 0}>
              {saving ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="size-3.5" />
                  Save{dirtyIds.length > 0 ? ` (${dirtyIds.length})` : ""}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function FragmentGroup({
  group,
  drafts,
  initialDrafts,
  contacts,
  onChange,
  onApplyToStage,
}: {
  group: { stageName: string; rows: Array<{ job: TemplateJobData; stageName: string }> };
  drafts: Record<string, string | null>;
  initialDrafts: Record<string, string | null>;
  contacts: ContactRow[];
  onChange: (jobId: string, contactId: string | null) => void;
  onApplyToStage: (stageName: string, contactId: string | null) => void;
}) {
  const [bulk, setBulk] = useState<string>("__pick__");
  return (
    <>
      <tr className="bg-slate-50">
        <td className="px-2 py-1" />
        <td className="px-2 py-1 font-semibold text-slate-700">
          {group.stageName}
          <span className="ml-2 text-[10px] font-normal text-muted-foreground">
            ({group.rows.length} sub-job{group.rows.length === 1 ? "" : "s"})
          </span>
        </td>
        <td className="px-2 py-1">
          <Select
            value={bulk}
            onValueChange={(v) => {
              const value = v ?? "__pick__";
              setBulk(value);
              if (value === "__pick__") return;
              const cid = value === "__none__" ? null : value;
              onApplyToStage(group.stageName, cid);
              // Reset the bulk picker so next change re-fires.
              setBulk("__pick__");
            }}
          >
            <SelectTrigger className="h-7 w-full max-w-[260px] text-xs">
              <SelectValue placeholder="Apply to all in this stage…">
                Apply to all in this stage…
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Clear all</SelectItem>
              {contacts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.company ?? c.name}
                  {c.company && c.name ? ` — ${c.name}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>
      </tr>
      {group.rows.map((r) => {
        const dirty = drafts[r.job.id] !== initialDrafts[r.job.id];
        const value = drafts[r.job.id];
        return (
          <tr
            key={r.job.id}
            className={dirty ? "bg-blue-50/40" : "hover:bg-slate-50/50"}
          >
            <td className="px-2 py-1 text-center">
              {dirty && (
                <span
                  className="inline-block size-2 rounded-full bg-blue-500"
                  title="Unsaved change"
                />
              )}
            </td>
            <td className="px-2 py-1 pl-6 font-medium">{r.job.name}</td>
            <td className="px-2 py-1">
              <Select
                value={value ?? "__none__"}
                onValueChange={(v) =>
                  onChange(
                    r.job.id,
                    v === "__none__" ? null : (v ?? null),
                  )
                }
              >
                <SelectTrigger className="h-7 w-full max-w-[260px] text-xs">
                  <SelectValue>
                    {value
                      ? (() => {
                          const c = contacts.find((cc) => cc.id === value);
                          if (!c) return "Unknown";
                          return c.company ?? c.name;
                        })()
                      : <span className="text-muted-foreground">None</span>}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">None</span>
                  </SelectItem>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company ?? c.name}
                      {c.company && c.name ? ` — ${c.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </td>
          </tr>
        );
      })}
    </>
  );
}

function collectLeafJobs(
  template: TemplateData,
): Array<{ job: TemplateJobData; stageName: string }> {
  const result: Array<{ job: TemplateJobData; stageName: string }> = [];
  for (const stage of template.jobs) {
    const kids = stage.children ?? [];
    if (kids.length === 0) {
      // Atomic stage — treat the stage itself as a leaf so it can have
      // a contractor too.
      result.push({ job: stage, stageName: "(atomic)" });
      continue;
    }
    for (const child of kids) {
      result.push({ job: child, stageName: stage.name });
    }
  }
  return result;
}
