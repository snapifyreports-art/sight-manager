"use client";

/**
 * Single source of truth for "assign or change contractor(s) on a job".
 *
 * Before: JobDetailClient and JobWeekPanel each fetched /api/contacts,
 * rendered a multi-select dialog, and PUT /api/jobs/:id/contractors
 * with their own state + validation. Copy drifted ("Assign Contractor"
 * vs "Pick Contractor") and error handling differed.
 *
 * Now: `openPicker(job, opts)` opens the dialog. `opts.mode = "single"`
 * forces a single-pick UX (used by JobWeekPanel when targeting a child
 * job); "multi" is the default for parent jobs that can have multiple
 * trade contractors.
 *
 * On save: PUT /api/jobs/:id/contractors with contactIds[]. The `onSaved`
 * callback receives the updated contractor list so the caller can update
 * its local state without a full refetch.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Check, HardHat, Loader2, Search } from "lucide-react";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ContractorContact {
  id: string;
  name: string;
  company: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface AssignableJob {
  id: string;
  name: string;
}

interface OpenPickerOptions {
  /** Contractor IDs currently assigned — pre-selected in the dialog. */
  currentContactIds?: string[];
  /** "single" allows only one selection at a time. Default "multi". */
  mode?: "single" | "multi";
}

interface PickerResult {
  openPicker: (job: AssignableJob, opts?: OpenPickerOptions) => void;
  isLoading: boolean;
  dialogs: ReactNode;
}

export function useJobContractorPicker(
  /** Called with the updated contractor list returned by the API. */
  onSaved?: (job: AssignableJob, contractors: ContractorContact[]) => void,
): PickerResult {
  const toast = useToast();
  const [target, setTarget] = useState<AssignableJob | null>(null);
  const [mode, setMode] = useState<"single" | "multi">("multi");
  const [allContacts, setAllContacts] = useState<ContractorContact[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [saving, setSaving] = useState(false);

  const openPicker = useCallback((job: AssignableJob, opts?: OpenPickerOptions) => {
    setTarget(job);
    setMode(opts?.mode ?? "multi");
    setSelectedIds(new Set(opts?.currentContactIds ?? []));
    setSearch("");
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    setSearch("");
  }, []);

  // Fetch contacts when dialog opens (only first time — cached afterward).
  useEffect(() => {
    if (!target || allContacts.length > 0) return;
    // (May 2026 pattern sweep) Cancellation flag — rapid open/close of
    // different jobs could let an older response land.
    let cancelled = false;
    setLoadingContacts(true);
    (async () => {
      try {
        const res = await fetch("/api/contacts?type=CONTRACTOR");
        if (cancelled) return;
        if (!res.ok) {
          toast.error(await fetchErrorMessage(res, "Failed to load contractors"));
          return;
        }
        const data = await res.json() as ContractorContact[];
        if (cancelled) return;
        setAllContacts(data);
      } catch (e) {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : "Failed to load contractors");
      } finally {
        if (!cancelled) setLoadingContacts(false);
      }
    })();
    return () => { cancelled = true; };
  }, [target, allContacts.length, toast]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (mode === "single") {
        // Single-mode: selecting a new one replaces the old one.
        if (next.has(id)) next.delete(id);
        else { next.clear(); next.add(id); }
      } else {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  async function save() {
    if (!target) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${target.id}/contractors`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactIds: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to save contractors"));
        return;
      }
      // API returns JobContractor[] joined with contact — extract contacts.
      const updated = await res.json() as Array<{ contact: ContractorContact | null }>;
      const contractors = updated
        .map((jc) => jc.contact)
        .filter((c): c is ContractorContact => c !== null);
      toast.success(
        contractors.length === 0
          ? "Contractor unassigned"
          : `${contractors.length} contractor${contractors.length !== 1 ? "s" : ""} assigned`
      );
      const savedJob = target;
      close();
      onSaved?.(savedJob, contractors);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save contractors");
    } finally {
      setSaving(false);
    }
  }

  const filtered = search.trim()
    ? allContacts.filter((c) => {
        const q = search.trim().toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.company?.toLowerCase().includes(q) ?? false)
        );
      })
    : allContacts;

  const dialogs = (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HardHat className="size-4 text-blue-600" />
            {mode === "single" ? "Assign Contractor" : "Assign Contractors"}
          </DialogTitle>
          <DialogDescription>
            {target?.name}
            {mode === "multi" && (
              <span className="ml-1 text-muted-foreground">· pick one or more</span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {allContacts.length > 6 && (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or company..."
                className="pl-8 text-sm"
              />
            </div>
          )}

          <div className="max-h-80 overflow-y-auto rounded-md border">
            {loadingContacts && allContacts.length === 0 ? (
              <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
                <Loader2 className="mr-2 size-3.5 animate-spin" /> Loading contractors…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {search ? "No matches" : "No contractors yet — add one from Contacts"}
              </div>
            ) : (
              filtered.map((c) => {
                const checked = selectedIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 border-b px-3 py-2 text-left text-sm last:border-b-0 transition-colors",
                      checked ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-accent"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{c.name}</p>
                      {c.company && (
                        <p className="truncate text-xs text-muted-foreground">{c.company}</p>
                      )}
                    </div>
                    {checked && <Check className="size-4 shrink-0 text-blue-600" />}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
            Save{mode === "multi" ? ` (${selectedIds.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { openPicker, isLoading: saving, dialogs };
}
