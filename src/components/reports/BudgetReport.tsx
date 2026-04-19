"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchErrorMessage } from "@/components/ui/toast";

interface BudgetReportProps {
  siteId: string;
}

interface BudgetData {
  generatedAt: string;
  siteSummary: {
    totalBudgeted: number;
    totalActual: number;
    totalVariance: number;
    variancePercent: number;
    plotCount: number;
    plotsOverBudget: number;
    plotsUnderBudget: number;
    plotsOnBudget: number;
  };
  topOverruns: Array<{
    plotNumber: string | null;
    plotName: string;
    jobName: string;
    variance: number;
    variancePercent: number;
  }>;
  plots: Array<{
    plotId: string;
    plotNumber: string | null;
    plotName: string;
    houseType: string | null;
    templateMatched: string | null;
    budgeted: number;
    actual: number;
    variance: number;
    variancePercent: number;
    jobs: Array<{
      jobId: string;
      jobName: string;
      status: string;
      budgeted: number;
      actual: number;
      variance: number;
      variancePercent: number;
      orderCount: number;
    }>;
  }>;
  availableTemplates: Array<{
    key: string;
    templateName: string;
    totalBudget: number;
  }>;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function VarianceIndicator({ variance, percent }: { variance: number; percent: number }) {
  if (variance === 0) {
    return (
      <span className="flex items-center gap-1 text-slate-500">
        <Minus className="size-3" />
        <span className="text-xs">On budget</span>
      </span>
    );
  }
  if (variance > 0) {
    return (
      <span className="flex items-center gap-1 text-red-600">
        <TrendingUp className="size-3" />
        <span className="text-xs font-medium">+{formatCurrency(variance)} ({percent > 0 ? "+" : ""}{percent}%)</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-green-600">
      <TrendingDown className="size-3" />
      <span className="text-xs font-medium">{formatCurrency(variance)} ({percent}%)</span>
    </span>
  );
}

export function BudgetReport({ siteId }: BudgetReportProps) {
  // Store fetched data with the siteId it belongs to so `loading` can be
  // derived without calling setState inside an effect.
  const [loaded, setLoaded] = useState<{ siteId: string; data: BudgetData | null; error: string | null } | null>(null);
  const data = loaded?.siteId === siteId ? loaded.data : null;
  const loading = loaded?.siteId !== siteId;
  const error = loaded?.siteId === siteId ? loaded.error : null;
  const [expandedPlots, setExpandedPlots] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}/budget-report`);
        if (cancelled) return;
        if (!res.ok) {
          const msg = await fetchErrorMessage(res, "Failed to load budget report");
          setLoaded({ siteId, data: null, error: msg });
          return;
        }
        const d = await res.json();
        if (!cancelled) setLoaded({ siteId, data: d, error: null });
      } catch (e) {
        if (!cancelled) setLoaded({ siteId, data: null, error: e instanceof Error ? e.message : "Network error" });
      }
    })();
    return () => { cancelled = true; };
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

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p className="font-medium">Failed to load budget report</p>
        <p className="text-xs">{error}</p>
        <button onClick={() => setLoaded(null)} className="mt-2 text-xs underline">Retry</button>
      </div>
    );
  }

  if (!data) return null;

  const s = data.siteSummary;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Budget vs Actual Report</h3>
        <p className="text-xs text-muted-foreground">
          Generated {format(new Date(data.generatedAt), "dd MMM yyyy HH:mm")}
        </p>
      </div>

      {/* Site summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Budgeted</p>
            <p className="text-xl font-bold">{formatCurrency(s.totalBudgeted)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Actual Spend</p>
            <p className="text-xl font-bold">{formatCurrency(s.totalActual)}</p>
          </CardContent>
        </Card>
        <Card className={s.totalVariance > 0 ? "border-red-200" : s.totalVariance < 0 ? "border-green-200" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Variance</p>
            <p className={`text-xl font-bold ${s.totalVariance > 0 ? "text-red-600" : s.totalVariance < 0 ? "text-green-600" : ""}`}>
              {s.totalVariance >= 0 ? "+" : ""}{formatCurrency(s.totalVariance)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {s.variancePercent >= 0 ? "+" : ""}{s.variancePercent}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Plots</p>
            <div className="flex items-center justify-center gap-2 text-xs">
              {s.plotsOverBudget > 0 && (
                <span className="text-red-600">{s.plotsOverBudget} over</span>
              )}
              {s.plotsUnderBudget > 0 && (
                <span className="text-green-600">{s.plotsUnderBudget} under</span>
              )}
              {s.plotsOnBudget > 0 && (
                <span className="text-slate-500">{s.plotsOnBudget} on</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top overruns */}
      {data.topOverruns.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-red-700">
              <AlertTriangle className="size-4" />
              Top Cost Overruns
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y rounded-lg border">
              {data.topOverruns.slice(0, 5).map((item, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{item.jobName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.plotNumber ? item.plotNumber : item.plotName}
                    </p>
                  </div>
                  <span className="font-medium text-red-600">
                    +{formatCurrency(item.variance)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-plot breakdown */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-muted-foreground">
          Plot Breakdown
        </h4>
        {data.plots.map((plot) => {
          const isExpanded = expandedPlots.has(plot.plotId);
          const hasData = plot.budgeted > 0 || plot.actual > 0;

          return (
            <Card key={plot.plotId}>
              <button
                className="flex w-full items-center justify-between p-3 text-left hover:bg-slate-50"
                onClick={() => togglePlot(plot.plotId)}
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? (
                    <ChevronDown className="size-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 text-muted-foreground" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {plot.plotNumber ? plot.plotNumber : plot.plotName}
                      {plot.houseType && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          ({plot.houseType})
                        </span>
                      )}
                    </p>
                    {!plot.templateMatched && plot.budgeted === 0 && (
                      <p className="text-[10px] text-yellow-600">No template matched</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  {hasData && (
                    <>
                      <div className="text-xs">
                        <p className="text-muted-foreground">Budget</p>
                        <p className="font-medium">{formatCurrency(plot.budgeted)}</p>
                      </div>
                      <div className="text-xs">
                        <p className="text-muted-foreground">Actual</p>
                        <p className="font-medium">{formatCurrency(plot.actual)}</p>
                      </div>
                      <VarianceIndicator variance={plot.variance} percent={plot.variancePercent} />
                    </>
                  )}
                </div>
              </button>

              {isExpanded && (
                <CardContent className="border-t pt-3">
                  {plot.jobs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No jobs</p>
                  ) : (
                    <div className="divide-y rounded-lg border">
                      {plot.jobs.map((job) => (
                        <Link
                          href={`/jobs/${job.jobId}`}
                          key={job.jobId}
                          className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2 text-sm hover:bg-blue-50/50"
                        >
                          <div>
                            <p className="font-medium hover:text-blue-700">{job.jobName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {job.orderCount} order{job.orderCount !== 1 ? "s" : ""} · {job.status.replace("_", " ")}
                            </p>
                          </div>
                          <span className="text-right text-xs text-muted-foreground">
                            {formatCurrency(job.budgeted)}
                          </span>
                          <span className="text-right text-xs font-medium">
                            {formatCurrency(job.actual)}
                          </span>
                          <VarianceIndicator variance={job.variance} percent={job.variancePercent} />
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {s.totalBudgeted === 0 && s.totalActual === 0 && (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <DollarSign className="mb-2 size-8 opacity-30" />
          <p className="text-sm">No budget or order data yet</p>
          <p className="text-xs">Assign plot templates and create orders to see budget comparisons</p>
        </div>
      )}
    </div>
  );
}
