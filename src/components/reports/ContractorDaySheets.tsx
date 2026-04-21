"use client";

import { useState, useEffect } from "react";
import { format, addDays, differenceInCalendarDays } from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import { useJobAction } from "@/hooks/useJobAction";
import {
  Users,
  HardHat,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Printer,
  Package,
  MapPin,
  Phone,
  Mail,
  Play,
  CheckCircle2,
  Check,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface ContractorDaySheetsProps {
  siteId: string;
}

interface JobItem {
  id: string;
  name: string;
  status: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  plot: { plotNumber: string | null; name: string; houseType: string | null };
  deliveries: Array<{
    id: string;
    items: string | null;
    supplier: string;
    expectedDate: string | null;
  }>;
}

interface DaySheetsData {
  date: string;
  siteId: string;
  contractorSheets: Array<{
    contractor: {
      id: string;
      name: string;
      company: string | null;
      phone: string | null;
      email: string | null;
    };
    jobs: JobItem[];
  }>;
  assigneeSheets: Array<{
    assignee: {
      id: string;
      name: string;
      email: string;
      role: string;
    };
    jobs: JobItem[];
  }>;
  unassignedJobs: JobItem[];
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "IN_PROGRESS"
      ? "bg-blue-100 text-blue-700"
      : status === "NOT_STARTED"
        ? "bg-slate-100 text-slate-600"
        : status === "ON_HOLD"
          ? "bg-yellow-100 text-yellow-700"
          : "bg-green-100 text-green-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function JobActionButton({
  jobId,
  status,
  pending,
  onAction,
  onExtend,
}: {
  jobId: string;
  status: string;
  pending: boolean;
  onAction: (jobId: string, action: "start" | "complete") => void;
  onExtend?: (jobId: string) => void;
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
      <div className="flex items-center gap-1">
        {onExtend && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 border-orange-200 px-2 text-[10px] text-orange-700 hover:bg-orange-50"
            onClick={(e) => {
              e.stopPropagation();
              onExtend(jobId);
            }}
          >
            <Clock className="size-2.5" /> Extend
          </Button>
        )}
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
      </div>
    );
  }
  if (status === "IN_PROGRESS") {
    return (
      <div className="flex items-center gap-1">
        {onExtend && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1 border-orange-200 px-2 text-[10px] text-orange-700 hover:bg-orange-50"
            onClick={(e) => {
              e.stopPropagation();
              onExtend(jobId);
            }}
          >
            <Clock className="size-2.5" /> Extend
          </Button>
        )}
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
      </div>
    );
  }
  return null;
}

function JobRow({
  job,
  pending,
  onAction,
  onExtend,
}: {
  job: JobItem;
  pending: boolean;
  onAction: (jobId: string, action: "start" | "complete") => void;
  onExtend: (jobId: string) => void;
}) {
  return (
    <div className="rounded border p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{job.name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="size-3" />
              {job.plot.plotNumber ? `Plot ${job.plot.plotNumber}` : job.plot.name}
              {job.plot.houseType && ` (${job.plot.houseType})`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <JobActionButton
            jobId={job.id}
            status={job.status}
            pending={pending}
            onAction={onAction}
            onExtend={onExtend}
          />
          <StatusBadge status={job.status} />
        </div>
      </div>
      {job.description && (
        <p className="mt-1 text-xs text-muted-foreground">{job.description}</p>
      )}
      {job.deliveries.length > 0 && (
        <div className="mt-2 space-y-1">
          {job.deliveries.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-1.5 text-xs text-blue-600"
            >
              <Package className="size-3" />
              <span>
                Delivery: {d.items || "Materials"} from {d.supplier}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContractorDaySheets({ siteId }: ContractorDaySheetsProps) {
  const { devDate } = useDevDate();
  const [data, setData] = useState<DaySheetsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(getCurrentDate());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  // Centralised job action hook for start actions
  const { triggerAction: triggerJobStart, dialogs: jobActionDialogs } = useJobAction(
    async () => { setRefreshKey((k) => k + 1); }
  );

  // Extend dialog state
  const [extendTarget, setExtendTarget] = useState<JobItem | null>(null);
  const [extendDays, setExtendDays] = useState(1);
  const [extendPreview, setExtendPreview] = useState<{ deltaDays: number; jobUpdates: { jobId: string; jobName?: string }[]; orderUpdates: unknown[] } | null>(null);
  const [extendLoading, setExtendLoading] = useState(false);

  // Cascade-on-complete dialog state
  const [cascadeTarget, setCascadeTarget] = useState<{ jobId: string; jobName: string; deltaDays: number; endDate: string; actualEndDate: string } | null>(null);
  const [cascadePreview, setCascadePreview] = useState<{ deltaDays: number; jobUpdates: { jobId: string; jobName?: string }[]; orderUpdates: unknown[] } | null>(null);
  const [cascadeLoading, setCascadeLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const dateStr = format(date, "yyyy-MM-dd");
    fetch(`/api/sites/${siteId}/day-sheets?date=${dateStr}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [siteId, date, devDate, refreshKey]);

  const prevDay = () => setDate((d) => new Date(d.getTime() - 86400000));
  const nextDay = () => setDate((d) => new Date(d.getTime() + 86400000));
  const goToday = () => setDate(getCurrentDate());

  // Helper to find a job from current data
  const findJob = (jobId: string): JobItem | undefined => {
    if (!data) return undefined;
    for (const sheet of data.contractorSheets) {
      const j = sheet.jobs.find((j) => j.id === jobId);
      if (j) return j;
    }
    for (const sheet of data.assigneeSheets) {
      const j = sheet.jobs.find((j) => j.id === jobId);
      if (j) return j;
    }
    return data.unassignedJobs.find((j) => j.id === jobId);
  };

  const handleJobAction = async (jobId: string, action: "start" | "complete") => {
    // Start actions go through centralised hook with full pre-start checks
    if (action === "start") {
      const job = findJob(jobId);
      if (job) {
        await triggerJobStart(
          { id: job.id, name: job.name, status: job.status, startDate: job.startDate ?? null, endDate: job.endDate ?? null },
          "start"
        );
      }
      return;
    }
    setPendingActions((prev) => new Set(prev).add(jobId));
    try {
      const job = findJob(jobId);
      const res = await fetch(`/api/jobs/${jobId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const result = await res.json();
        setRefreshKey((k) => k + 1);

        // After completing, check if dates differ and prompt cascade
        if (action === "complete" && result.endDate && result.actualEndDate) {
          const delta = differenceInCalendarDays(
            new Date(result.actualEndDate),
            new Date(result.endDate)
          );
          if (delta !== 0) {
            setCascadeTarget({
              jobId,
              jobName: result.name || job?.name || "Job",
              deltaDays: delta,
              endDate: result.endDate,
              actualEndDate: result.actualEndDate,
            });
            // Auto-preview
            try {
              const previewRes = await fetch(`/api/jobs/${jobId}/cascade`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ newEndDate: result.actualEndDate }),
              });
              if (previewRes.ok) {
                setCascadePreview(await previewRes.json());
              }
            } catch {
              // ignore preview failure
            }
          }
        }
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

  // Extend dialog handlers
  const handleExtendOpen = (jobId: string) => {
    const job = findJob(jobId);
    if (job) {
      setExtendTarget(job);
      setExtendDays(1);
      setExtendPreview(null);
    }
  };

  const handleExtendPreview = async () => {
    if (!extendTarget || !extendTarget.endDate) return;
    setExtendLoading(true);
    try {
      const newEndDate = addDays(new Date(extendTarget.endDate), extendDays);
      const res = await fetch(`/api/jobs/${extendTarget.id}/cascade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEndDate: newEndDate.toISOString() }),
      });
      if (res.ok) {
        setExtendPreview(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setExtendLoading(false);
    }
  };

  const handleExtendConfirm = async () => {
    if (!extendTarget || !extendTarget.endDate) return;
    setExtendLoading(true);
    try {
      const newEndDate = addDays(new Date(extendTarget.endDate), extendDays);
      const res = await fetch(`/api/jobs/${extendTarget.id}/cascade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEndDate: newEndDate.toISOString(), confirm: true }),
      });
      if (res.ok) {
        setExtendTarget(null);
        setExtendPreview(null);
        setRefreshKey((k) => k + 1);
      }
    } catch {
      // ignore
    } finally {
      setExtendLoading(false);
    }
  };

  const handleCascadeConfirm = async () => {
    if (!cascadeTarget) return;
    setCascadeLoading(true);
    try {
      const res = await fetch(`/api/jobs/${cascadeTarget.jobId}/cascade`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newEndDate: cascadeTarget.actualEndDate, confirm: true }),
      });
      if (res.ok) {
        setCascadeTarget(null);
        setCascadePreview(null);
        setRefreshKey((k) => k + 1);
      }
    } catch {
      // ignore
    } finally {
      setCascadeLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const totalSheets =
    data.contractorSheets.length +
    data.assigneeSheets.length +
    (data.unassignedJobs.length > 0 ? 1 : 0);

  const totalJobs =
    data.contractorSheets.reduce((s, c) => s + c.jobs.length, 0) +
    data.assigneeSheets.reduce((s, a) => s + a.jobs.length, 0) +
    data.unassignedJobs.length;

  return (
    <div className="space-y-4">
      {jobActionDialogs}
      {/* Date nav + print */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevDay} className="print:hidden">
            <ChevronLeft className="size-4" />
          </Button>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger className="text-lg font-semibold hover:text-primary hover:underline underline-offset-4 transition-colors cursor-pointer">
              {format(date, "EEEE, d MMMM yyyy")}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  if (d) {
                    setDate(d);
                    setCalendarOpen(false);
                  }
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={nextDay} className="print:hidden">
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{totalJobs} jobs across {totalSheets} sheets</Badge>
          <Button variant="outline" size="sm" onClick={goToday} className="print:hidden">
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="print:hidden"
          >
            <Printer className="mr-1 size-4" />
            Print
          </Button>
        </div>
      </div>

      {totalJobs === 0 && (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <HardHat className="mb-2 size-8 opacity-30" />
          <p className="text-sm">No jobs scheduled for this date</p>
        </div>
      )}

      {/* Contractor sheets */}
      {data.contractorSheets.map((sheet) => (
        <Card key={sheet.contractor.id} className="print:break-inside-avoid">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <HardHat className="size-4 text-orange-600" />
                {sheet.contractor.company || sheet.contractor.name}
              </span>
              <Badge variant="outline">{sheet.jobs.length} job{sheet.jobs.length !== 1 ? "s" : ""}</Badge>
            </CardTitle>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{sheet.contractor.name}</span>
              {sheet.contractor.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="size-3" />
                  {sheet.contractor.phone}
                </span>
              )}
              {sheet.contractor.email && (
                <span className="flex items-center gap-1">
                  <Mail className="size-3" />
                  {sheet.contractor.email}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sheet.jobs.map((job) => (
                <JobRow key={job.id} job={job} pending={pendingActions.has(job.id)} onAction={handleJobAction} onExtend={handleExtendOpen} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Staff assignee sheets */}
      {data.assigneeSheets.map((sheet) => (
        <Card key={sheet.assignee.id} className="print:break-inside-avoid">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <Users className="size-4 text-blue-600" />
                {sheet.assignee.name}
              </span>
              <Badge variant="outline">{sheet.jobs.length} job{sheet.jobs.length !== 1 ? "s" : ""}</Badge>
            </CardTitle>
            <p className="text-xs text-muted-foreground">{sheet.assignee.role.replace("_", " ")}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {sheet.jobs.map((job) => (
                <JobRow key={job.id} job={job} pending={pendingActions.has(job.id)} onAction={handleJobAction} onExtend={handleExtendOpen} />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Unassigned */}
      {data.unassignedJobs.length > 0 && (
        <Card className="border-yellow-200 print:break-inside-avoid">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center justify-between text-sm text-yellow-700">
              <span>Unassigned Jobs</span>
              <Badge variant="outline">{data.unassignedJobs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.unassignedJobs.map((job) => (
                <JobRow key={job.id} job={job} pending={pendingActions.has(job.id)} onAction={handleJobAction} onExtend={handleExtendOpen} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extend Job Dialog */}
      <Dialog open={!!extendTarget} onOpenChange={(open) => { if (!open) { setExtendTarget(null); setExtendPreview(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Job</DialogTitle>
            <DialogDescription>
              Extend &ldquo;{extendTarget?.name}&rdquo; and shift all downstream jobs on this plot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Extend by (days)</label>
              <Input
                type="number"
                min={1}
                value={extendDays}
                onChange={(e) => { setExtendDays(Math.max(1, parseInt(e.target.value) || 1)); setExtendPreview(null); }}
                className="mt-1"
              />
            </div>
            {extendTarget?.endDate && (
              <p className="text-xs text-muted-foreground">
                Current end: {format(new Date(extendTarget.endDate), "d MMM yyyy")} → New end: {format(addDays(new Date(extendTarget.endDate), extendDays), "d MMM yyyy")}
              </p>
            )}
            {extendPreview && (
              <div className="rounded bg-orange-50 p-2 text-xs">
                <p className="font-medium text-orange-800">
                  +{extendPreview.deltaDays} day{extendPreview.deltaDays !== 1 ? "s" : ""} — {extendPreview.jobUpdates.length} downstream job{extendPreview.jobUpdates.length !== 1 ? "s" : ""} and {extendPreview.orderUpdates.length} order{extendPreview.orderUpdates.length !== 1 ? "s" : ""} will shift
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            {!extendPreview ? (
              <Button onClick={handleExtendPreview} disabled={extendLoading} size="sm">
                {extendLoading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                Preview
              </Button>
            ) : (
              <Button onClick={handleExtendConfirm} disabled={extendLoading} size="sm">
                {extendLoading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                Confirm Extension
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cascade after Complete Dialog */}
      <Dialog open={!!cascadeTarget} onOpenChange={(open) => { if (!open) { setCascadeTarget(null); setCascadePreview(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shift Plot Programme?</DialogTitle>
            <DialogDescription>
              &ldquo;{cascadeTarget?.jobName}&rdquo; finished{" "}
              {cascadeTarget && Math.abs(cascadeTarget.deltaDays)} day{cascadeTarget && Math.abs(cascadeTarget.deltaDays) !== 1 ? "s" : ""}{" "}
              {cascadeTarget && cascadeTarget.deltaDays > 0 ? "late" : "early"}.
              Would you like to shift the remaining jobs on this plot?
            </DialogDescription>
          </DialogHeader>
          {cascadePreview && (
            <div className="rounded bg-blue-50 p-2 text-xs">
              <p className="font-medium text-blue-800">
                {cascadePreview.deltaDays > 0 ? "+" : ""}{cascadePreview.deltaDays} day{Math.abs(cascadePreview.deltaDays) !== 1 ? "s" : ""} — {cascadePreview.jobUpdates.length} job{cascadePreview.jobUpdates.length !== 1 ? "s" : ""} and {cascadePreview.orderUpdates.length} order{cascadePreview.orderUpdates.length !== 1 ? "s" : ""} will shift
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setCascadeTarget(null); setCascadePreview(null); }}>
              No, Keep As Is
            </Button>
            <Button onClick={handleCascadeConfirm} disabled={cascadeLoading || !cascadePreview} size="sm">
              {cascadeLoading ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Yes, Shift Programme
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
