"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
} from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Briefcase,
  Package,
  CloudRain,
  Thermometer,
  CheckCircle2,
  PlayCircle,
  Mail,
  FileCheck,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useJobAction } from "@/hooks/useJobAction";
import { useOrderStatus, type OrderStatus } from "@/hooks/useOrderStatus";

interface SiteCalendarProps {
  siteId: string;
}

interface CalendarJob {
  id: string;
  name: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  weatherAffected: boolean;
  signedOff: boolean;
  plot: { plotNumber: string | null; name: string };
  assignee: string | null;
}

interface CalendarDelivery {
  id: string;
  items: string | null;
  status: string;
  expectedDate: string | null;
  deliveredDate: string | null;
  supplier: string;
  supplierEmail: string | null;
  job: string;
  plot: { plotNumber: string | null; name: string };
}

interface CalendarOrder {
  id: string;
  items: string | null;
  dateOfOrder: string;
  supplier: string;
  supplierEmail: string | null;
  job: string;
  plot: { plotNumber: string | null; name: string };
}

interface CalendarData {
  month: string;
  jobs: CalendarJob[];
  deliveries: CalendarDelivery[];
  ordersToPlace: CalendarOrder[];
  rainedOffDays: Array<{ date: string; note: string | null; type: string }>;
}

interface DayEvents {
  jobsStarting: CalendarJob[];
  jobsEnding: CalendarJob[];
  deliveries: CalendarDelivery[];
  ordersToPlace: CalendarOrder[];
  isRainedOff: boolean;
  rainNote: string | null;
  weatherType: "RAIN" | "TEMPERATURE" | "BOTH" | null;
}

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: "bg-slate-200 text-slate-700",
  IN_PROGRESS: "bg-blue-200 text-blue-700",
  ON_HOLD: "bg-yellow-200 text-yellow-700",
  COMPLETED: "bg-green-200 text-green-700",
};

export function SiteCalendar({ siteId }: SiteCalendarProps) {
  const { devDate } = useDevDate();
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(getCurrentDate());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  useEffect(() => {
    setLoading(true);
    const monthStr = format(currentMonth, "yyyy-MM");
    fetch(`/api/sites/${siteId}/calendar?month=${monthStr}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [siteId, currentMonth, devDate]);

  // Build day → events map
  const dayEventsMap = useMemo(() => {
    if (!data) return new Map<string, DayEvents>();

    const map = new Map<string, DayEvents>();

    const getOrCreate = (dateStr: string): DayEvents => {
      if (!map.has(dateStr)) {
        map.set(dateStr, {
          jobsStarting: [],
          jobsEnding: [],
          deliveries: [],
          ordersToPlace: [],
          isRainedOff: false,
          rainNote: null,
          weatherType: null,
        });
      }
      return map.get(dateStr)!;
    };

    for (const job of data.jobs) {
      if (job.startDate) {
        const key = job.startDate.slice(0, 10);
        getOrCreate(key).jobsStarting.push(job);
      }
      if (job.endDate) {
        const key = job.endDate.slice(0, 10);
        getOrCreate(key).jobsEnding.push(job);
      }
    }

    for (const del of data.deliveries) {
      const dateStr = del.deliveredDate || del.expectedDate;
      if (dateStr) {
        const key = dateStr.slice(0, 10);
        getOrCreate(key).deliveries.push(del);
      }
    }

    for (const order of data.ordersToPlace) {
      const key = order.dateOfOrder.slice(0, 10);
      getOrCreate(key).ordersToPlace.push(order);
    }

    for (const rain of data.rainedOffDays) {
      const key = rain.date.slice(0, 10);
      const entry = getOrCreate(key);
      entry.isRainedOff = true;
      entry.rainNote = rain.note;
      const incoming = rain.type as "RAIN" | "TEMPERATURE";
      if (entry.weatherType === null) {
        entry.weatherType = incoming;
      } else if (entry.weatherType !== incoming) {
        entry.weatherType = "BOTH";
      }
    }

    return map;
  }, [data]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  // Build grid of days
  const days: Date[] = [];
  let day = calStart;
  while (day <= calEnd) {
    days.push(day);
    day = addDays(day, 1);
  }

  const selectedKey = selectedDay ? format(selectedDay, "yyyy-MM-dd") : null;
  const selectedEvents = selectedKey ? dayEventsMap.get(selectedKey) : null;

  // Action loading state
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());

  const refreshData = useCallback(() => {
    const monthStr = format(currentMonth, "yyyy-MM");
    fetch(`/api/sites/${siteId}/calendar?month=${monthStr}`)
      .then((r) => r.json())
      .then(setData);
  }, [siteId, currentMonth]);

  // Centralised pre-start flow — wraps start with predecessor/order/early-late dialogs.
  // Complete/signoff skip the pre-start UX and go directly via the raw endpoint.
  const { triggerAction: triggerJobAction, dialogs: jobActionDialogs } = useJobAction(
    (_action, _jobId) => { refreshData(); }
  );

  const handleJobAction = useCallback(async (jobId: string, action: "start" | "complete" | "signoff") => {
    if (action === "start") {
      // Look up the job in the current calendar data so the hook has dates/orders to work with
      const allJobs = data?.jobs ?? [];
      const j = allJobs.find((x) => x.id === jobId);
      if (!j) return;
      await triggerJobAction(
        { id: j.id, name: j.name, status: j.status, startDate: j.startDate, endDate: j.endDate },
        "start"
      );
      return;
    }
    setPendingActions((prev) => new Set(prev).add(jobId));
    try {
      const res = await fetch(`/api/jobs/${jobId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) refreshData();
    } finally {
      setPendingActions((prev) => { const n = new Set(prev); n.delete(jobId); return n; });
    }
  }, [refreshData, triggerJobAction, data]);

  const { setOrderStatus, isPending: isOrderPending } = useOrderStatus({
    onChange: () => refreshData(),
  });
  const handleOrderAction = useCallback((orderId: string, status: OrderStatus) => {
    void setOrderStatus(orderId, status);
  }, [setOrderStatus]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobActionDialogs}
      {/* Month navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <h3 className="text-lg font-semibold">
            {format(currentMonth, "MMMM yyyy")}
          </h3>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {/* (May 2026 audit #59 + #189) Subscribe-to-calendar button.
              Copies the iCal feed URL so the manager can paste it into
              Outlook / Google / Apple Calendar's "Add subscription"
              flow. The feed itself is the /api/sites/[id]/calendar.ics
              route shipped in batch 39. */}
          <SubscribeButton siteId={siteId} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setCurrentMonth(getCurrentDate());
              setSelectedDay(getCurrentDate());
            }}
          >
            Today
          </Button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b bg-slate-50 text-center text-xs font-medium text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="px-1 py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const key = format(d, "yyyy-MM-dd");
            const events = dayEventsMap.get(key);
            const inMonth = isSameMonth(d, currentMonth);
            const today = isSameDay(d, getCurrentDate());
            const selected = selectedDay && isSameDay(d, selectedDay);
            const hasEvents = events && (
              events.jobsStarting.length > 0 ||
              events.jobsEnding.length > 0 ||
              events.deliveries.length > 0 ||
              events.isRainedOff
            );

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(d)}
                className={`min-h-[70px] border-b border-r p-1 text-left transition-colors hover:bg-slate-50 ${
                  !inMonth ? "bg-slate-50/50 text-muted-foreground/40" : ""
                } ${selected ? "bg-blue-50 ring-1 ring-blue-300" : ""} ${
                  events?.weatherType === "RAIN" ? "bg-blue-50/30" :
                  events?.weatherType === "TEMPERATURE" ? "bg-cyan-50/30" :
                  events?.weatherType === "BOTH" ? "bg-amber-50/30" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${
                      today
                        ? "bg-blue-600 font-bold text-white"
                        : "font-medium"
                    }`}
                  >
                    {format(d, "d")}
                  </span>
                  {events?.weatherType === "RAIN" && (
                    <CloudRain className="size-3 text-blue-400" />
                  )}
                  {events?.weatherType === "TEMPERATURE" && (
                    <Thermometer className="size-3 text-cyan-500" />
                  )}
                  {events?.weatherType === "BOTH" && (
                    <span className="flex items-center gap-0.5">
                      <CloudRain className="size-3 text-blue-400" />
                      <Thermometer className="size-3 text-cyan-500" />
                    </span>
                  )}
                </div>
                {hasEvents && inMonth && (
                  <div className="mt-0.5 space-y-0.5">
                    {events!.jobsStarting.slice(0, 2).map((j) => (
                      <div
                        key={`s-${j.id}`}
                        className="truncate rounded px-1 text-[9px] leading-tight bg-green-100 text-green-700"
                      >
                        ▶ {j.name}
                      </div>
                    ))}
                    {events!.jobsEnding.slice(0, 2).map((j) => (
                      <div
                        key={`e-${j.id}`}
                        className={`truncate rounded px-1 text-[9px] leading-tight ${
                          j.status === "COMPLETED"
                            ? "bg-green-100 text-green-700"
                            : "bg-orange-100 text-orange-700"
                        }`}
                      >
                        ■ {j.name}
                      </div>
                    ))}
                    {events!.deliveries.slice(0, 1).map((d) => (
                      <div
                        key={`d-${d.id}`}
                        className="truncate rounded bg-purple-100 px-1 text-[9px] leading-tight text-purple-700"
                      >
                        📦 {d.supplier}
                      </div>
                    ))}
                    {(events!.jobsStarting.length + events!.jobsEnding.length + events!.deliveries.length > 3) && (
                      <div className="text-[9px] text-muted-foreground">
                        +{events!.jobsStarting.length + events!.jobsEnding.length + events!.deliveries.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {format(selectedDay, "EEEE, d MMMM yyyy")}
              {selectedEvents?.isRainedOff && (
                <span className={`ml-2 inline-flex items-center gap-1 text-xs font-normal ${
                  selectedEvents.weatherType === "TEMPERATURE" ? "text-cyan-600" :
                  selectedEvents.weatherType === "BOTH" ? "text-amber-600" : "text-blue-600"
                }`}>
                  {selectedEvents.weatherType === "RAIN" && <CloudRain className="size-3" />}
                  {selectedEvents.weatherType === "TEMPERATURE" && <Thermometer className="size-3" />}
                  {selectedEvents.weatherType === "BOTH" && <><CloudRain className="size-3" /><Thermometer className="size-3" /></>}
                  {selectedEvents.weatherType === "RAIN" ? "Rain" :
                   selectedEvents.weatherType === "TEMPERATURE" ? "Temperature" : "Weather"} Impact
                  {selectedEvents.rainNote && ` — ${selectedEvents.rainNote}`}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              // Derived lists for this day
              const ordersToPlace = selectedEvents?.ordersToPlace ?? [];
              const signOffsNeeded = (selectedEvents?.jobsEnding ?? []).filter(
                (j) => j.status === "COMPLETED" && !j.signedOff
              );
              const deliveriesExpected = (selectedEvents?.deliveries ?? []).filter(
                (d) => d.status === "ORDERED"
              );
              const jobsStartingNotStarted = (selectedEvents?.jobsStarting ?? []).filter(
                (j) => j.status === "NOT_STARTED"
              );

              const hasAnything =
                ordersToPlace.length > 0 ||
                signOffsNeeded.length > 0 ||
                deliveriesExpected.length > 0 ||
                jobsStartingNotStarted.length > 0 ||
                (selectedEvents &&
                  (selectedEvents.jobsStarting.length > 0 ||
                    selectedEvents.jobsEnding.length > 0 ||
                    selectedEvents.deliveries.length > 0));

              if (!hasAnything) {
                return (
                  <p className="text-sm text-muted-foreground">
                    No events scheduled
                  </p>
                );
              }

              return (
                <div className="space-y-4">
                  {/* Orders to place */}
                  {ordersToPlace.length > 0 && (
                    <div>
                      <h5 className="mb-1 flex items-center gap-1 text-xs font-semibold text-violet-700">
                        <Package className="size-3" />
                        Orders to Place ({ordersToPlace.length})
                      </h5>
                      <div className="space-y-1">
                        {ordersToPlace.map((o) => (
                          <div
                            key={o.id}
                            className="flex items-center justify-between rounded border border-violet-100 bg-violet-50/30 px-2 py-1.5 text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-medium">{o.supplier}</span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {o.items || o.job} · {o.plot.plotNumber ? `Plot ${o.plot.plotNumber}` : o.plot.name}
                              </span>
                            </div>
                            <div className="ml-2 flex shrink-0 items-center gap-1">
                              {isOrderPending(o.id) ? (
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                              ) : (
                                <>
                                  {o.supplierEmail && (
                                    <a
                                      href={`mailto:${o.supplierEmail}?subject=${encodeURIComponent(`Order — ${o.items || o.job}`)}`}
                                      onClick={() => handleOrderAction(o.id, "ORDERED")}
                                      className="inline-flex items-center gap-0.5 rounded border border-violet-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-violet-700 hover:bg-violet-50"
                                    >
                                      <Mail className="size-2.5" /> Send
                                    </a>
                                  )}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 gap-0.5 border-blue-200 px-1.5 text-[10px] text-blue-700 hover:bg-blue-50"
                                    onClick={() => handleOrderAction(o.id, "ORDERED")}
                                  >
                                    <Package className="size-2.5" /> Mark Sent
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sign-offs needed */}
                  {signOffsNeeded.length > 0 && (
                    <div>
                      <h5 className="mb-1 flex items-center gap-1 text-xs font-semibold text-amber-700">
                        <FileCheck className="size-3" />
                        Sign-offs Needed ({signOffsNeeded.length})
                      </h5>
                      <div className="space-y-1">
                        {signOffsNeeded.map((j) => (
                          <div
                            key={`so-${j.id}`}
                            className="flex items-center justify-between rounded border border-amber-100 bg-amber-50/30 px-2 py-1.5 text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <Link href={`/jobs/${j.id}`} className="font-medium text-blue-600 hover:underline">{j.name}</Link>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
                              </span>
                            </div>
                            <div className="ml-2 shrink-0">
                              {pendingActions.has(j.id) ? (
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                              ) : (
                                <Button
                                  size="sm"
                                  className="h-6 gap-0.5 bg-amber-600 px-2 text-[10px] text-white hover:bg-amber-700"
                                  onClick={() => handleJobAction(j.id, "signoff")}
                                >
                                  <FileCheck className="size-2.5" /> Sign Off
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Deliveries expected */}
                  {deliveriesExpected.length > 0 && (
                    <div>
                      <h5 className="mb-1 flex items-center gap-1 text-xs font-semibold text-purple-700">
                        <Truck className="size-3" />
                        Deliveries Expected ({deliveriesExpected.length})
                      </h5>
                      <div className="space-y-1">
                        {deliveriesExpected.map((d) => (
                          <div
                            key={`de-${d.id}`}
                            className="flex items-center justify-between rounded border border-purple-100 bg-purple-50/30 px-2 py-1.5 text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <span className="font-medium">{d.supplier}</span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {d.items || d.job} · {d.plot.plotNumber ? `Plot ${d.plot.plotNumber}` : d.plot.name}
                              </span>
                            </div>
                            <div className="ml-2 shrink-0">
                              {isOrderPending(d.id) ? (
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                              ) : (
                                <Button
                                  size="sm"
                                  className="h-6 gap-0.5 bg-purple-600 px-2 text-[10px] text-white hover:bg-purple-700"
                                  onClick={() => handleOrderAction(d.id, "DELIVERED")}
                                >
                                  <CheckCircle2 className="size-2.5" /> Mark Received
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Jobs starting (NOT_STARTED with start button) */}
                  {jobsStartingNotStarted.length > 0 && (
                    <div>
                      <h5 className="mb-1 flex items-center gap-1 text-xs font-semibold text-green-700">
                        <PlayCircle className="size-3" />
                        Jobs Starting ({jobsStartingNotStarted.length})
                      </h5>
                      <div className="space-y-1">
                        {jobsStartingNotStarted.map((j) => (
                          <div
                            key={`js-${j.id}`}
                            className="flex items-center justify-between rounded border border-green-100 bg-green-50/30 px-2 py-1.5 text-sm"
                          >
                            <div className="min-w-0 flex-1">
                              <Link href={`/jobs/${j.id}`} className="font-medium text-blue-600 hover:underline">{j.name}</Link>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
                              </span>
                            </div>
                            <div className="ml-2 shrink-0">
                              {pendingActions.has(j.id) ? (
                                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                              ) : (
                                <Button
                                  size="sm"
                                  className="h-6 gap-0.5 bg-green-600 px-2 text-[10px] text-white hover:bg-green-700"
                                  onClick={() => handleJobAction(j.id, "start")}
                                >
                                  <PlayCircle className="size-2.5" /> Start
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All jobs starting (full list, info only for already-started) */}
                  {selectedEvents!.jobsStarting.filter((j) => j.status !== "NOT_STARTED").length > 0 && (
                    <div>
                      <h5 className="mb-1 flex items-center gap-1 text-xs font-semibold text-green-700">
                        <Briefcase className="size-3" />
                        Jobs Starting — In Progress ({selectedEvents!.jobsStarting.filter((j) => j.status !== "NOT_STARTED").length})
                      </h5>
                      <div className="space-y-1">
                        {selectedEvents!.jobsStarting.filter((j) => j.status !== "NOT_STARTED").map((j) => (
                          <div
                            key={j.id}
                            className="flex items-center justify-between rounded border px-2 py-1.5 text-sm"
                          >
                            <div>
                              <Link href={`/jobs/${j.id}`} className="font-medium text-blue-600 hover:underline">{j.name}</Link>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
                              </span>
                            </div>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[j.status] || ""}`}>
                              {j.status.replace("_", " ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Jobs due (non-signoff ones) */}
                  {selectedEvents!.jobsEnding.filter((j) => !(j.status === "COMPLETED" && !j.signedOff)).length > 0 && (
                    <div>
                      <h5 className="mb-1 flex items-center gap-1 text-xs font-semibold text-orange-700">
                        <Briefcase className="size-3" />
                        Jobs Due ({selectedEvents!.jobsEnding.filter((j) => !(j.status === "COMPLETED" && !j.signedOff)).length})
                      </h5>
                      <div className="space-y-1">
                        {selectedEvents!.jobsEnding.filter((j) => !(j.status === "COMPLETED" && !j.signedOff)).map((j) => (
                          <div
                            key={j.id}
                            className="flex items-center justify-between rounded border px-2 py-1.5 text-sm"
                          >
                            <div>
                              <Link href={`/jobs/${j.id}`} className="font-medium text-blue-600 hover:underline">{j.name}</Link>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {j.plot.plotNumber ? `Plot ${j.plot.plotNumber}` : j.plot.name}
                                {j.assignee && ` · ${j.assignee}`}
                              </span>
                            </div>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[j.status] || ""}`}>
                              {j.status.replace("_", " ")}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Non-ORDERED deliveries (already delivered, etc) */}
                  {selectedEvents!.deliveries.filter((d) => d.status !== "ORDERED").length > 0 && (
                    <div>
                      <h5 className="mb-1 flex items-center gap-1 text-xs font-semibold text-purple-700">
                        <Package className="size-3" />
                        Other Deliveries ({selectedEvents!.deliveries.filter((d) => d.status !== "ORDERED").length})
                      </h5>
                      <div className="space-y-1">
                        {selectedEvents!.deliveries.filter((d) => d.status !== "ORDERED").map((d) => (
                          <div
                            key={d.id}
                            className="flex items-center justify-between rounded border px-2 py-1.5 text-sm"
                          >
                            <div>
                              <span className="font-medium">{d.supplier}</span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {d.items || d.job} · {d.plot.plotNumber ? `Plot ${d.plot.plotNumber}` : d.plot.name}
                              </span>
                            </div>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              d.status === "DELIVERED"
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-600"
                            }`}>
                              {d.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded bg-green-200" /> Job starts
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded bg-orange-200" /> Job due
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded bg-purple-200" /> Delivery
        </span>
        <span className="flex items-center gap-1">
          <CloudRain className="size-3 text-blue-400" /> Rained off
        </span>
      </div>
    </div>
  );
}

/**
 * (May 2026 audit #59 + #189) Subscribe-to-calendar button.
 * Asks the backend to mint a signed token-URL, then copies that to
 * the clipboard. The URL is self-authenticating — calendar apps
 * don't preserve cookies, so the token in the query string is what
 * keeps the feed accessible after the manager has logged out of
 * the browser session.
 */
function SubscribeButton({ siteId }: { siteId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "copied" | "error">(
    "idle",
  );

  const onClick = async () => {
    if (state === "loading") return;
    setState("loading");
    try {
      const res = await fetch(`/api/sites/${siteId}/calendar-token`, {
        method: "POST",
      });
      if (!res.ok) {
        setState("error");
        setTimeout(() => setState("idle"), 2000);
        return;
      }
      const { url } = await res.json();
      try {
        await navigator.clipboard.writeText(url);
        setState("copied");
        setTimeout(() => setState("idle"), 2000);
      } catch {
        // Clipboard API blocked — open in new tab so the user can
        // copy from the address bar.
        window.open(url, "_blank", "noopener,noreferrer");
        setState("idle");
      }
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 2000);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={state === "loading"}
      title="Copy iCal subscription URL"
      aria-label="Copy iCal subscription URL"
    >
      {state === "loading" ? (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <Mail className="size-4" aria-hidden="true" />
      )}
      {state === "copied"
        ? "URL copied!"
        : state === "error"
          ? "Failed"
          : state === "loading"
            ? "Generating…"
            : "Subscribe"}
    </Button>
  );
}
