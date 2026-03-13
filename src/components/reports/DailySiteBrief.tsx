"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import {
  Cloud,
  CloudRain,
  Sun,
  AlertTriangle,
  Package,
  CheckCircle2,
  Clock,
  Activity,
  Loader2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Briefcase,
  Play,
  Check,
  ListChecks,
  X,
  Snowflake,
  CloudLightning,
  CloudFog,
  Thermometer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface DailySiteBriefProps {
  siteId: string;
}

interface BriefData {
  site: { name: string };
  date: string;
  isRainedOff: boolean;
  rainedOffNote: string | null;
  summary: {
    totalPlots: number;
    totalJobs: number;
    completedJobs: number;
    progressPercent: number;
    activeJobCount: number;
    overdueJobCount: number;
    openSnagCount: number;
  };
  jobsStartingToday: Array<{
    id: string;
    name: string;
    status: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
    contractors: Array<{ contact: { name: string; company: string | null } }>;
  }>;
  jobsDueToday: Array<{
    id: string;
    name: string;
    status: string;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
  }>;
  overdueJobs: Array<{
    id: string;
    name: string;
    status: string;
    endDate: string | null;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
  }>;
  activeJobs: Array<{
    id: string;
    name: string;
    endDate: string | null;
    plot: { plotNumber: string | null; name: string };
    assignedTo: { name: string } | null;
  }>;
  deliveriesToday: Array<{
    id: string;
    itemsDescription: string | null;
    status: string;
    supplier: { name: string };
    job: { name: string; plot: { plotNumber: string | null; name: string } };
  }>;
  overdueDeliveries: Array<{
    id: string;
    itemsDescription: string | null;
    expectedDeliveryDate: string | null;
    supplier: { name: string };
    job: { name: string; plot: { plotNumber: string | null; name: string } };
  }>;
  recentEvents: Array<{
    id: string;
    type: string;
    description: string;
    createdAt: string;
    user: { name: string } | null;
  }>;
  weather: {
    today: { date: string; category: string; tempMax: number; tempMin: number };
    forecast: Array<{ date: string; category: string; tempMax: number; tempMin: number }>;
  } | null;
}

// Weather icon mapping
function WeatherIcon({ category, className }: { category: string; className?: string }) {
  const cn = className || "size-5";
  switch (category) {
    case "clear": return <Sun className={cn} />;
    case "partly_cloudy": return <Cloud className={cn} />;
    case "cloudy": return <Cloud className={cn} />;
    case "fog": return <CloudFog className={cn} />;
    case "rain": return <CloudRain className={cn} />;
    case "snow": return <Snowflake className={cn} />;
    case "thunder": return <CloudLightning className={cn} />;
    default: return <Cloud className={cn} />;
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  clear: "Clear",
  partly_cloudy: "Partly Cloudy",
  cloudy: "Cloudy",
  fog: "Foggy",
  rain: "Rain",
  snow: "Snow",
  thunder: "Thunderstorms",
};

// Quick action button for starting/completing a job (UX #1)
function JobActionButton({
  jobId,
  status,
  pending,
  onAction,
}: {
  jobId: string;
  status: string;
  pending: boolean;
  onAction: (jobId: string, action: "start" | "complete") => void;
}) {
  if (status === "COMPLETED") {
    return (
      <span className="flex items-center gap-0.5 text-[10px] text-green-600">
        <Check className="size-3" /> Done
      </span>
    );
  }

  if (pending) {
    return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  }

  if (status === "NOT_STARTED") {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-6 gap-1 border-green-200 px-2 text-[10px] text-green-700 hover:bg-green-50"
        onClick={(e) => {
          e.stopPropagation();
          onAction(jobId, "start");
        }}
      >
        <Play className="size-2.5" /> Start
      </Button>
    );
  }

  if (status === "IN_PROGRESS") {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-6 gap-1 border-blue-200 px-2 text-[10px] text-blue-700 hover:bg-blue-50"
        onClick={(e) => {
          e.stopPropagation();
          onAction(jobId, "complete");
        }}
      >
        <CheckCircle2 className="size-2.5" /> Complete
      </Button>
    );
  }

  return null;
}

export function DailySiteBrief({ siteId }: DailySiteBriefProps) {
  const { devDate } = useDevDate();
  const [data, setData] = useState<BriefData | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(getCurrentDate());
  const [refreshKey, setRefreshKey] = useState(0);

  // Quick action state (UX #1)
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());

  // Rained off state (UX #4)
  const [rainedOffDialogOpen, setRainedOffDialogOpen] = useState(false);
  const [rainedOffNote, setRainedOffNote] = useState("");
  const [rainedOffDelay, setRainedOffDelay] = useState(true);
  const [savingRainedOff, setSavingRainedOff] = useState(false);

  // Bulk mode state (UX #3)
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    const dateStr = format(date, "yyyy-MM-dd");
    fetch(`/api/sites/${siteId}/daily-brief?date=${dateStr}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [siteId, date]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey, devDate]);

  const prevDay = () => setDate((d) => new Date(d.getTime() - 86400000));
  const nextDay = () => setDate((d) => new Date(d.getTime() + 86400000));
  const goToday = () => setDate(getCurrentDate());

  // Quick job action handler (UX #1)
  const handleJobAction = async (jobId: string, action: "start" | "complete") => {
    setPendingActions((prev) => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/jobs/${jobId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setRefreshKey((k) => k + 1);
      }
    } catch {
      // ignore
    } finally {
      setPendingActions((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  // Rained off handlers (UX #4)
  const handleMarkRainedOff = async () => {
    setSavingRainedOff(true);
    try {
      const dateStr = format(date, "yyyy-MM-dd");
      await fetch(`/api/sites/${siteId}/rained-off`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: dateStr,
          note: rainedOffNote || undefined,
          delayJobs: rainedOffDelay,
        }),
      });
      setRainedOffDialogOpen(false);
      setRainedOffNote("");
      setRefreshKey((k) => k + 1);
    } catch {
      // ignore
    } finally {
      setSavingRainedOff(false);
    }
  };

  const handleUndoRainedOff = async () => {
    const dateStr = format(date, "yyyy-MM-dd");
    await fetch(`/api/sites/${siteId}/rained-off?date=${dateStr}`, {
      method: "DELETE",
    });
    setRefreshKey((k) => k + 1);
  };

  // Bulk action handler (UX #3)
  const handleBulkAction = async (action: "start" | "complete") => {
    if (selectedJobIds.size === 0) return;
    setBulkProcessing(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/bulk-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobIds: Array.from(selectedJobIds),
          action,
        }),
      });
      if (res.ok) {
        setBulkMode(false);
        setSelectedJobIds(new Set());
        setRefreshKey((k) => k + 1);
      }
    } catch {
      // ignore
    } finally {
      setBulkProcessing(false);
    }
  };

  const toggleJobSelection = (jobId: string) => {
    setSelectedJobIds((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const s = data.summary;

  // Collect all actionable jobs for bulk mode
  const allActionableJobs = [
    ...data.jobsStartingToday.filter((j) => j.status !== "COMPLETED"),
    ...data.jobsDueToday.filter((j) => j.status !== "COMPLETED"),
    ...data.overdueJobs.filter((j) => j.status !== "COMPLETED"),
  ];
  // Deduplicate by id
  const uniqueActionableIds = new Set(allActionableJobs.map((j) => j.id));

  // Job row renderer with action buttons + optional checkbox
  const renderJobRow = (
    j: { id: string; name: string; status: string; plot: { plotNumber: string | null; name: string }; assignedTo?: { name: string } | null; endDate?: string | null; contractors?: Array<{ contact: { name: string; company: string | null } }> },
    showAction = true
  ) => (
    <div key={j.id} className="flex items-center gap-2 rounded border p-2 text-sm">
      {bulkMode && (
        <input
          type="checkbox"
          checked={selectedJobIds.has(j.id)}
          onChange={() => toggleJobSelection(j.id)}
          className="size-3.5 shrink-0 accent-blue-600"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">{j.name}</p>
          {j.status && j.status !== "NOT_STARTED" && (
            <Badge variant={j.status === "IN_PROGRESS" ? "default" : "secondary"} className="shrink-0 text-[10px]">
              {j.status.replace("_", " ")}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
          {j.assignedTo && ` · ${j.assignedTo.name}`}
          {j.contractors?.[0] && ` · ${j.contractors[0].contact.company || j.contractors[0].contact.name}`}
          {j.endDate && ` · Due ${format(new Date(j.endDate), "dd MMM")}`}
        </p>
      </div>
      {showAction && !bulkMode && (
        <JobActionButton
          jobId={j.id}
          status={j.status}
          pending={pendingActions.has(j.id)}
          onAction={handleJobAction}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Date nav + actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevDay}>
            <ChevronLeft className="size-4" />
          </Button>
          <h3 className="text-lg font-semibold">
            {format(date, "EEEE, d MMMM yyyy")}
          </h3>
          <Button variant="outline" size="icon" onClick={nextDay}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* Bulk mode toggle (UX #3) */}
          <Button
            variant={bulkMode ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setBulkMode(!bulkMode);
              setSelectedJobIds(new Set());
            }}
          >
            <ListChecks className="mr-1 size-3.5" />
            {bulkMode ? "Exit Bulk" : "Bulk Actions"}
          </Button>

          {/* Rained Off button (UX #4) */}
          {data.isRainedOff ? (
            <Button
              variant="outline"
              size="sm"
              className="border-blue-200 text-blue-700"
              onClick={handleUndoRainedOff}
            >
              <CloudRain className="mr-1 size-3.5" />
              Undo Rained Off
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRainedOffDialogOpen(true)}
            >
              <CloudRain className="mr-1 size-3.5" />
              Mark Rained Off
            </Button>
          )}

          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
        </div>
      </div>

      {/* Bulk action floating bar (UX #3) */}
      {bulkMode && selectedJobIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-4 py-2">
          <span className="text-sm font-medium">
            {selectedJobIds.size} selected
          </span>
          <Button
            size="sm"
            className="h-7 gap-1 bg-green-600 text-white hover:bg-green-700"
            disabled={bulkProcessing}
            onClick={() => handleBulkAction("start")}
          >
            <Play className="size-3" /> Start Selected
          </Button>
          <Button
            size="sm"
            className="h-7 gap-1 bg-blue-600 text-white hover:bg-blue-700"
            disabled={bulkProcessing}
            onClick={() => handleBulkAction("complete")}
          >
            <CheckCircle2 className="size-3" /> Complete Selected
          </Button>
          <button
            className="ml-auto text-xs text-blue-600 hover:text-blue-800"
            onClick={() => {
              const all = new Set<string>();
              allActionableJobs.forEach((j) => all.add(j.id));
              setSelectedJobIds(all);
            }}
          >
            Select All ({uniqueActionableIds.size})
          </button>
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSelectedJobIds(new Set())}
          >
            Deselect All
          </button>
          {bulkProcessing && <Loader2 className="ml-2 size-4 animate-spin" />}
        </div>
      )}

      {/* Rained off banner */}
      {data.isRainedOff && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800">
          <CloudRain className="size-5 shrink-0" />
          <div>
            <p className="font-medium">Rained Off</p>
            {data.rainedOffNote && (
              <p className="text-sm opacity-80">{data.rainedOffNote}</p>
            )}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{s.progressPercent}%</p>
            <p className="text-xs text-muted-foreground">
              Overall Progress
            </p>
            <p className="text-[10px] text-muted-foreground">
              {s.completedJobs}/{s.totalJobs} jobs
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {s.activeJobCount}
            </p>
            <p className="text-xs text-muted-foreground">Active Jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-2xl font-bold ${s.overdueJobCount > 0 ? "text-red-600" : "text-green-600"}`}>
              {s.overdueJobCount}
            </p>
            <p className="text-xs text-muted-foreground">Overdue Jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-2xl font-bold ${s.openSnagCount > 0 ? "text-orange-600" : "text-green-600"}`}>
              {s.openSnagCount}
            </p>
            <p className="text-xs text-muted-foreground">Open Snags</p>
          </CardContent>
        </Card>
      </div>

      {/* Weather forecast widget (Feature A) */}
      {data.weather && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              {/* Today's weather */}
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-blue-50 p-2.5">
                  <WeatherIcon category={data.weather.today.category} className="size-7 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {CATEGORY_LABELS[data.weather.today.category] || data.weather.today.category}
                  </p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Thermometer className="size-3" />
                    {Math.round(data.weather.today.tempMin)}° – {Math.round(data.weather.today.tempMax)}°C
                  </p>
                </div>
              </div>

              {/* Divider */}
              <div className="h-10 border-l" />

              {/* 3-day forecast */}
              <div className="flex gap-4">
                {data.weather.forecast.map((day) => (
                  <div key={day.date} className="flex flex-col items-center gap-0.5 text-center">
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {format(new Date(day.date + "T12:00:00"), "EEE")}
                    </span>
                    <WeatherIcon category={day.category} className="size-4 text-slate-500" />
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(day.tempMax)}°
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Weather warning */}
            {(data.weather.forecast.some((d) => ["rain", "snow", "thunder"].includes(d.category)) ||
              ["rain", "snow", "thunder"].includes(data.weather.today.category)) && (
              <div className="mt-3 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                <AlertTriangle className="size-3.5 shrink-0" />
                <span>
                  Outdoor jobs may be affected —{" "}
                  {[data.weather.today, ...data.weather.forecast]
                    .filter((d) => ["rain", "snow", "thunder"].includes(d.category))
                    .map((d) => format(new Date(d.date + "T12:00:00"), "EEE"))
                    .join(", ")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Jobs starting today */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Briefcase className="size-4 text-green-600" />
              Starting Today ({data.jobsStartingToday.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.jobsStartingToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs starting today</p>
            ) : (
              <div className="space-y-2">
                {data.jobsStartingToday.map((j) => renderJobRow(j))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Jobs due today */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="size-4 text-orange-600" />
              Due Today ({data.jobsDueToday.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.jobsDueToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs due today</p>
            ) : (
              <div className="space-y-2">
                {data.jobsDueToday.map((j) => renderJobRow(j))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deliveries expected */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Package className="size-4 text-blue-600" />
              Deliveries Today ({data.deliveriesToday.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.deliveriesToday.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deliveries expected</p>
            ) : (
              <div className="space-y-2">
                {data.deliveriesToday.map((d) => (
                  <div key={d.id} className="rounded border p-2 text-sm">
                    <p className="font-medium">{d.supplier.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.itemsDescription || "\u2014"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      For: {d.job.name} · {d.job.plot.plotNumber ? `Plot ${d.job.plot.plotNumber}` : d.job.plot.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Overdue items */}
        {(data.overdueJobs.length > 0 || data.overdueDeliveries.length > 0) && (
          <Card className="border-red-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle className="size-4" />
                Overdue ({data.overdueJobs.length} jobs, {data.overdueDeliveries.length} deliveries)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.overdueJobs.slice(0, 10).map((j) => renderJobRow(j))}
                {data.overdueJobs.length > 10 && (
                  <p className="text-xs text-muted-foreground">
                    +{data.overdueJobs.length - 10} more overdue jobs
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Recent activity */}
      {data.recentEvents.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="size-4 text-slate-600" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.recentEvents.map((e) => (
                <div key={e.id} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(e.createdAt), "HH:mm")}
                  </span>
                  <span className="flex-1 text-muted-foreground">
                    {e.description}
                  </span>
                  {e.user && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {e.user.name}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rained Off Dialog (UX #4) */}
      <Dialog open={rainedOffDialogOpen} onOpenChange={setRainedOffDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CloudRain className="size-5" />
              Mark as Rained Off
            </DialogTitle>
            <DialogDescription>
              Record this day as rained off. Optionally add notes and delay affected jobs.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rain-note">Notes (optional)</Label>
              <Textarea
                id="rain-note"
                value={rainedOffNote}
                onChange={(e) => setRainedOffNote(e.target.value)}
                placeholder="e.g. Heavy rain from 7am, site flooded"
                rows={2}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rainedOffDelay}
                onChange={(e) => setRainedOffDelay(e.target.checked)}
                className="size-4 accent-blue-600"
              />
              Delay weather-affected jobs by 1 day
            </label>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button onClick={handleMarkRainedOff} disabled={savingRainedOff}>
              {savingRainedOff ? (
                <>
                  <Loader2 className="mr-1 size-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Confirm Rained Off"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
