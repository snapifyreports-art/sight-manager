"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format, startOfWeek, subWeeks, addWeeks } from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Printer,
  TrendingUp,
  TrendingDown,
  Minus,
  CloudRain,
  Thermometer,
  Package,
  Camera,
  AlertTriangle,
  CheckCircle2,
  Briefcase,
  CalendarDays,
  PauseCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface WeeklySiteReportProps {
  siteId: string;
}

interface ReportData {
  site: { name: string; location: string | null };
  generatedAt: string;
  weekOf: string;
  weekLabel: string;
  overview: {
    totalPlots: number;
    totalJobs: number;
    completedJobs: number;
    activeJobs: number;
    overdueJobs: number;
    progressPercent: number;
  };
  thisWeek: {
    jobsStarted: number;
    jobsCompleted: number;
    jobsCompletedLastWeek: number;
    completionTrend: "up" | "down" | "flat";
    ordersPlaced: number;
    photosUploaded: number;
    snagsOpened: number;
    snagsResolved: number;
    totalOpenSnags: number;
    rainedOffDays: number;
    rainDays: number;
    temperatureDays: number;
    rainedOffDetails: Array<{ date: string; note: string | null; type: string }>;
  };
  deliveries: Array<{
    id: string;
    items: string | null;
    status: string;
    expectedDate: string | null;
    deliveredDate: string | null;
    supplier: string;
    job: string;
    plot: { plotNumber: string | null; name: string };
  }>;
  activity: Array<{
    type: string;
    description: string;
    createdAt: string;
    user: string | null;
  }>;
  nextWeek: {
    jobsStarting: Array<{
      id: string;
      name: string;
      startDate: string | null;
      plot: { plotNumber: string | null; name: string };
      assignee: string | null;
    }>;
    deliveries: Array<{
      items: string | null;
      expectedDate: string | null;
      supplier: string;
      plot: { plotNumber: string | null };
    }>;
  };
}

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <TrendingUp className="size-4 text-green-600" />;
  if (trend === "down") return <TrendingDown className="size-4 text-red-600" />;
  return <Minus className="size-4 text-slate-400" />;
}

export function WeeklySiteReport({ siteId }: WeeklySiteReportProps) {
  const { devDate } = useDevDate();
  const [weekDate, setWeekDate] = useState(
    startOfWeek(getCurrentDate(), { weekStartsOn: 1 })
  );
  const reqKey = `${siteId}|${format(weekDate, "yyyy-MM-dd")}|${devDate ?? ""}`;
  const [loaded, setLoaded] = useState<{ key: string; data: ReportData | null } | null>(null);
  const data = loaded?.key === reqKey ? loaded.data : null;
  const loading = loaded?.key !== reqKey;
  const [scheduleStatuses, setScheduleStatuses] = useState<Array<{ plotId: string; plotNumber: string | null; status: string; daysDeviation: number; awaitingRestart: boolean }>>([]);

  useEffect(() => {
    let cancelled = false;
    const dateStr = format(weekDate, "yyyy-MM-dd");
    fetch(`/api/sites/${siteId}/weekly-report?weekOf=${dateStr}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setLoaded({ key: reqKey, data: d }); })
      .catch(() => { if (!cancelled) setLoaded({ key: reqKey, data: null }); });
    return () => { cancelled = true; };
  }, [siteId, weekDate, devDate, reqKey]);

  useEffect(() => {
    fetch(`/api/sites/${siteId}/plot-schedules`)
      .then((r) => r.json())
      .then(setScheduleStatuses)
      .catch(() => {});
  }, [siteId]);

  const prevWeek = () => setWeekDate((d) => subWeeks(d, 1));
  const nextWeek = () => setWeekDate((d) => addWeeks(d, 1));
  const goThisWeek = () =>
    setWeekDate(startOfWeek(getCurrentDate(), { weekStartsOn: 1 }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const tw = data.thisWeek;
  const ov = data.overview;

  return (
    <div className="space-y-4 print:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between print:block">
        <div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" size="icon" onClick={prevWeek}>
              <ChevronLeft className="size-4" />
            </Button>
            <h3 className="text-lg font-semibold">
              Week: {data.weekLabel}
            </h3>
            <Button variant="outline" size="icon" onClick={nextWeek}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <h3 className="hidden text-lg font-semibold print:block">
            {data.site.name} — Weekly Report: {data.weekLabel}
          </h3>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={goThisWeek}>
            This Week
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
          >
            <Printer className="mr-1 size-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Overall progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Site Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">Overall Completion</span>
                <span className="font-bold">{ov.progressPercent}%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${ov.progressPercent}%` }}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs sm:grid-cols-5">
            <div>
              <p className="text-lg font-bold">{ov.totalPlots}</p>
              <p className="text-muted-foreground">Plots</p>
            </div>
            <div>
              <p className="text-lg font-bold">{ov.completedJobs}/{ov.totalJobs}</p>
              <p className="text-muted-foreground">Jobs Done</p>
            </div>
            <div>
              <p className="text-lg font-bold text-blue-600">{ov.activeJobs}</p>
              <p className="text-muted-foreground">Active</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${ov.overdueJobs > 0 ? "text-red-600" : "text-green-600"}`}>
                {ov.overdueJobs}
              </p>
              <p className="text-muted-foreground">Overdue</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${tw.totalOpenSnags > 0 ? "text-orange-600" : "text-green-600"}`}>
                {tw.totalOpenSnags}
              </p>
              <p className="text-muted-foreground">Open Snags</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Programme Schedule Summary */}
      {scheduleStatuses.length > 0 && (() => {
        const ahead = scheduleStatuses.filter((s) => s.status === "ahead").length;
        const behind = scheduleStatuses.filter((s) => s.status === "behind").length;
        const onTrack = scheduleStatuses.filter((s) => s.status === "on_track").length;
        const awaiting = scheduleStatuses.filter((s) => s.awaitingRestart).length;
        const behinds = scheduleStatuses.filter((s) => s.status === "behind").sort((a, b) => a.daysDeviation - b.daysDeviation);
        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Programme Schedule</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-3">
                {ahead > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <TrendingUp className="size-3" /> {ahead} plot{ahead !== 1 ? "s" : ""} ahead
                  </span>
                )}
                {onTrack > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                    <Minus className="size-3" /> {onTrack} on programme
                  </span>
                )}
                {behind > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                    <TrendingDown className="size-3" /> {behind} plot{behind !== 1 ? "s" : ""} behind
                  </span>
                )}
                {awaiting > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                    <PauseCircle className="size-3" /> {awaiting} deferred
                  </span>
                )}
              </div>
              {behinds.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Most Behind</p>
                  <div className="flex flex-wrap gap-2">
                    {behinds.slice(0, 8).map((s) => (
                      <span key={s.plotId} className="inline-flex items-center gap-1 rounded bg-red-50 px-2 py-0.5 text-[11px] text-red-700">
                        Plot {s.plotNumber ?? "?"} — {Math.abs(s.daysDeviation)}d behind
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* This week's activity summary */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-green-600">{tw.jobsCompleted}</p>
                <p className="text-xs text-muted-foreground">Jobs Completed</p>
              </div>
              <TrendIcon trend={tw.completionTrend} />
            </div>
            <p className="mt-1 text-[10px] text-muted-foreground">
              vs {tw.jobsCompletedLastWeek} last week
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-2xl font-bold text-blue-600">{tw.jobsStarted}</p>
            <p className="text-xs text-muted-foreground">Jobs Started</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-2xl font-bold text-orange-600">{tw.snagsOpened}</p>
                <p className="text-xs text-muted-foreground">Snags Opened</p>
              </div>
              <div className="border-l pl-2">
                <p className="text-2xl font-bold text-green-600">{tw.snagsResolved}</p>
                <p className="text-xs text-muted-foreground">Resolved</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div>
                <p className="text-2xl font-bold">{tw.ordersPlaced}</p>
                <p className="text-xs text-muted-foreground">Orders</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{tw.photosUploaded}</p>
                <p className="text-xs text-muted-foreground">Photos</p>
              </div>
              {tw.rainDays > 0 && (
                <div>
                  <p className="text-2xl font-bold text-blue-600">{tw.rainDays}</p>
                  <p className="text-xs text-muted-foreground">☔ Rain</p>
                </div>
              )}
              {tw.temperatureDays > 0 && (
                <div>
                  <p className="text-2xl font-bold text-cyan-600">{tw.temperatureDays}</p>
                  <p className="text-xs text-muted-foreground">🌡️ Temp</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weather impact days detail */}
      {tw.rainedOffDetails.length > 0 && (() => {
        const rainEntries = tw.rainedOffDetails.filter((r) => r.type === "RAIN");
        const tempEntries = tw.rainedOffDetails.filter((r) => r.type === "TEMPERATURE");
        return (
          <div className="space-y-2">
            {rainEntries.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                <CloudRain className="size-4 shrink-0 text-blue-600" />
                <div>
                  <span className="font-medium text-blue-800">Rain Days: </span>
                  {rainEntries.map((r, i) => (
                    <span key={i} className="text-blue-700">
                      {format(new Date(r.date), "EEE dd")}
                      {r.note && ` (${r.note})`}
                      {i < rainEntries.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {tempEntries.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm">
                <Thermometer className="size-4 shrink-0 text-cyan-600" />
                <div>
                  <span className="font-medium text-cyan-800">Temperature Days: </span>
                  {tempEntries.map((r, i) => (
                    <span key={i} className="text-cyan-700">
                      {format(new Date(r.date), "EEE dd")}
                      {r.note && ` (${r.note})`}
                      {i < tempEntries.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Deliveries this week */}
        {data.deliveries.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Package className="size-4 text-purple-600" />
                Deliveries This Week ({data.deliveries.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {data.deliveries.map((d) => (
                  <div key={d.id} className="rounded border p-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{d.supplier}</span>
                      <Badge
                        variant={d.status === "DELIVERED" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {d.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {d.items || d.job} · {d.plot.plotNumber ? `Plot ${d.plot.plotNumber}` : d.plot.name}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Next week lookahead */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <CalendarDays className="size-4 text-slate-600" />
              Next Week Lookahead
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.nextWeek.jobsStarting.length === 0 &&
            data.nextWeek.deliveries.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled</p>
            ) : (
              <div className="space-y-3">
                {data.nextWeek.jobsStarting.length > 0 && (
                  <div>
                    <h5 className="mb-1 text-xs font-semibold text-muted-foreground">
                      Jobs Starting ({data.nextWeek.jobsStarting.length})
                    </h5>
                    {data.nextWeek.jobsStarting.slice(0, 5).map((j) => (
                      <div key={j.id} className="rounded border px-2 py-1.5 text-sm mb-1">
                        <Link href={`/jobs/${j.id}`} className="font-medium text-blue-600 hover:underline">{j.name}</Link>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
                          {j.assignee && ` · ${j.assignee}`}
                        </span>
                      </div>
                    ))}
                    {data.nextWeek.jobsStarting.length > 5 && (
                      <p className="text-xs text-muted-foreground">
                        +{data.nextWeek.jobsStarting.length - 5} more
                      </p>
                    )}
                  </div>
                )}
                {data.nextWeek.deliveries.length > 0 && (
                  <div>
                    <h5 className="mb-1 text-xs font-semibold text-muted-foreground">
                      Deliveries Expected ({data.nextWeek.deliveries.length})
                    </h5>
                    {data.nextWeek.deliveries.slice(0, 5).map((d, i) => (
                      <div key={i} className="rounded border px-2 py-1.5 text-sm mb-1">
                        <span className="font-medium">{d.supplier}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {d.items || "Materials"} · Plot {d.plot.plotNumber}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity log */}
      {data.activity.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Activity Log</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {data.activity.map((e, i) => (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {format(new Date(e.createdAt), "EEE HH:mm")}
                  </span>
                  <span className="flex-1 text-muted-foreground">
                    {e.description}
                  </span>
                  {e.user && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {e.user}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
