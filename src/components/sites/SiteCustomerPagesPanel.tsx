"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  EyeOff,
  Eye,
  Heart,
  Loader2,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/hooks/useConfirm";

/**
 * Site-level overview of every plot's customer-facing /progress/<token>
 * link. Lists all plots in the site, each row showing:
 *   - Plot number / house type
 *   - Link state (active / disabled / not generated yet)
 *   - Quick actions: copy, open in new tab, enable/disable, rotate
 *   - Counts of journal entries + photos shared (so admin can see at
 *     a glance which plots have rich content vs which are bare)
 *
 * Backed by GET /api/sites/[id]/customer-links — a server-side
 * aggregation that joins Plot + counts in a single round trip.
 */

interface PlotRow {
  id: string;
  plotNumber: string | null;
  houseType: string | null;
  shareToken: string | null;
  shareEnabled: boolean;
  journalCount: number;
  sharedPhotoCount: number;
}

export function SiteCustomerPagesPanel({ siteId }: { siteId: string }) {
  const toast = useToast();
  const { copy, copiedKey } = useCopyToClipboard();
  const { confirm, dialog: confirmDialog } = useConfirm();

  const [rows, setRows] = useState<PlotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "disabled" | "none">("all");

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/sites/${siteId}/customer-links`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setRows(data);
    }
    setLoading(false);
  }, [siteId]);

  // (May 2026 pattern sweep) Cancellation flag for site-switch race.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sites/${siteId}/customer-links`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && !cancelled) setRows(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [siteId]);

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const urlFor = (token: string) => `${baseUrl}/progress/${token}`;

  async function generate(plotId: string) {
    setBusyId(plotId);
    try {
      const res = await fetch(`/api/plots/${plotId}/customer-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        toast.error("Couldn't generate link");
        return;
      }
      const data = await res.json();
      setRows((prev) =>
        prev.map((r) =>
          r.id === plotId ? { ...r, shareToken: data.token, shareEnabled: data.enabled } : r,
        ),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function rotate(plotId: string) {
    const ok = await confirm({
      title: "Rotate this customer link?",
      body: "The previous URL will stop working immediately. Anyone with the old link will see 'This link isn't active' and you'll need to send them the new one.",
      confirmLabel: "Rotate link",
      danger: true,
    });
    if (!ok) return;
    setBusyId(plotId);
    try {
      const res = await fetch(`/api/plots/${plotId}/customer-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate: true }),
      });
      if (!res.ok) {
        toast.error("Couldn't rotate link");
        return;
      }
      const data = await res.json();
      setRows((prev) =>
        prev.map((r) =>
          r.id === plotId ? { ...r, shareToken: data.token, shareEnabled: data.enabled } : r,
        ),
      );
      toast.success("Link rotated");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleEnabled(plotId: string, enabled: boolean) {
    setBusyId(plotId);
    try {
      const res = await fetch(`/api/plots/${plotId}/customer-link`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        toast.error("Couldn't update link");
        return;
      }
      const data = await res.json();
      setRows((prev) =>
        prev.map((r) => (r.id === plotId ? { ...r, shareEnabled: data.enabled } : r)),
      );
    } finally {
      setBusyId(null);
    }
  }

  // Filter + search
  const filtered = rows.filter((r) => {
    if (search) {
      const term = search.toLowerCase();
      const hits =
        (r.plotNumber || "").toLowerCase().includes(term) ||
        (r.houseType || "").toLowerCase().includes(term);
      if (!hits) return false;
    }
    if (statusFilter === "active" && (!r.shareToken || !r.shareEnabled)) return false;
    if (statusFilter === "disabled" && (!r.shareToken || r.shareEnabled)) return false;
    if (statusFilter === "none" && r.shareToken) return false;
    return true;
  });

  const stats = {
    total: rows.length,
    active: rows.filter((r) => r.shareToken && r.shareEnabled).length,
    disabled: rows.filter((r) => r.shareToken && !r.shareEnabled).length,
    none: rows.filter((r) => !r.shareToken).length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div>
        <div className="flex items-center gap-2">
          <Heart className="size-5 text-rose-500" />
          <h2 className="text-lg font-semibold">Customer Pages</h2>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Share-link overview for every plot. The customer page shows progress milestones, your story updates and ticked photos — never dates, snags or contractors.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="Total plots" value={stats.total} />
        <StatCard label="Active links" value={stats.active} accent="emerald" />
        <StatCard label="Disabled" value={stats.disabled} accent="amber" />
        <StatCard label="No link yet" value={stats.none} accent="slate" />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plot number or house type"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5 text-xs">
          {(["all", "active", "disabled", "none"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setStatusFilter(opt)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                statusFilter === opt
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {opt === "all" ? "All" : opt === "none" ? "Not generated" : opt[0].toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Plot list — desktop table + mobile card layout */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-12 text-center text-sm text-muted-foreground">
          {rows.length === 0
            ? "No plots on this site yet."
            : "No plots match your filters."}
        </div>
      ) : (
        <>
          {/* Desktop table — md and up */}
          <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Plot</th>
                  <th className="px-4 py-2 text-left">Link</th>
                  <th className="px-4 py-2 text-center">Updates</th>
                  <th className="px-4 py-2 text-center">Photos</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => {
                  const url = r.shareToken ? urlFor(r.shareToken) : null;
                  const busy = busyId === r.id;
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-slate-900">
                          Plot {r.plotNumber || "—"}
                        </div>
                        <div className="text-xs text-slate-500">{r.houseType || "—"}</div>
                      </td>
                      <td className="px-4 py-2.5">
                        {url ? (
                          <div className="flex items-center gap-2">
                            {/* (#172) Truncated path is now clickable —
                                opens the customer page in a new tab. */}
                            <a
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className={`flex-1 truncate rounded bg-slate-50 px-2 py-1 font-mono text-[11px] hover:bg-blue-50 hover:text-blue-700 ${
                                r.shareEnabled ? "text-slate-700" : "text-amber-700 line-through pointer-events-none"
                              }`}
                              title={url}
                            >
                              /progress/{r.shareToken!.slice(0, 12)}…
                            </a>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                                r.shareEnabled
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {r.shareEnabled ? "Active" : "Disabled"}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs italic text-slate-400">Not generated yet</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs">
                        <span className={r.journalCount > 0 ? "font-medium text-slate-700" : "text-slate-400"}>
                          {r.journalCount}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs">
                        <span className={r.sharedPhotoCount > 0 ? "font-medium text-slate-700" : "text-slate-400"}>
                          {r.sharedPhotoCount}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {url ? (
                            <>
                              <button
                                type="button"
                                onClick={() => copy(url, r.id)}
                                disabled={!r.shareEnabled}
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                                title="Copy link"
                              >
                                {copiedKey === r.id ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
                              </button>
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className={`rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 ${
                                  !r.shareEnabled ? "pointer-events-none opacity-40" : ""
                                }`}
                                title="Open in new tab"
                              >
                                <ExternalLink className="size-4" />
                              </a>
                              <button
                                type="button"
                                onClick={() => toggleEnabled(r.id, !r.shareEnabled)}
                                disabled={busy}
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                title={r.shareEnabled ? "Disable" : "Enable"}
                              >
                                {r.shareEnabled ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => rotate(r.id)}
                                disabled={busy}
                                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                title="Rotate (invalidate old URL)"
                              >
                                <RefreshCw className="size-4" />
                              </button>
                              <Link
                                href={`/sites/${siteId}/plots/${r.id}?tab=customer`}
                                className="ml-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Manage
                              </Link>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => generate(r.id)} disabled={busy}>
                              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Generate"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* (#172) Mobile cards — under md the 5-column table is
              unreadable on a phone. Each plot becomes a card with the
              link as a tap-able row and actions in a wrapped strip. */}
          <ul className="space-y-2 md:hidden">
            {filtered.map((r) => {
              const url = r.shareToken ? urlFor(r.shareToken) : null;
              const busy = busyId === r.id;
              return (
                <li
                  key={r.id}
                  className="rounded-xl border bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        Plot {r.plotNumber || "—"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {r.houseType || "—"}
                      </p>
                    </div>
                    {url ? (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
                          r.shareEnabled
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {r.shareEnabled ? "Active" : "Disabled"}
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        No link
                      </span>
                    )}
                  </div>

                  {url && (
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className={`mt-2 block truncate rounded bg-slate-50 px-2 py-1.5 font-mono text-[11px] hover:bg-blue-50 hover:text-blue-700 ${
                        r.shareEnabled
                          ? "text-slate-700"
                          : "pointer-events-none text-amber-700 line-through"
                      }`}
                      title={url}
                    >
                      /progress/{r.shareToken!.slice(0, 16)}…
                    </a>
                  )}

                  <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>
                      <span className="font-medium text-slate-700">
                        {r.journalCount}
                      </span>{" "}
                      update{r.journalCount === 1 ? "" : "s"} ·{" "}
                      <span className="font-medium text-slate-700">
                        {r.sharedPhotoCount}
                      </span>{" "}
                      photo{r.sharedPhotoCount === 1 ? "" : "s"}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {url ? (
                      <>
                        <button
                          type="button"
                          onClick={() => copy(url, r.id)}
                          disabled={!r.shareEnabled}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                        >
                          {copiedKey === r.id ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          Copy
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 ${
                            !r.shareEnabled ? "pointer-events-none opacity-40" : ""
                          }`}
                        >
                          <ExternalLink className="size-3" />
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => toggleEnabled(r.id, !r.shareEnabled)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          {r.shareEnabled ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                          {r.shareEnabled ? "Disable" : "Enable"}
                        </button>
                        <button
                          type="button"
                          onClick={() => rotate(r.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <RefreshCw className="size-3" />
                          Rotate
                        </button>
                        <Link
                          href={`/sites/${siteId}/plots/${r.id}?tab=customer`}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                        >
                          Manage
                        </Link>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => generate(r.id)}
                        disabled={busy}
                        className="h-7 text-xs"
                      >
                        {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Generate"}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = "blue",
}: {
  label: string;
  value: number;
  accent?: "blue" | "emerald" | "amber" | "slate";
}) {
  const ring = {
    blue: "border-blue-200 bg-blue-50/50",
    emerald: "border-emerald-200 bg-emerald-50/50",
    amber: "border-amber-200 bg-amber-50/50",
    slate: "border-slate-200 bg-slate-50/50",
  }[accent];
  const text = {
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    slate: "text-slate-700",
  }[accent];

  return (
    <div className={`rounded-xl border p-3 ${ring}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold ${text}`}>{value}</p>
    </div>
  );
}
