"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { format, isToday, isYesterday } from "date-fns";
import {
  Play,
  CheckCircle2,
  Pause,
  Pencil,
  FileCheck,
  ShoppingCart,
  PackageCheck,
  PackageX,
  Camera,
  CalendarClock,
  Building2,
  Home,
  AlertTriangle,
  User,
  Bell,
  Server,
  Cloud,
  Sun,
  CloudRain,
  Loader2,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Plus,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// ---------- Types ----------

interface LogEvent {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  siteId: string | null;
  plotId: string | null;
  jobId: string | null;
  user: { id: string; name: string } | null;
  plot: { id: string; name: string; plotNumber: string | null } | null;
  job: { id: string; name: string } | null;
}

interface PlotOption {
  id: string;
  name: string;
  plotNumber: string | null;
}

interface SiteLogClientProps {
  siteId: string;
  plots: PlotOption[];
}

// ---------- Category config ----------

const CATEGORIES = [
  { value: "all", label: "All Activity" },
  { value: "jobs", label: "Jobs" },
  { value: "orders", label: "Orders & Deliveries" },
  { value: "snags", label: "Snags" },
  { value: "photos", label: "Photos" },
  { value: "weather", label: "Weather" },
  { value: "notes", label: "Notes" },
  { value: "schedule", label: "Schedule" },
  { value: "system", label: "System" },
];

// ---------- Event icon & colour ----------

function EventIcon({ type, description }: { type: string; description: string }) {
  const cls = "size-3.5 shrink-0";
  if (type === "SYSTEM" && description.startsWith("🌤 Weather:")) {
    if (description.includes("rain") || description.includes("Rain")) return <CloudRain className={cls} />;
    if (description.includes("Clear") || description.includes("clear")) return <Sun className={cls} />;
    return <Cloud className={cls} />;
  }
  switch (type) {
    case "JOB_STARTED":      return <Play className={cls} />;
    case "JOB_COMPLETED":    return <CheckCircle2 className={cls} />;
    case "JOB_STOPPED":      return <Pause className={cls} />;
    case "JOB_SIGNED_OFF":   return <FileCheck className={cls} />;
    case "JOB_EDITED":       return <Pencil className={cls} />;
    case "ORDER_PLACED":     return <ShoppingCart className={cls} />;
    case "ORDER_DELIVERED":
    case "DELIVERY_CONFIRMED": return <PackageCheck className={cls} />;
    case "ORDER_CANCELLED":  return <PackageX className={cls} />;
    case "PHOTO_UPLOADED":   return <Camera className={cls} />;
    case "SCHEDULE_CASCADED": return <CalendarClock className={cls} />;
    case "SNAG_CREATED":     return <AlertTriangle className={cls} />;
    case "SNAG_RESOLVED":    return <CheckCircle2 className={cls} />;
    case "SITE_CREATED":
    case "SITE_UPDATED":     return <Building2 className={cls} />;
    case "PLOT_CREATED":
    case "PLOT_UPDATED":     return <Home className={cls} />;
    case "USER_ACTION":      return <MessageSquare className={cls} />;
    case "NOTIFICATION":     return <Bell className={cls} />;
    default:                 return <Server className={cls} />;
  }
}

function eventColour(type: string, description: string): string {
  if (type === "SYSTEM" && description.startsWith("🌤 Weather:")) {
    return "text-sky-600 bg-sky-50 dark:bg-sky-950/30";
  }
  switch (type) {
    case "JOB_STARTED":      return "text-green-600 bg-green-50 dark:bg-green-950/30";
    case "JOB_COMPLETED":    return "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30";
    case "JOB_STOPPED":      return "text-orange-600 bg-orange-50 dark:bg-orange-950/30";
    case "JOB_SIGNED_OFF":   return "text-blue-600 bg-blue-50 dark:bg-blue-950/30";
    case "JOB_EDITED":       return "text-slate-600 bg-slate-50 dark:bg-slate-950/30";
    case "ORDER_PLACED":     return "text-violet-600 bg-violet-50 dark:bg-violet-950/30";
    case "ORDER_DELIVERED":
    case "DELIVERY_CONFIRMED": return "text-green-600 bg-green-50 dark:bg-green-950/30";
    case "ORDER_CANCELLED":  return "text-red-600 bg-red-50 dark:bg-red-950/30";
    case "PHOTO_UPLOADED":   return "text-pink-600 bg-pink-50 dark:bg-pink-950/30";
    case "SCHEDULE_CASCADED": return "text-amber-600 bg-amber-50 dark:bg-amber-950/30";
    case "SNAG_CREATED":     return "text-red-600 bg-red-50 dark:bg-red-950/30";
    case "SNAG_RESOLVED":    return "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30";
    case "USER_ACTION":      return "text-blue-600 bg-blue-50 dark:bg-blue-950/30";
    default:                 return "text-slate-600 bg-slate-50 dark:bg-slate-950/30";
  }
}

// ---------- Date group label ----------

function dateLabel(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE d MMMM yyyy");
}

// ---------- Group events by calendar day ----------

function groupByDay(events: LogEvent[]): Array<{ label: string; date: string; events: LogEvent[] }> {
  const groups: Map<string, LogEvent[]> = new Map();
  for (const e of events) {
    const day = format(new Date(e.createdAt), "yyyy-MM-dd");
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(e);
  }
  return Array.from(groups.entries()).map(([date, evts]) => ({
    date,
    label: dateLabel(evts[0].createdAt),
    events: evts,
  }));
}

// ---------- Main Component ----------

export function SiteLogClient({ siteId, plots }: SiteLogClientProps) {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [plotFilter, setPlotFilter] = useState("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Add note dialog
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notePlot, setNotePlot] = useState("none");
  const [submitting, setSubmitting] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (plotFilter !== "all") params.set("plotId", plotFilter);
    if (category !== "all") params.set("category", category);
    const res = await fetch(`/api/sites/${siteId}/log?${params}`);
    if (res.ok) {
      const data = await res.json();
      setEvents(data.events);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    }
    setLoading(false);
  }, [siteId, plotFilter, category, page]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [plotFilter, category]);

  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/sites/${siteId}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: noteText.trim(),
          plotId: notePlot !== "none" ? notePlot : null,
        }),
      });
      setNoteText("");
      setNotePlot("none");
      setNoteOpen(false);
      setPage(1);
      fetchEvents();
    } finally {
      setSubmitting(false);
    }
  }

  const grouped = groupByDay(events);

  const plotLabel = (plot: PlotOption) =>
    plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="size-3.5" />
        </div>

        {/* Plot filter */}
        <Select value={plotFilter} onValueChange={(v) => setPlotFilter(v ?? "all")}>
          <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs">
            <SelectValue placeholder="All Plots">
              {plotFilter === "all"
                ? "All Plots"
                : (() => {
                    const p = plots.find((p) => p.id === plotFilter);
                    return p ? plotLabel(p) : "Loading...";
                  })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plots</SelectItem>
            {plots.map((p) => (
              <SelectItem key={p.id} value={p.id}>{plotLabel(p)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Category filter */}
        <Select value={category} onValueChange={(v) => setCategory(v ?? "all")}>
          <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
            <SelectValue placeholder="All Activity" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          {total > 0 && (
            <span className="text-xs text-muted-foreground">{total} entries</span>
          )}
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setNoteOpen(true)}>
            <Plus className="size-3.5" />
            Add Note
          </Button>
        </div>
      </div>

      {/* Event list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Server className="mb-2 size-8 opacity-30" />
          <p className="text-sm">No log entries found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ date, label, events: dayEvents }) => (
            <div key={date}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <Card>
                <CardContent className="divide-y p-0">
                  {dayEvents.map((e) => {
                    const colour = eventColour(e.type, e.description);
                    const isWeather = e.type === "SYSTEM" && e.description.startsWith("🌤 Weather:");
                    return (
                      <div key={e.id} className={`flex items-start gap-3 px-3 py-2.5 ${isWeather ? "bg-sky-50/50 dark:bg-sky-950/10" : ""}`}>
                        {/* Icon */}
                        <div className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${colour}`}>
                          <EventIcon type={e.type} description={e.description} />
                        </div>

                        {/* Content */}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug">{e.description}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            {e.plot && (
                              <Link
                                href={`/sites/${siteId}/plots/${e.plot.id}`}
                                className="hover:text-blue-600 hover:underline"
                              >
                                {e.plot.plotNumber ? `Plot ${e.plot.plotNumber}` : e.plot.name}
                              </Link>
                            )}
                            {e.job && (
                              <Link
                                href={`/jobs/${e.jobId}`}
                                className="hover:text-blue-600 hover:underline"
                              >
                                {e.job.name}
                              </Link>
                            )}
                            {e.user && <span>{e.user.name}</span>}
                          </div>
                        </div>

                        {/* Time */}
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {format(new Date(e.createdAt), "HH:mm")}
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {/* Add Note Dialog */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="size-4" />
              Add Log Note
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Note</Label>
              <Textarea
                placeholder="What happened on site today..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Plot (optional)</Label>
              <Select value={notePlot} onValueChange={(v) => setNotePlot(v ?? "none")}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Site-wide">
                    {notePlot === "none"
                      ? "Site-wide"
                      : (() => {
                          const p = plots.find((p) => p.id === notePlot);
                          return p ? plotLabel(p) : "Loading...";
                        })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Site-wide</SelectItem>
                  {plots.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{plotLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              size="sm"
              disabled={!noteText.trim() || submitting}
              onClick={handleAddNote}
            >
              {submitting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
