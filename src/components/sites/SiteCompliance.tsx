"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { Plus, ShieldCheck, AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";
import { useConfirm } from "@/hooks/useConfirm";

/**
 * (May 2026 audit #57) Per-site compliance tracker UI. Add insurance
 * certs, permits, CDM, etc; mark them ACTIVE / EXPIRED / EXEMPT;
 * attach an expiry date so the daily-cron can warn ahead of expiry.
 */

interface Item {
  id: string;
  name: string;
  category: string | null;
  status: "PENDING" | "ACTIVE" | "EXPIRED" | "EXEMPT";
  expiresAt: string | null;
  notes: string | null;
  document: { id: string; name: string; url: string } | null;
  _derivedExpired: boolean;
}

const STATUS_CLASS: Record<Item["status"], string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  EXPIRED: "bg-red-100 text-red-800",
  EXEMPT: "bg-slate-100 text-slate-600",
};

const CATEGORIES = ["INSURANCE", "PERMIT", "CDM", "ENVIRONMENT", "OTHER"];

export function SiteCompliance({ siteId }: { siteId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/compliance`);
      if (res.ok) setItems(await res.json());
    } finally {
      setLoading(false);
    }
  };

  // (May 2026 pattern sweep) Cancellation flag for site-switch race.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sites/${siteId}/compliance`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !cancelled) setItems(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/compliance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category: category || null,
          expiresAt: expiresAt || null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        toast.error(await fetchErrorMessage(res, "Failed to add"));
        return;
      }
      setOpen(false);
      setName("");
      setCategory("");
      setExpiresAt("");
      setNotes("");
      void refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(it: Item) {
    const ok = await confirm({
      title: `Delete "${it.name}"?`,
      body: "This removes the compliance entry. The attached document (if any) is kept.",
      danger: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    const res = await fetch(`/api/sites/${siteId}/compliance/${it.id}`, {
      method: "DELETE",
    });
    if (res.ok) void refresh();
    else toast.error(await fetchErrorMessage(res, "Failed to delete"));
  }

  async function updateStatus(it: Item, status: Item["status"]) {
    const res = await fetch(`/api/sites/${siteId}/compliance/${it.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) void refresh();
    else toast.error(await fetchErrorMessage(res, "Failed to update"));
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-4 text-muted-foreground" aria-hidden="true" />
          Compliance
          <span className="text-sm font-normal text-muted-foreground">
            ({items.length})
          </span>
        </h2>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Add item
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-muted-foreground">
          <Loader2 className="mx-auto size-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-white p-8 text-center text-sm text-muted-foreground">
          No compliance items recorded yet. Track insurance certs, permits, CDM
          appointments, environment-agency consents, etc. Expired items will
          surface here in red so a manager doesn&apos;t get caught out.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Expires</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.id}
                  className={`border-t ${it._derivedExpired ? "bg-red-50/30" : ""}`}
                >
                  <td className="px-3 py-2">
                    <p className="font-medium">{it.name}</p>
                    {it.notes && (
                      <p className="text-xs text-muted-foreground">{it.notes}</p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {it.category || "—"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={it.status}
                      onChange={(e) =>
                        updateStatus(it, e.target.value as Item["status"])
                      }
                      className={`rounded-full border-0 px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLASS[it.status]}`}
                      aria-label={`Status for ${it.name}`}
                    >
                      <option value="PENDING">PENDING</option>
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="EXPIRED">EXPIRED</option>
                      <option value="EXEMPT">EXEMPT</option>
                    </select>
                    {it._derivedExpired && (
                      <span className="ml-1 inline-flex items-center text-[10px] text-red-700">
                        <AlertTriangle className="mr-0.5 size-3" /> auto-flipped
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {it.expiresAt
                      ? format(parseISO(it.expiresAt), "dd MMM yyyy")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => remove(it)}
                      className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      aria-label={`Delete ${it.name}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add compliance item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="comp-name">Name *</Label>
              <Input
                id="comp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Public liability insurance"
              />
            </div>
            <div>
              <Label htmlFor="comp-cat">Category</Label>
              <select
                id="comp-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
              >
                <option value="">(none)</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="comp-expires">Expires</Label>
              <Input
                id="comp-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="comp-notes">Notes</Label>
              <Input
                id="comp-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={submit} disabled={submitting || !name.trim()}>
              {submitting && <Loader2 className="size-4 animate-spin" />}
              {submitting ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
