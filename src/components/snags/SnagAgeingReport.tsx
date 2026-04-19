"use client";

import { useState, useEffect } from "react";
import { useDevDate } from "@/lib/dev-date-context";
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Loader2,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportExportButtons } from "@/components/shared/ReportExportButtons";
import { format } from "date-fns";

interface AgeingData {
  totalSnags: number;
  openCount: number;
  resolvedCount: number;
  avgResolutionDays: number;
  ageBuckets: {
    under7: number;
    days7to14: number;
    days14to30: number;
    over30: number;
  };
  priorityCounts: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
  oldestOpen: Array<{
    id: string;
    description: string;
    location: string | null;
    priority: string;
    status: string;
    daysOpen: number;
    assignedTo: string | null;
    plot: string;
    createdAt: string;
  }>;
}

const PRIORITY_STYLES: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-blue-100 text-blue-700",
  HIGH: "bg-amber-100 text-amber-700",
  CRITICAL: "bg-red-100 text-red-700",
};

export function SnagAgeingReport({ siteId }: { siteId: string }) {
  const { devDate } = useDevDate();
  const [data, setData] = useState<AgeingData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/sites/${siteId}/snag-report`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [siteId, devDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const bucketItems = [
    { label: "< 7 days", count: data.ageBuckets.under7, color: "bg-green-500" },
    { label: "7–14 days", count: data.ageBuckets.days7to14, color: "bg-yellow-500" },
    { label: "14–30 days", count: data.ageBuckets.days14to30, color: "bg-orange-500" },
    { label: "> 30 days", count: data.ageBuckets.over30, color: "bg-red-500" },
  ];
  const maxBucket = Math.max(...bucketItems.map((b) => b.count), 1);

  // Flatten oldest-open rows for Excel.
  const exportRows = data.oldestOpen.map((s) => ({
    Plot: s.plot,
    Description: s.description,
    Location: s.location || "",
    Priority: s.priority,
    Status: s.status,
    "Days Open": s.daysOpen,
    Assigned: s.assignedTo || "",
    Created: format(new Date(s.createdAt), "yyyy-MM-dd"),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Snag Ageing Report</h3>
        <ReportExportButtons
          filename={`snag-ageing-${format(new Date(), "yyyy-MM-dd")}`}
          rows={exportRows}
          sheetName="Snag Ageing"
          compact
        />
      </div>
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-blue-500/10 p-2">
              <BarChart3 className="size-4 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Snags</p>
              <p className="text-lg font-semibold">{data.totalSnags}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-orange-500/10 p-2">
              <AlertTriangle className="size-4 text-orange-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Open</p>
              <p className="text-lg font-semibold">{data.openCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-green-500/10 p-2">
              <CheckCircle2 className="size-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Resolved</p>
              <p className="text-lg font-semibold">{data.resolvedCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 py-3">
            <div className="rounded-lg bg-purple-500/10 p-2">
              <Clock className="size-4 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Resolution</p>
              <p className="text-lg font-semibold">{data.avgResolutionDays}d</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Age distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Open Snag Age Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {bucketItems.map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <span className="w-20 text-xs text-muted-foreground">{b.label}</span>
                  <div className="flex-1">
                    <div
                      className={`h-5 rounded ${b.color}`}
                      style={{ width: `${(b.count / maxBucket) * 100}%`, minWidth: b.count > 0 ? "8px" : "0" }}
                    />
                  </div>
                  <span className="w-6 text-right text-xs font-medium">{b.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Priority breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Priority Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((p) => (
                <div key={p} className="flex items-center justify-between">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PRIORITY_STYLES[p]}`}>
                    {p.charAt(0) + p.slice(1).toLowerCase()}
                  </span>
                  <span className="text-sm font-medium">{data.priorityCounts[p]}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Oldest open snags */}
      {data.oldestOpen.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-orange-700">
              <Clock className="size-4" />
              Oldest Open Snags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.oldestOpen.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded border p-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.plot}
                      {s.location && ` · ${s.location}`}
                      {s.assignedTo && ` · ${s.assignedTo}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${PRIORITY_STYLES[s.priority]}`}>
                      {s.priority}
                    </span>
                    <Badge variant="outline" className="text-[10px] text-orange-700">
                      {s.daysOpen}d
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
