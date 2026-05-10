"use client";

import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import {
  CheckSquare,
  Square,
  Plus,
  Loader2,
  Trash2,
  FileWarning,
  ClipboardCheck,
  PoundSterling,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
 * (May 2026 audit #175 + #169 + #177) Combined panel for plot-level
 * quality / commercial / warranty tracking. Three sections accessed
 * via sub-tab:
 *
 *   Pre-start  — checklist before work starts
 *   Variations — customer/designer-requested changes with cost + days
 *   Defects    — post-handover warranty issues
 *
 * Each uses the matching REST endpoint set on /api/plots/[id]/…
 */

interface Check {
  id: string;
  label: string;
  checked: boolean;
  checkedAt: string | null;
  notes: string | null;
}

interface Variation {
  id: string;
  ref: string | null;
  title: string;
  description: string | null;
  requestedBy: string | null;
  costDelta: number | null;
  daysDelta: number | null;
  status: "REQUESTED" | "APPROVED" | "REJECTED" | "IMPLEMENTED";
  createdAt: string;
}

interface Defect {
  id: string;
  ref: string | null;
  title: string;
  description: string;
  status: "REPORTED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  reportedAt: string;
  resolvedAt: string | null;
}

type Tab = "checks" | "variations" | "defects";

export function PlotQualityPanel({ plotId }: { plotId: string }) {
  const [tab, setTab] = useState<Tab>("checks");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b">
        <TabButton active={tab === "checks"} onClick={() => setTab("checks")} icon={ClipboardCheck} label="Pre-start" />
        <TabButton active={tab === "variations"} onClick={() => setTab("variations")} icon={PoundSterling} label="Variations" />
        <TabButton active={tab === "defects"} onClick={() => setTab("defects")} icon={FileWarning} label="Defects" />
      </div>
      {tab === "checks" && <ChecksSection plotId={plotId} />}
      {tab === "variations" && <VariationsSection plotId={plotId} />}
      {tab === "defects" && <DefectsSection plotId={plotId} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
        active
          ? "border-blue-600 text-blue-600 font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </button>
  );
}

// ───────── Pre-start checks ─────────────────────────────────────────────

function ChecksSection({ plotId }: { plotId: string }) {
  const [checks, setChecks] = useState<Check[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/plots/${plotId}/pre-start-checks`);
      if (res.ok) setChecks(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotId]);

  async function add() {
    if (!newLabel.trim()) return;
    const res = await fetch(`/api/plots/${plotId}/pre-start-checks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim() }),
    });
    if (res.ok) {
      setNewLabel("");
      void refresh();
    } else toast.error(await fetchErrorMessage(res, "Failed to add"));
  }

  async function toggle(c: Check) {
    const res = await fetch(`/api/plots/${plotId}/pre-start-checks/${c.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked: !c.checked }),
    });
    if (res.ok) void refresh();
  }

  async function remove(c: Check) {
    const ok = await confirm({
      title: `Remove "${c.label}"?`,
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/plots/${plotId}/pre-start-checks/${c.id}`, {
      method: "DELETE",
    });
    if (res.ok) void refresh();
  }

  const done = checks.filter((c) => c.checked).length;
  return (
    <div className="space-y-3">
      {confirmDialog}
      {checks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {done} of {checks.length} checks complete
        </p>
      )}
      {loading ? (
        <Loader2 className="mx-auto size-4 animate-spin" />
      ) : (
        <ul className="space-y-1">
          {checks.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-2 rounded border bg-white px-3 py-2"
            >
              <button
                type="button"
                onClick={() => toggle(c)}
                aria-pressed={c.checked}
                aria-label={c.checked ? "Untick" : "Tick"}
                className="text-blue-600"
              >
                {c.checked ? (
                  <CheckSquare className="size-5" aria-hidden />
                ) : (
                  <Square className="size-5 text-slate-400" aria-hidden />
                )}
              </button>
              <span
                className={`flex-1 text-sm ${
                  c.checked ? "text-slate-400 line-through" : "text-slate-800"
                }`}
              >
                {c.label}
              </span>
              {c.checkedAt && (
                <span className="text-[11px] text-slate-500">
                  {format(parseISO(c.checkedAt), "dd MMM HH:mm")}
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(c)}
                aria-label={`Delete ${c.label}`}
                className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New check (e.g. Scaffold inspected)"
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <Button onClick={add} disabled={!newLabel.trim()}>
          <Plus className="size-4" /> Add
        </Button>
      </div>
    </div>
  );
}

// ───────── Variations ────────────────────────────────────────────────────

function VariationsSection({ plotId }: { plotId: string }) {
  const [vars, setVars] = useState<Variation[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requestedBy, setRequestedBy] = useState("");
  const [costDelta, setCostDelta] = useState("");
  const [daysDelta, setDaysDelta] = useState("");
  const toast = useToast();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/plots/${plotId}/variations`);
      if (res.ok) setVars(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotId]);

  async function submit() {
    if (!title.trim()) return;
    const res = await fetch(`/api/plots/${plotId}/variations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description || null,
        requestedBy: requestedBy || null,
        costDelta: costDelta ? Number(costDelta) : null,
        daysDelta: daysDelta ? Number(daysDelta) : null,
      }),
    });
    if (!res.ok) {
      toast.error(await fetchErrorMessage(res, "Failed to add"));
      return;
    }
    setOpen(false);
    setTitle("");
    setDescription("");
    setRequestedBy("");
    setCostDelta("");
    setDaysDelta("");
    void refresh();
  }

  async function updateStatus(v: Variation, status: Variation["status"]) {
    await fetch(`/api/plots/${plotId}/variations/${v.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    void refresh();
  }

  const totalCost = vars
    .filter((v) => v.status === "APPROVED" || v.status === "IMPLEMENTED")
    .reduce((s, v) => s + (v.costDelta ?? 0), 0);
  const totalDays = vars
    .filter((v) => v.status === "APPROVED" || v.status === "IMPLEMENTED")
    .reduce((s, v) => s + (v.daysDelta ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Approved + implemented totals: £{totalCost.toLocaleString("en-GB")} ·{" "}
          {totalDays > 0 ? `+${totalDays}` : totalDays} working days
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> New variation
        </Button>
      </div>
      {loading ? (
        <Loader2 className="mx-auto size-4 animate-spin" />
      ) : vars.length === 0 ? (
        <p className="rounded border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
          No variations recorded. Add customer- or designer-requested changes
          here with cost + days impact for sign-off.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Ref</th>
                <th className="px-3 py-2 text-left">Title</th>
                <th className="px-3 py-2 text-left">Requested by</th>
                <th className="px-3 py-2 text-right">£</th>
                <th className="px-3 py-2 text-right">Days</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {vars.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{v.ref}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{v.title}</p>
                    {v.description && (
                      <p className="text-xs text-muted-foreground">
                        {v.description}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{v.requestedBy || "—"}</td>
                  <td className="px-3 py-2 text-right text-xs">
                    {v.costDelta !== null ? `£${v.costDelta.toLocaleString("en-GB")}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {v.daysDelta !== null ? v.daysDelta : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={v.status}
                      onChange={(e) =>
                        updateStatus(v, e.target.value as Variation["status"])
                      }
                      className="rounded border px-1.5 py-0.5 text-[11px]"
                    >
                      <option value="REQUESTED">REQUESTED</option>
                      <option value="APPROVED">APPROVED</option>
                      <option value="REJECTED">REJECTED</option>
                      <option value="IMPLEMENTED">IMPLEMENTED</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New variation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="v-title">Title *</Label>
              <Input
                id="v-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="v-desc">Description</Label>
              <Textarea
                id="v-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>
            <div>
              <Label htmlFor="v-by">Requested by</Label>
              <Input
                id="v-by"
                value={requestedBy}
                onChange={(e) => setRequestedBy(e.target.value)}
                placeholder="Customer / Designer / Site team"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="v-cost">Cost delta (£)</Label>
                <Input
                  id="v-cost"
                  type="number"
                  value={costDelta}
                  onChange={(e) => setCostDelta(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="v-days">Days delta</Label>
                <Input
                  id="v-days"
                  type="number"
                  value={daysDelta}
                  onChange={(e) => setDaysDelta(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={submit} disabled={!title.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ───────── Defects ──────────────────────────────────────────────────────

function DefectsSection({ plotId }: { plotId: string }) {
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const toast = useToast();

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/plots/${plotId}/defects`);
      if (res.ok) setDefects(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotId]);

  async function submit() {
    if (!title.trim() || !description.trim()) return;
    const res = await fetch(`/api/plots/${plotId}/defects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim(),
      }),
    });
    if (!res.ok) {
      toast.error(await fetchErrorMessage(res, "Failed to add"));
      return;
    }
    setOpen(false);
    setTitle("");
    setDescription("");
    void refresh();
  }

  async function updateStatus(d: Defect, status: Defect["status"]) {
    await fetch(`/api/plots/${plotId}/defects/${d.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    void refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Post-handover warranty defects. Distinct from snags (snags are
          pre-handover QA).
        </p>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Report defect
        </Button>
      </div>
      {loading ? (
        <Loader2 className="mx-auto size-4 animate-spin" />
      ) : defects.length === 0 ? (
        <p className="rounded border border-dashed bg-white p-6 text-center text-sm text-muted-foreground">
          No defects reported.
        </p>
      ) : (
        <div className="space-y-2">
          {defects.map((d) => (
            <div key={d.id} className="rounded-lg border bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs">
                    {d.ref}
                  </span>
                  <p className="font-medium">{d.title}</p>
                </div>
                <select
                  value={d.status}
                  onChange={(e) =>
                    updateStatus(d, e.target.value as Defect["status"])
                  }
                  className="rounded border px-1.5 py-0.5 text-[11px]"
                >
                  <option value="REPORTED">REPORTED</option>
                  <option value="IN_PROGRESS">IN PROGRESS</option>
                  <option value="RESOLVED">RESOLVED</option>
                  <option value="CLOSED">CLOSED</option>
                </select>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {d.description}
              </p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Reported {format(parseISO(d.reportedAt), "dd MMM yyyy")}
                {d.resolvedAt
                  ? ` · Resolved ${format(parseISO(d.resolvedAt), "dd MMM yyyy")}`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report defect</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="d-title">Title *</Label>
              <Input
                id="d-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="d-desc">Description *</Label>
              <Textarea
                id="d-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={submit} disabled={!title.trim() || !description.trim()}>
              Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
