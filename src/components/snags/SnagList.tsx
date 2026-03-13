"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle,
  Clock,
  MapPin,
  User,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";

interface SnagPhoto {
  id: string;
  url: string;
}

interface Snag {
  id: string;
  description: string;
  location: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
  assignedTo: { id: string; name: string } | null;
  raisedBy: { id: string; name: string };
  createdAt: string;
  resolvedAt: string | null;
  notes: string | null;
  photos?: SnagPhoto[];
  _count: { photos: number };
  plot?: { id: string; plotNumber: string | null; name: string };
}

interface SnagListProps {
  snags: Snag[];
  onSelect: (snag: Snag) => void;
  showPlot?: boolean;
}

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-amber-100 text-amber-700",
  CRITICAL: "bg-red-100 text-red-700",
};

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  RESOLVED: "bg-green-100 text-green-700",
  CLOSED: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function SnagList({ snags, onSelect, showPlot }: SnagListProps) {
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const filtered = snags.filter((s) => {
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (filterPriority !== "all" && s.priority !== filterPriority) return false;
    return true;
  });

  const statusCounts = {
    OPEN: snags.filter((s) => s.status === "OPEN").length,
    IN_PROGRESS: snags.filter((s) => s.status === "IN_PROGRESS").length,
    RESOLVED: snags.filter((s) => s.status === "RESOLVED").length,
    CLOSED: snags.filter((s) => s.status === "CLOSED").length,
  };

  const handleExport = () => {
    const rows = filtered.map((s) => ({
      Description: s.description,
      Location: s.location || "",
      Priority: s.priority,
      Status: s.status.replace("_", " "),
      "Assigned To": s.assignedTo?.name || "Unassigned",
      "Raised By": s.raisedBy?.name || "",
      "Created Date": new Date(s.createdAt).toLocaleDateString(),
      "Resolved Date": s.resolvedAt ? new Date(s.resolvedAt).toLocaleDateString() : "",
      "Days Open": Math.round(
        (Date.now() - new Date(s.createdAt).getTime()) / 86400000
      ),
      Plot: s.plot ? (s.plot.plotNumber ? `Plot ${s.plot.plotNumber}` : s.plot.name) : "",
      Notes: s.notes || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Snags");
    XLSX.writeFile(wb, "snag-list.xlsx");
  };

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { value: "all", label: `All (${snags.length})` },
          { value: "OPEN", label: `Open (${statusCounts.OPEN})` },
          { value: "IN_PROGRESS", label: `In Progress (${statusCounts.IN_PROGRESS})` },
          { value: "RESOLVED", label: `Resolved (${statusCounts.RESOLVED})` },
        ].map((chip) => (
          <button
            key={chip.value}
            onClick={() => setFilterStatus(chip.value)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              filterStatus === chip.value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {chip.label}
          </button>
        ))}

        <span className="mx-1 border-l" />

        {["all", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map((p) => (
          <button
            key={p}
            onClick={() => setFilterPriority(p)}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
              filterPriority === p
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {p === "all" ? "Any Priority" : p.charAt(0) + p.slice(1).toLowerCase()}
          </button>
        ))}

        {snags.length > 0 && (
          <>
            <span className="mx-1 border-l" />
            <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={handleExport}>
              <Download className="size-3" /> Export
            </Button>
          </>
        )}
      </div>

      {/* Snag cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <CheckCircle className="mb-2 size-8 opacity-30" />
          <p className="text-sm">
            {snags.length === 0
              ? "No snags raised yet"
              : "No snags match your filters"}
          </p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((snag) => (
            <button
              key={snag.id}
              onClick={() => onSelect(snag)}
              className="group rounded-xl border bg-white p-3 text-left transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-medium">
                  {snag.description}
                </p>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLES[snag.priority]}`}
                >
                  {snag.priority}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLES[snag.status]}`}
                >
                  {STATUS_LABELS[snag.status]}
                </span>

                {snag.location && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <MapPin className="size-2.5" /> {snag.location}
                  </span>
                )}

                {showPlot && snag.plot && (
                  <span className="text-[10px] text-muted-foreground">
                    {snag.plot.plotNumber ? `Plot ${snag.plot.plotNumber}` : snag.plot.name}
                  </span>
                )}

                {snag._count.photos > 0 && (
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Camera className="size-2.5" /> {snag._count.photos}
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <User className="size-2.5" />
                  {snag.assignedTo?.name || "Unassigned"}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-2.5" />
                  {new Date(snag.createdAt).toLocaleDateString()}
                </span>
              </div>

              {/* Photo thumbnails */}
              {snag.photos && snag.photos.length > 0 && (
                <div className="mt-2 flex gap-1">
                  {snag.photos.slice(0, 3).map((p) => (
                    <div
                      key={p.id}
                      className="size-8 overflow-hidden rounded border"
                    >
                      <img
                        src={p.url}
                        alt=""
                        className="size-full object-cover"
                      />
                    </div>
                  ))}
                  {snag._count.photos > 3 && (
                    <span className="flex size-8 items-center justify-center rounded border bg-slate-50 text-[9px] text-muted-foreground">
                      +{snag._count.photos - 3}
                    </span>
                  )}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
