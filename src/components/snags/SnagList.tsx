"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Camera,
  CheckCircle,
  CheckCircle2,
  Clock,
  HardHat,
  MapPin,
  Play,
  User,
  Download,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
// (May 2026 audit P-* bundle-bloat) xlsx (~190KB gzip) lazy-loaded on
// click — pre-fix it shipped on every snag tab.
import { SnagStatusBadge, SnagPriorityBadge } from "@/components/shared/StatusBadge";
import { InlinePriorityPicker } from "./InlinePriorityPicker";
import { useSnagAction, type SnagStatus } from "@/hooks/useSnagAction";
import { useToast, fetchErrorMessage } from "@/components/ui/toast";

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
  contact: { id: string; name: string; email: string; company?: string | null } | null;
  raisedBy: { id: string; name: string };
  job?: { id: string; name: string; parent?: { name: string } | null } | null;
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
  onRefresh?: () => void;
  showPlot?: boolean;
  highlightId?: string;
  siteId?: string;
}

export function SnagList({ snags, onSelect, onRefresh, showPlot, highlightId, siteId }: SnagListProps) {
  const toast = useToast();
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterContractor, setFilterContractor] = useState<string>("all");
  const [filterPlot, setFilterPlot] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Build unique contractor and plot lists from snags data
  const uniqueContractors = Array.from(
    new Map(
      snags
        .filter((s) => s.contact)
        .map((s) => [s.contact!.id, s.contact!])
    ).values()
  ).sort((a, b) => (a.company || a.name).localeCompare(b.company || b.name));

  const uniquePlots = Array.from(
    new Map(
      snags
        .filter((s) => s.plot)
        .map((s) => [s.plot!.id, s.plot!])
    ).values()
  ).sort((a, b) => {
    const aLabel = a.plotNumber || a.name;
    const bLabel = b.plotNumber || b.name;
    return aLabel.localeCompare(bLabel, undefined, { numeric: true });
  });

  // Quick status action — delegated to shared hook
  const { setSnagStatus, isPending: isSnagPending } = useSnagAction({
    onChange: () => onRefresh?.(),
  });

  const handleQuickStatus = (e: React.MouseEvent, snagId: string, status: SnagStatus) => {
    e.stopPropagation();
    void setSnagStatus(snagId, status);
  };

  // Close snag dialog state
  const [closeSnag, setCloseSnag] = useState<Snag | null>(null);
  const [closeNote, setCloseNote] = useState("");
  const [closingInProgress, setClosingInProgress] = useState(false);
  const [pendingCloseFile, setPendingCloseFile] = useState<File | null>(null);
  const [pendingClosePreview, setPendingClosePreview] = useState<string | null>(null);
  const closeFileRef = useRef<HTMLInputElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  // (May 2026 audit SM-P1) Pre-fix this was `useState<boolean>(false)` —
  // once auto-opened it never auto-opened again, so clicking a SECOND
  // snag link from Daily Brief in the same session silently did
  // nothing. Track the last-opened id so changing highlightId
  // triggers a fresh open.
  const lastAutoOpenedRef = useRef<string | null>(null);

  // Auto-open highlighted snag
  useEffect(() => {
    if (!highlightId || snags.length === 0) return;
    if (lastAutoOpenedRef.current === highlightId) return;
    const snag = snags.find((s) => s.id === highlightId);
    if (snag) {
      onSelect(snag);
      lastAutoOpenedRef.current = highlightId;
      // Scroll to highlighted card after render
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
    }
  }, [highlightId, snags, onSelect]);

  const filtered = snags.filter((s) => {
    if (filterStatus !== "all" && s.status !== filterStatus) return false;
    if (filterPriority !== "all" && s.priority !== filterPriority) return false;
    if (filterContractor !== "all" && s.contact?.id !== filterContractor) return false;
    if (filterPlot !== "all" && s.plot?.id !== filterPlot) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesDescription = s.description.toLowerCase().includes(q);
      const matchesLocation = s.location?.toLowerCase().includes(q);
      const matchesJob = s.job?.name.toLowerCase().includes(q);
      const matchesContractor = s.contact?.name.toLowerCase().includes(q) || s.contact?.company?.toLowerCase().includes(q);
      const matchesPlot = s.plot?.name.toLowerCase().includes(q) || s.plot?.plotNumber?.toLowerCase().includes(q);
      if (!matchesDescription && !matchesLocation && !matchesJob && !matchesContractor && !matchesPlot) return false;
    }
    return true;
  });

  const statusCounts = {
    OPEN: snags.filter((s) => s.status === "OPEN").length,
    IN_PROGRESS: snags.filter((s) => s.status === "IN_PROGRESS").length,
    RESOLVED: snags.filter((s) => s.status === "RESOLVED").length,
    CLOSED: snags.filter((s) => s.status === "CLOSED").length,
  };

  const handleExport = async () => {
    const XLSX = await import("xlsx");
    const rows = filtered.map((s) => ({
      Description: s.description,
      Location: s.location || "",
      Priority: s.priority,
      Status: s.status.replace("_", " "),
      "Sub-Job": s.job ? (s.job.parent ? `${s.job.parent.name} › ${s.job.name}` : s.job.name) : "",
      Contractor: s.contact ? (s.contact.company ? `${s.contact.company} — ${s.contact.name}` : s.contact.name) : "",
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

  const handleOpenCloseDialog = (e: React.MouseEvent, snag: Snag) => {
    e.stopPropagation();
    setCloseSnag(snag);
    setCloseNote("");
    setPendingCloseFile(null);
    if (pendingClosePreview) {
      URL.revokeObjectURL(pendingClosePreview);
      setPendingClosePreview(null);
    }
  };

  const handleCloseFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (pendingClosePreview) URL.revokeObjectURL(pendingClosePreview);
    setPendingCloseFile(file);
    setPendingClosePreview(URL.createObjectURL(file));
    if (closeFileRef.current) closeFileRef.current.value = "";
  };

  const handleConfirmClose = async () => {
    if (!closeSnag) return;
    setClosingInProgress(true);
    try {
      // (May 2026 pattern sweep) Both fetches inside this handler used
      // to silently swallow failures. A 500 on the photo upload then
      // landed CLOSED status on the snag with no after-photo — the
      // close-out evidence was gone. Now: abort + toast on photo fail,
      // abort + toast on PATCH fail.

      // 1. Upload "after" photo if provided
      if (pendingCloseFile) {
        const formData = new FormData();
        formData.append("photos", pendingCloseFile);
        formData.append("tag", "after");
        const photoRes = await fetch(`/api/snags/${closeSnag.id}/photos`, {
          method: "POST",
          body: formData,
        });
        if (!photoRes.ok) {
          toast.error(
            await fetchErrorMessage(photoRes, "Photo upload failed — snag NOT closed"),
          );
          return;
        }
      }

      // 2. Build updated notes
      const existingNotes = closeSnag.notes || "";
      const dateStr = new Date().toLocaleDateString("en-GB");
      const closingNote = closeNote.trim()
        ? `${existingNotes ? existingNotes + "\n\n" : ""}[${dateStr}] Closed: ${closeNote.trim()}`
        : undefined;

      // 3. PATCH snag to CLOSED
      const patchRes = await fetch(`/api/snags/${closeSnag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CLOSED",
          ...(closingNote !== undefined && { notes: closingNote }),
        }),
      });
      if (!patchRes.ok) {
        toast.error(await fetchErrorMessage(patchRes, "Failed to close snag"));
        return;
      }

      // 4. Clean up and refresh
      setCloseSnag(null);
      if (pendingClosePreview) URL.revokeObjectURL(pendingClosePreview);
      setPendingClosePreview(null);
      setPendingCloseFile(null);
      setCloseNote("");
      onRefresh?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error closing snag");
    } finally {
      setClosingInProgress(false);
    }
  };

  return (
    <>
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
              aria-pressed={filterStatus === chip.value}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
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
              aria-pressed={filterPriority === p}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                filterPriority === p
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {p === "all" ? "Any Priority" : p.charAt(0) + p.slice(1).toLowerCase()}
            </button>
          ))}

          {uniqueContractors.length > 0 && (
            <>
              <span className="mx-1 border-l" />
              <select
                value={filterContractor}
                onChange={(e) => setFilterContractor(e.target.value)}
                className="h-6 rounded-md border bg-white px-1.5 text-[11px] outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="all">All Contractors</option>
                {uniqueContractors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company ? `${c.company} — ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            </>
          )}

          {uniquePlots.length > 0 && (
            <select
              value={filterPlot}
              onChange={(e) => setFilterPlot(e.target.value)}
              className="h-6 rounded-md border bg-white px-1.5 text-[11px] outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Plots</option>
              {uniquePlots.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.plotNumber ? `Plot ${p.plotNumber}` : p.name}
                </option>
              ))}
            </select>
          )}

          {snags.length > 0 && (
            <>
              <span className="mx-1 border-l" />
              <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={handleExport}>
                <Download className="size-3" /> Export
              </Button>
            </>
          )}

          {snags.length > 0 && (
            <div className="relative ml-auto w-full sm:w-48">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search snags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-6 w-full rounded-md border bg-white pl-7 pr-2 text-[11px] outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
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
              <div
                key={snag.id}
                ref={snag.id === highlightId ? highlightRef : undefined}
                className={`group rounded-xl border bg-white p-3 text-left transition-shadow hover:shadow-md ${snag.id === highlightId ? "ring-2 ring-blue-500" : ""}`}
              >
                <button
                  className="w-full text-left"
                  onClick={() => onSelect(snag)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium">
                      {snag.description}
                    </p>
                    <span className="shrink-0" onClick={(e) => e.stopPropagation()}>
                      <InlinePriorityPicker
                        snagId={snag.id}
                        priority={snag.priority}
                        onChanged={() => onRefresh?.()}
                      />
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <SnagStatusBadge status={snag.status} />

                    {snag.location && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <MapPin className="size-2.5" /> {snag.location}
                      </span>
                    )}

                    {showPlot && snag.plot && (
                      siteId ? (
                        <Link href={`/sites/${siteId}/plots/${snag.plot.id}`} className="text-[10px] text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {snag.plot.plotNumber ? `Plot ${snag.plot.plotNumber}` : snag.plot.name}
                        </Link>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          {snag.plot.plotNumber ? `Plot ${snag.plot.plotNumber}` : snag.plot.name}
                        </span>
                      )
                    )}

                    {snag._count.photos > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                        <Camera className="size-2.5" /> {snag._count.photos}
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                    <div className="flex flex-col gap-0.5">
                      {snag.job && (
                        <Link href={`/jobs/${snag.job.id}`} className="flex items-center gap-1 text-blue-600 hover:underline" onClick={(e) => e.stopPropagation()}>
                          {snag.job.parent ? `${snag.job.parent.name} › ` : ""}{snag.job.name}
                        </Link>
                      )}
                      {snag.contact && (
                        <Link href={`/contacts/${snag.contact.id}`} className="flex items-center gap-1 hover:underline hover:text-blue-600" onClick={(e) => e.stopPropagation()}>
                          <HardHat className="size-2.5" />
                          {snag.contact.company ? `${snag.contact.company} — ${snag.contact.name}` : snag.contact.name}
                        </Link>
                      )}
                      <span className="flex items-center gap-1">
                        <User className="size-2.5" />
                        {snag.assignedTo?.name || "Unassigned"}
                      </span>
                    </div>
                    <span className="flex items-center gap-1">
                      <Clock className="size-2.5" />
                      {new Date(snag.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Photo thumbnails */}
                  {snag.photos && snag.photos.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {/* (May 2026 a11y audit #119) Use the snag
                          description as photo alt text — gives a
                          screen reader user the same context a
                          sighted user gets from the thumbnail next
                          to the description. Trimmed to 100 chars
                          to keep announcements short. */}
                      {snag.photos.slice(0, 3).map((p) => (
                        <div
                          key={p.id}
                          className="size-8 overflow-hidden rounded border"
                        >
                          <img
                            src={p.url}
                            alt={`Photo of snag: ${(snag.description ?? "").slice(0, 100)}`}
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

                {/* Inline quick actions */}
                {snag.status !== "CLOSED" && (
                  <div className="mt-2 flex gap-1.5 border-t pt-2">
                    {isSnagPending(snag.id) ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        {snag.status === "OPEN" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 flex-1 gap-1 text-[11px] text-blue-700 border-blue-200 hover:bg-blue-50"
                            onClick={(e) => handleQuickStatus(e, snag.id, "IN_PROGRESS")}
                          >
                            <Play className="size-3" />
                            Start
                          </Button>
                        )}
                        {snag.status === "IN_PROGRESS" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 flex-1 gap-1 text-[11px] text-green-700 border-green-200 hover:bg-green-50"
                            onClick={(e) => handleQuickStatus(e, snag.id, "RESOLVED")}
                          >
                            <CheckCircle2 className="size-3" />
                            Resolve
                          </Button>
                        )}
                        {snag.status === "RESOLVED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 flex-1 gap-1 text-[11px] text-slate-600 border-slate-200 hover:bg-slate-50"
                            onClick={(e) => handleOpenCloseDialog(e, snag)}
                          >
                            <CheckCircle className="size-3" />
                            Close
                          </Button>
                        )}
                        {snag.status !== "RESOLVED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 flex-1 gap-1 text-[11px] text-slate-500 border-slate-200 hover:bg-slate-50"
                            onClick={(e) => handleOpenCloseDialog(e, snag)}
                          >
                            <CheckCircle className="size-3" />
                            Close
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Close Snag Dialog */}
      <Dialog
        open={!!closeSnag}
        onOpenChange={(o) => {
          if (!o) {
            setCloseSnag(null);
            if (pendingClosePreview) URL.revokeObjectURL(pendingClosePreview);
            setPendingClosePreview(null);
            setPendingCloseFile(null);
            setCloseNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Close Snag</DialogTitle>
          </DialogHeader>

          {closeSnag && (
            <div className="space-y-4">
              {/* Snag summary */}
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-sm font-medium">{closeSnag.description}</p>
                {closeSnag.location && (
                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="size-3" /> {closeSnag.location}
                  </p>
                )}
              </div>

              {/* Closing note */}
              <div>
                <label className="text-xs font-medium">Closing Note</label>
                <textarea
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  rows={2}
                  value={closeNote}
                  onChange={(e) => setCloseNote(e.target.value)}
                  placeholder="e.g. Fixed and verified on site..."
                />
              </div>

              {/* After photo */}
              <div>
                <label className="text-xs font-medium">After Photo</label>
                <p className="text-[11px] text-muted-foreground">
                  Upload an &quot;after&quot; photo to show the fix
                </p>
                <div className="mt-2">
                  {pendingClosePreview ? (
                    <div className="relative inline-block">
                      <img
                        src={pendingClosePreview}
                        alt="After photo preview"
                        className="size-24 rounded-lg border object-cover"
                      />
                      <button
                        className="absolute -right-1 -top-1 rounded-full bg-black/60 p-0.5"
                        onClick={() => {
                          URL.revokeObjectURL(pendingClosePreview);
                          setPendingClosePreview(null);
                          setPendingCloseFile(null);
                        }}
                      >
                        <X className="size-3 text-white" />
                      </button>
                      <span className="absolute left-1 bottom-1 rounded-full bg-green-500 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">
                        after
                      </span>
                    </div>
                  ) : (
                    <>
                      <input
                        ref={closeFileRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => handleCloseFileSelect(e.target.files)}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => closeFileRef.current?.click()}
                      >
                        <Camera className="size-3.5" />
                        Add After Photo
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setCloseSnag(null);
                    if (pendingClosePreview) URL.revokeObjectURL(pendingClosePreview);
                    setPendingClosePreview(null);
                    setPendingCloseFile(null);
                    setCloseNote("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={closingInProgress}
                  onClick={handleConfirmClose}
                >
                  {closingInProgress ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="size-3.5" />
                  )}
                  {closingInProgress ? "Closing..." : "Confirm Close"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
