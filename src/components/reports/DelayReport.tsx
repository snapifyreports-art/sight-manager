"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useDevDate } from "@/lib/dev-date-context";
import { format } from "date-fns";
import {
  AlertTriangle,
  CloudRain,
  Package,
  Clock,
  Loader2,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Thermometer,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchErrorMessage } from "@/components/ui/toast";
import { ReportExportButtons } from "@/components/shared/ReportExportButtons";
import { LatenessSummary } from "@/components/lateness/LatenessSummary";

interface DelayReportProps {
  siteId: string;
}

interface DelayedJob {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  daysOverdue: number;
  weatherAffected: boolean;
  rainDaysImpact: number;
  temperatureDaysImpact: number;
  isWeatherExcused: boolean;
  weatherReasonType: "RAIN" | "TEMPERATURE" | null;
  causes: string[];
  plot: { plotNumber: string | null; name: string };
  assignedTo: string | null;
  contractor: string | null;
  lateOrders: Array<{
    id: string;
    items: string | null;
    supplier: string;
    expectedDate: string | null;
    deliveredDate: string | null;
    daysLate: number;
  }>;
}

interface DelayData {
  generatedAt: string;
  totalWeatherImpactDays: number;
  totalRainDays: number;
  totalTemperatureDays: number;
  totalRainedOffDays: number;
  rainedOffDays: Array<{ date: string; type: "RAIN" | "TEMPERATURE"; note: string | null }>;
  delayedJobs: DelayedJob[];
  overdueDeliveries: Array<{
    id: string;
    items: string | null;
    supplier: string;
    expectedDate: string | null;
    job: string;
    plot: { plotNumber: string | null; name: string };
    daysOverdue: number;
  }>;
  completedLateTrend: Array<{
    id: string;
    name: string;
    plotNumber: string | null;
    scheduledEnd: string;
    actualEnd: string;
    daysLate: number;
  }>;
  summary: {
    currentlyOverdueJobs: number;
    weatherExcusedDelays: number;
    weatherRainDelays: number;
    weatherTempDelays: number;
    nonWeatherDelays: number;
    materialRelatedDelays: number;
    overdueDeliveryCount: number;
    completedLateCount: number;
  };
}

function JobDelayCard({ job }: { job: DelayedJob }) {
  const isWeather = job.isWeatherExcused;
  const borderClass = isWeather ? "border-blue-200 bg-blue-50/40" : "border-red-200";

  return (
    <div className={`rounded-lg border p-3 ${borderClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link href={`/jobs/${job.id}`} className="font-medium text-sm hover:underline hover:text-blue-700">
              {job.name}
            </Link>
            {isWeather && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                <ShieldCheck className="size-3" />
                Excused — Weather
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {job.plot.plotNumber ? `Plot ${job.plot.plotNumber}` : job.plot.name}
            {!isWeather && job.contractor && ` · ${job.contractor}`}
            {job.assignedTo && ` · ${job.assignedTo}`}
          </p>
        </div>
        <Badge variant={isWeather ? "outline" : "destructive"} className={`shrink-0 text-xs ${isWeather ? "border-blue-300 text-blue-700" : ""}`}>
          {job.daysOverdue} day{job.daysOverdue !== 1 ? "s" : ""} overdue
        </Badge>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {job.causes.map((cause, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              cause.startsWith("Weather – Rain")
                ? "bg-blue-100 text-blue-700"
                : cause.startsWith("Weather – Temperature")
                  ? "bg-cyan-100 text-cyan-700"
                  : cause.startsWith("Weather")
                    ? "bg-blue-100 text-blue-700"
                    : cause.startsWith("Material")
                      ? "bg-orange-100 text-orange-700"
                      : "bg-slate-100 text-slate-600"
            }`}
          >
            {cause.startsWith("Weather – Temperature") && <Thermometer className="size-3" />}
            {cause.startsWith("Weather – Rain") && <CloudRain className="size-3" />}
            {cause.startsWith("Weather") && !cause.includes("Rain") && !cause.includes("Temperature") && <CloudRain className="size-3" />}
            {cause.startsWith("Material") && <Package className="size-3" />}
            {cause}
          </span>
        ))}
      </div>
      {job.endDate && (
        <p className="mt-1 text-xs text-muted-foreground">
          Due: {format(new Date(job.endDate), "dd MMM yyyy")}
          {job.startDate && ` · Started: ${format(new Date(job.startDate), "dd MMM yyyy")}`}
        </p>
      )}
      {job.lateOrders.length > 0 && (
        <div className="mt-2 space-y-1">
          {job.lateOrders.map((o) => (
            <div key={o.id} className="flex items-center gap-2 rounded bg-orange-50 px-2 py-1 text-xs">
              <Package className="size-3 text-orange-500" />
              <span>{o.supplier}: {o.items || "Materials"} — {o.daysLate} day{o.daysLate !== 1 ? "s" : ""} late</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DelayReport({ siteId }: DelayReportProps) {
  const { devDate } = useDevDate();
  const reqKey = `${siteId}|${devDate ?? ""}`;
  const [loaded, setLoaded] = useState<{ key: string; data: DelayData | null; error: string | null } | null>(null);
  const data = loaded?.key === reqKey ? loaded.data : null;
  const loading = loaded?.key !== reqKey;
  const error = loaded?.key === reqKey ? loaded.error : null;
  const [showImpactDays, setShowImpactDays] = useState(false);
  const [showTrend, setShowTrend] = useState(false);
  const [expandedSuppliers, setExpandedSuppliers] = useState<Set<string>>(new Set());
  const [plots, setPlots] = useState<Array<{ id: string; plotNumber: string | null; name: string }>>([]);
  const [selectedPlots, setSelectedPlots] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}`);
        if (cancelled || !res.ok) return;
        const site = await res.json();
        if (cancelled) return;
        if (site.plots) setPlots(site.plots.map((p: { id: string; plotNumber: string | null; name: string }) => ({ id: p.id, plotNumber: p.plotNumber, name: p.name })));
      } catch {
        // Plot filter list is supplementary — fail silently; main report covers the error UX
      }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/delay-report`);
        if (cancelled) return;
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, "Failed to load delay report");
          setLoaded({ key: reqKey, data: null, error: msg });
          return;
        }
        const d = await res.json();
        if (!cancelled) setLoaded({ key: reqKey, data: d, error: null });
      } catch (e) {
        if (!cancelled) setLoaded({ key: reqKey, data: null, error: e instanceof Error ? e.message : "Network error" });
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, devDate, reqKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-medium">Failed to load delay report</p>
        <p className="text-xs">{error}</p>
        <button onClick={() => setLoaded(null)} className="mt-2 text-xs underline">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  // Apply plot filter (by plot number since plot.id not available here)
  const filterByPlot = (job: DelayedJob) =>
    selectedPlots.size === 0 || selectedPlots.has(job.plot?.plotNumber || job.plot?.name || "");

  const s = data.summary;
  const filteredJobs = data.delayedJobs.filter(filterByPlot);
  const weatherExcusedJobs = filteredJobs.filter((j) => j.isWeatherExcused);
  const nonWeatherJobs = filteredJobs.filter((j) => !j.isWeatherExcused);
  // Split non-weather into contractor delays (has contractor) vs other
  const contractorDelays = nonWeatherJobs.filter((j) => j.contractor);
  const otherDelays = nonWeatherJobs.filter((j) => !j.contractor);
  const totalImpactDays = data.totalWeatherImpactDays ?? data.totalRainedOffDays;

  // Flat rows for Excel: one row per delayed job with blame-bucket.
  const exportRows = [
    ...weatherExcusedJobs.map((j) => ({
      Plot: j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name,
      Job: j.name,
      Status: j.status.replace("_", " "),
      "Days Overdue": j.daysOverdue,
      Bucket: "Weather",
      "Excused": "Yes",
      Contractor: j.contractor || "",
      Assignee: j.assignedTo || "",
    })),
    ...contractorDelays.map((j) => ({
      Plot: j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name,
      Job: j.name,
      Status: j.status.replace("_", " "),
      "Days Overdue": j.daysOverdue,
      Bucket: "Contractor",
      "Excused": "No",
      Contractor: j.contractor || "",
      Assignee: j.assignedTo || "",
    })),
    ...otherDelays.map((j) => ({
      Plot: j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name,
      Job: j.name,
      Status: j.status.replace("_", " "),
      "Days Overdue": j.daysOverdue,
      Bucket: "Other",
      "Excused": "No",
      Contractor: j.contractor || "",
      Assignee: j.assignedTo || "",
    })),
  ];

  return (
    <div className="space-y-4">
      {/* (#191) Lateness summary block at the top of the Delay Report
          — surfaces every open lateness on the site with reason
          breakdown + attribution. Sits alongside the rest of the
          delay-justification narrative. */}
      <LatenessSummary siteId={siteId} status="all" />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Delay Justification Report</h3>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            Generated {format(new Date(data.generatedAt), "dd MMM yyyy HH:mm")}
          </p>
          <ReportExportButtons
            filename={`delay-report-${format(new Date(), "yyyy-MM-dd")}`}
            rows={exportRows}
            sheetName="Delays"
            compact
          />
        </div>
      </div>

      {/* Plot filter — interactive control, skip on print */}
      {plots.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <span className="text-xs font-medium text-muted-foreground">Filter plots:</span>
          <button
            onClick={() => setSelectedPlots(new Set())}
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${selectedPlots.size === 0 ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            All
          </button>
          {plots.map((p) => {
            const key = p.plotNumber || p.name;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlots((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                })}
                className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors ${selectedPlots.has(key) ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                {p.plotNumber ? `P${p.plotNumber}` : p.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card>
          <CardContent className="p-3 text-center">
            <p className={`text-2xl font-bold ${s.currentlyOverdueJobs > 0 ? "text-red-600" : "text-green-600"}`}>
              {s.currentlyOverdueJobs}
            </p>
            <p className="text-xs text-muted-foreground">Overdue Jobs</p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{s.weatherExcusedDelays ?? 0}</p>
            <p className="text-xs text-muted-foreground">Weather Excused</p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="p-3 text-center">
            <p className={`text-2xl font-bold ${(s.nonWeatherDelays ?? 0) > 0 ? "text-red-600" : "text-slate-600"}`}>
              {s.nonWeatherDelays ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Non-Weather Delays</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <div className="flex items-center justify-center gap-1">
              {(data.totalRainDays ?? 0) > 0 && <span className="text-lg">☔</span>}
              {(data.totalTemperatureDays ?? 0) > 0 && <span className="text-lg">🌡️</span>}
              <p className="text-2xl font-bold text-blue-600">{totalImpactDays}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              {(data.totalRainDays ?? 0) > 0 && `${data.totalRainDays}R`}
              {(data.totalRainDays ?? 0) > 0 && (data.totalTemperatureDays ?? 0) > 0 && " + "}
              {(data.totalTemperatureDays ?? 0) > 0 && `${data.totalTemperatureDays}T`}
              {totalImpactDays === 0 && "Weather Days"}
              {totalImpactDays > 0 && " Impact Days"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-slate-600">{s.completedLateCount}</p>
            <p className="text-xs text-muted-foreground">Completed Late</p>
          </CardContent>
        </Card>
      </div>

      {/* Weather-excused delays */}
      {weatherExcusedJobs.length > 0 && (
        <Card className="border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-blue-700">
              <ShieldCheck className="size-4" />
              Weather-Excused Delays ({weatherExcusedJobs.length})
              <span className="ml-auto text-[10px] font-normal text-blue-500 rounded-full bg-blue-100 px-2 py-0.5">
                No contractor accountability
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-blue-600">
              These delays are attributed to weather impact. Contractors are not penalised for these.
            </p>
            <div className="space-y-3">
              {weatherExcusedJobs.map((job) => (
                <JobDelayCard key={job.id} job={job} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Contractor delays */}
      {contractorDelays.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="size-4" />
              Contractor Delays ({contractorDelays.length})
            </CardTitle>
            <p className="text-xs text-red-600">Delays attributable to contractor performance</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {contractorDelays.map((job) => (
                <JobDelayCard key={job.id} job={job} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Other delays (no contractor assigned) */}
      {otherDelays.length > 0 && (
        <Card className="border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-slate-700">
              <Clock className="size-4" />
              Other Delays ({otherDelays.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {otherDelays.map((job) => (
                <JobDelayCard key={job.id} job={job} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Supplier delays — overdue deliveries, grouped by supplier */}
      {data.overdueDeliveries.length > 0 && (() => {
        const bySupplier = data.overdueDeliveries.reduce<Record<string, typeof data.overdueDeliveries>>((acc, d) => {
          const key = d.supplier || "Unknown Supplier";
          if (!acc[key]) acc[key] = [];
          acc[key].push(d);
          return acc;
        }, {});
        const supplierNames = Object.keys(bySupplier).sort();

        return (
          <Card className="border-orange-200">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm text-orange-700">
                <Package className="size-4" />
                Supplier Delays — Overdue Deliveries ({data.overdueDeliveries.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {supplierNames.map((supplier) => {
                  const orders = bySupplier[supplier];
                  const totalDaysLate = orders.reduce((sum, o) => sum + o.daysOverdue, 0);
                  const isExpanded = expandedSuppliers.has(supplier);

                  return (
                    <div key={supplier} className="rounded-lg border border-orange-100">
                      <button
                        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-orange-50/50 transition-colors"
                        onClick={() =>
                          setExpandedSuppliers((prev) => {
                            const next = new Set(prev);
                            if (next.has(supplier)) next.delete(supplier); else next.add(supplier);
                            return next;
                          })
                        }
                      >
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="size-4 text-orange-500" />
                          ) : (
                            <ChevronRight className="size-4 text-orange-500" />
                          )}
                          <span className="text-sm font-medium">{supplier}</span>
                          <span className="text-xs text-muted-foreground">
                            ({orders.length} order{orders.length !== 1 ? "s" : ""})
                          </span>
                        </div>
                        <Badge variant="outline" className="text-orange-600">
                          {totalDaysLate}d total
                        </Badge>
                      </button>
                      {isExpanded && (
                        <div className="divide-y border-t border-orange-100">
                          {orders.map((d) => (
                            <div key={d.id} className="flex items-center justify-between px-3 py-2 pl-9 text-sm">
                              <div>
                                <p className="font-medium text-sm">{d.items || "Materials"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {d.job} · {d.plot.plotNumber ? `Plot ${d.plot.plotNumber}` : d.plot.name}
                                  {d.expectedDate && ` · Expected ${format(new Date(d.expectedDate), "dd MMM")}`}
                                </p>
                              </div>
                              <Badge variant="outline" className="text-orange-600">
                                {d.daysOverdue}d late
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Weather impact days (collapsible) */}
      {totalImpactDays > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowImpactDays(!showImpactDays)}
            >
              <CardTitle className="flex items-center gap-2 text-sm">
                <CloudRain className="size-4 text-blue-600" />
                Weather Impact Days ({totalImpactDays})
                {(data.totalRainDays ?? 0) > 0 && (
                  <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700">
                    ☔ {data.totalRainDays} rain
                  </span>
                )}
                {(data.totalTemperatureDays ?? 0) > 0 && (
                  <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] text-cyan-700">
                    🌡️ {data.totalTemperatureDays} temp
                  </span>
                )}
              </CardTitle>
              {showImpactDays ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {showImpactDays && (
            <CardContent>
              <div className="divide-y rounded-lg border">
                {data.rainedOffDays.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span>{r.type === "TEMPERATURE" ? "🌡️" : "☔"}</span>
                      <span>{format(new Date(r.date), "EEE dd MMM yyyy")}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${r.type === "TEMPERATURE" ? "bg-cyan-100 text-cyan-700" : "bg-orange-100 text-orange-700"}`}>
                        {r.type === "TEMPERATURE" ? "Temperature" : "Rain"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{r.note || "—"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Completed late trend (collapsible) */}
      {data.completedLateTrend.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowTrend(!showTrend)}
            >
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="size-4 text-slate-600" />
                Completed Late ({data.completedLateTrend.length})
              </CardTitle>
              {showTrend ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {showTrend && (
            <CardContent>
              <div className="divide-y rounded-lg border">
                {data.completedLateTrend.map((j) => (
                  <div key={j.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium">{j.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Plot {j.plotNumber} · Due {format(new Date(j.scheduledEnd), "dd MMM")} ·
                        Completed {format(new Date(j.actualEnd), "dd MMM")}
                      </p>
                    </div>
                    <Badge variant="secondary">{j.daysLate}d late</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {data.delayedJobs.length === 0 && data.overdueDeliveries.length === 0 && (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <Clock className="mb-2 size-8 opacity-30" />
          <p className="text-sm font-medium text-green-600">No current delays!</p>
          <p className="text-xs">All jobs and deliveries are on schedule</p>
        </div>
      )}
    </div>
  );
}
