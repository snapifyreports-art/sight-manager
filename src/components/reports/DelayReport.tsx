"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DelayReportProps {
  siteId: string;
}

interface DelayData {
  generatedAt: string;
  totalRainedOffDays: number;
  rainedOffDays: Array<{ date: string; note: string | null }>;
  delayedJobs: Array<{
    id: string;
    name: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    daysOverdue: number;
    weatherAffected: boolean;
    rainDaysImpact: number;
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
  }>;
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
    weatherRelatedDelays: number;
    materialRelatedDelays: number;
    overdueDeliveryCount: number;
    completedLateCount: number;
  };
}

export function DelayReport({ siteId }: DelayReportProps) {
  const { devDate } = useDevDate();
  const [data, setData] = useState<DelayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRainDays, setShowRainDays] = useState(false);
  const [showTrend, setShowTrend] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sites/${siteId}/delay-report`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [siteId, devDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const s = data.summary;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Delay Justification Report</h3>
        <p className="text-xs text-muted-foreground">
          Generated {format(new Date(data.generatedAt), "dd MMM yyyy HH:mm")}
        </p>
      </div>

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
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">
              {s.weatherRelatedDelays}
            </p>
            <p className="text-xs text-muted-foreground">Weather Delays</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">
              {s.materialRelatedDelays}
            </p>
            <p className="text-xs text-muted-foreground">Material Delays</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-purple-600">
              {data.totalRainedOffDays}
            </p>
            <p className="text-xs text-muted-foreground">Rained Off Days</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-slate-600">
              {s.completedLateCount}
            </p>
            <p className="text-xs text-muted-foreground">Completed Late</p>
          </CardContent>
        </Card>
      </div>

      {/* Currently delayed jobs */}
      {data.delayedJobs.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="size-4" />
              Currently Overdue Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.delayedJobs.map((job) => (
                <div key={job.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium">{job.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {job.plot.plotNumber ? `Plot ${job.plot.plotNumber}` : job.plot.name}
                        {job.contractor && ` · ${job.contractor}`}
                        {job.assignedTo && ` · ${job.assignedTo}`}
                      </p>
                    </div>
                    <Badge variant="destructive" className="text-xs">
                      {job.daysOverdue} day{job.daysOverdue !== 1 ? "s" : ""} overdue
                    </Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {job.causes.map((cause, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          cause.startsWith("Weather")
                            ? "bg-blue-100 text-blue-700"
                            : cause.startsWith("Material")
                              ? "bg-orange-100 text-orange-700"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {cause.startsWith("Weather") && <CloudRain className="size-3" />}
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
                        <div
                          key={o.id}
                          className="flex items-center gap-2 rounded bg-orange-50 px-2 py-1 text-xs"
                        >
                          <Package className="size-3 text-orange-500" />
                          <span>
                            {o.supplier}: {o.items || "Materials"} —{" "}
                            {o.daysLate} day{o.daysLate !== 1 ? "s" : ""} late
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overdue deliveries */}
      {data.overdueDeliveries.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-orange-700">
              <Package className="size-4" />
              Overdue Deliveries ({data.overdueDeliveries.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-lg border">
              {data.overdueDeliveries.map((d) => (
                <div key={d.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{d.supplier}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.items || "Materials"} · {d.job} · {d.plot.plotNumber ? `Plot ${d.plot.plotNumber}` : d.plot.name}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-orange-600">
                    {d.daysOverdue}d late
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rained-off days (collapsible) */}
      {data.totalRainedOffDays > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <button
              className="flex w-full items-center justify-between text-left"
              onClick={() => setShowRainDays(!showRainDays)}
            >
              <CardTitle className="flex items-center gap-2 text-sm">
                <CloudRain className="size-4 text-blue-600" />
                Rained Off Days ({data.totalRainedOffDays})
              </CardTitle>
              {showRainDays ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
            </button>
          </CardHeader>
          {showRainDays && (
            <CardContent>
              <div className="divide-y rounded-lg border">
                {data.rainedOffDays.map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{format(new Date(r.date), "EEE dd MMM yyyy")}</span>
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
