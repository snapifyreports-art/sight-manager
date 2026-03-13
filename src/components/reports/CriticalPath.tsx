"use client";

import { useState, useEffect } from "react";
import { format, differenceInDays } from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import {
  Loader2,
  AlertTriangle,
  Target,
  Clock,
  ChevronDown,
  ChevronRight,
  CloudRain,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CriticalPathProps {
  siteId: string;
}

interface CriticalJob {
  jobId: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  duration: number;
  earlyStart?: number;
  earlyFinish?: number;
  slack: number;
  isCritical: boolean;
  weatherAffected: boolean;
  assignee: string | null;
}

interface PlotPath {
  plotId: string;
  plotNumber: string | null;
  plotName: string;
  houseType: string | null;
  projectStart?: string;
  projectedEnd: string | null;
  totalDuration: number;
  criticalPathJobs: CriticalJob[];
  allJobs: CriticalJob[];
}

interface PathData {
  siteId: string;
  generatedAt: string;
  siteCriticalPlotId: string | null;
  siteCriticalPlotNumber: string | null;
  siteProjectedEnd: string | null;
  siteTotalDuration: number;
  plots: PlotPath[];
}

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-slate-200",
  IN_PROGRESS: "bg-blue-400",
  ON_HOLD: "bg-yellow-400",
  COMPLETED: "bg-green-400",
};

export function CriticalPath({ siteId }: CriticalPathProps) {
  const [data, setData] = useState<PathData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlotId, setSelectedPlotId] = useState<string>("all");
  const [expandedPlots, setExpandedPlots] = useState<Set<string>>(new Set());

  useEffect(() => {
    setLoading(true);
    fetch(`/api/sites/${siteId}/critical-path`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d.siteCriticalPlotId) {
          setExpandedPlots(new Set([d.siteCriticalPlotId]));
        }
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  const togglePlot = (plotId: string) => {
    setExpandedPlots((prev) => {
      const next = new Set(prev);
      if (next.has(plotId)) next.delete(plotId);
      else next.add(plotId);
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

  const filteredPlots =
    selectedPlotId === "all"
      ? data.plots
      : data.plots.filter((p) => p.plotId === selectedPlotId);

  const today = getCurrentDate();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Critical Path Analysis</h3>
        <Select value={selectedPlotId} onValueChange={(v) => v !== null && setSelectedPlotId(v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All Plots" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Plots</SelectItem>
            {data.plots.map((p) => (
              <SelectItem key={p.plotId} value={p.plotId}>
                {p.plotNumber ? `Plot ${p.plotNumber}` : p.plotName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Site summary */}
      {selectedPlotId === "all" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Critical Plot</p>
              <p className="text-xl font-bold">
                {data.siteCriticalPlotNumber || "—"}
              </p>
              <p className="text-[10px] text-muted-foreground">
                Longest duration
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Longest Duration</p>
              <p className="text-xl font-bold">{data.siteTotalDuration} days</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Projected End</p>
              <p className="text-xl font-bold">
                {data.siteProjectedEnd
                  ? format(new Date(data.siteProjectedEnd), "dd MMM yy")
                  : "—"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Days Remaining</p>
              <p className={`text-xl font-bold ${
                data.siteProjectedEnd && new Date(data.siteProjectedEnd) < today
                  ? "text-red-600"
                  : "text-green-600"
              }`}>
                {data.siteProjectedEnd
                  ? Math.max(0, differenceInDays(new Date(data.siteProjectedEnd), today))
                  : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Per-plot critical paths */}
      {filteredPlots.map((plot) => {
        const isExpanded = expandedPlots.has(plot.plotId);
        const isSiteCritical = plot.plotId === data.siteCriticalPlotId;
        const jobs = plot.allJobs.length > 0 ? plot.allJobs : plot.criticalPathJobs;

        return (
          <Card
            key={plot.plotId}
            className={isSiteCritical ? "border-red-300 ring-1 ring-red-100" : ""}
          >
            <button
              className="flex w-full items-center justify-between p-3 text-left hover:bg-slate-50"
              onClick={() => togglePlot(plot.plotId)}
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="size-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-4 text-muted-foreground" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.plotName}
                    </span>
                    {plot.houseType && (
                      <span className="text-xs text-muted-foreground">
                        ({plot.houseType})
                      </span>
                    )}
                    {isSiteCritical && (
                      <Badge variant="destructive" className="text-[10px]">
                        <Target className="mr-1 size-3" />
                        Critical
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {plot.totalDuration} days ·{" "}
                    {plot.criticalPathJobs.length} critical job{plot.criticalPathJobs.length !== 1 ? "s" : ""}
                    {plot.projectedEnd && ` · Ends ${format(new Date(plot.projectedEnd), "dd MMM yy")}`}
                  </p>
                </div>
              </div>

              {/* Mini progress bar */}
              <div className="hidden w-32 sm:block">
                <div className="flex h-4 overflow-hidden rounded-full border bg-slate-50">
                  {jobs.map((j, i) => (
                    <div
                      key={j.jobId}
                      className={`h-full ${
                        j.isCritical
                          ? j.status === "COMPLETED"
                            ? "bg-green-500"
                            : "bg-red-400"
                          : STATUS_COLORS[j.status] || "bg-slate-200"
                      }`}
                      style={{
                        width: `${(j.duration / Math.max(plot.totalDuration, 1)) * 100}%`,
                      }}
                      title={`${j.name} (${j.duration}d)`}
                    />
                  ))}
                </div>
              </div>
            </button>

            {isExpanded && jobs.length > 0 && (
              <CardContent className="border-t pt-3">
                {/* Gantt-like bar chart */}
                <div className="space-y-1.5">
                  {jobs.map((job) => (
                    <div key={job.jobId} className="flex items-center gap-2">
                      {/* Job name */}
                      <div className="w-36 shrink-0 truncate text-xs">
                        <span className={job.isCritical ? "font-semibold text-red-700" : ""}>
                          {job.name}
                        </span>
                      </div>

                      {/* Bar */}
                      <div className="relative flex-1">
                        <div className="h-6 w-full rounded bg-slate-50">
                          <div
                            className={`absolute h-6 rounded ${
                              job.isCritical
                                ? job.status === "COMPLETED"
                                  ? "bg-green-500/80"
                                  : "bg-red-400/80 ring-1 ring-red-500"
                                : STATUS_COLORS[job.status] || "bg-slate-200"
                            }`}
                            style={{
                              left: `${((job.earlyStart ?? 0) / Math.max(plot.totalDuration, 1)) * 100}%`,
                              width: `${Math.max((job.duration / Math.max(plot.totalDuration, 1)) * 100, 2)}%`,
                            }}
                          >
                            <span className="flex h-full items-center px-1 text-[9px] text-white">
                              {job.duration}d
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Slack & meta */}
                      <div className="flex w-28 shrink-0 items-center gap-1 text-right">
                        {job.weatherAffected && (
                          <CloudRain className="size-3 text-blue-400" />
                        )}
                        {job.isCritical ? (
                          <Badge variant="destructive" className="text-[9px]">
                            Critical
                          </Badge>
                        ) : job.slack > 0 ? (
                          <span className="text-[10px] text-muted-foreground">
                            {job.slack}d slack
                          </span>
                        ) : null}
                        <span
                          className={`ml-auto size-2 rounded-full ${
                            job.status === "COMPLETED"
                              ? "bg-green-500"
                              : job.status === "IN_PROGRESS"
                                ? "bg-blue-500"
                                : job.status === "ON_HOLD"
                                  ? "bg-yellow-500"
                                  : "bg-slate-300"
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Legend */}
                <div className="mt-3 flex flex-wrap gap-3 border-t pt-2 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="inline-block size-2.5 rounded bg-red-400 ring-1 ring-red-500" />
                    Critical path
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block size-2.5 rounded bg-blue-400" />
                    In progress
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block size-2.5 rounded bg-green-400" />
                    Completed
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block size-2.5 rounded bg-slate-200" />
                    Not started
                  </span>
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {filteredPlots.length === 0 && (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <Target className="mb-2 size-8 opacity-30" />
          <p className="text-sm">No scheduled jobs to analyze</p>
          <p className="text-xs">Add start and end dates to jobs to see the critical path</p>
        </div>
      )}
    </div>
  );
}
