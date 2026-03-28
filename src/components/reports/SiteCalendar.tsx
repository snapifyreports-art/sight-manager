"use client";

import { useState, useEffect, useMemo } from "react";
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
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  job: string;
  plot: { plotNumber: string | null; name: string };
}

interface CalendarData {
  month: string;
  jobs: CalendarJob[];
  deliveries: CalendarDelivery[];
  rainedOffDays: Array<{ date: string; note: string | null }>;
}

interface DayEvents {
  jobsStarting: CalendarJob[];
  jobsEnding: CalendarJob[];
  deliveries: CalendarDelivery[];
  isRainedOff: boolean;
  rainNote: string | null;
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
          isRainedOff: false,
          rainNote: null,
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

    for (const rain of data.rainedOffDays) {
      const key = rain.date.slice(0, 10);
      const entry = getOrCreate(key);
      entry.isRainedOff = true;
      entry.rainNote = rain.note;
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

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h3 className="text-lg font-semibold">
            {format(currentMonth, "MMMM yyyy")}
          </h3>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
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
                  events?.isRainedOff ? "bg-blue-50/30" : ""
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
                  {events?.isRainedOff && (
                    <CloudRain className="size-3 text-blue-400" />
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
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-blue-600">
                  <CloudRain className="size-3" />
                  Rained Off
                  {selectedEvents.rainNote && ` — ${selectedEvents.rainNote}`}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {(!selectedEvents ||
              (selectedEvents.jobsStarting.length === 0 &&
                selectedEvents.jobsEnding.length === 0 &&
                selectedEvents.deliveries.length === 0)) ? (
              <p className="text-sm text-muted-foreground">
                No events scheduled
              </p>
            ) : (
              <div className="space-y-3">
                {selectedEvents.jobsStarting.length > 0 && (
                  <div>
                    <h5 className="mb-1 flex items-center gap-1 text-xs font-semibold text-green-700">
                      <Briefcase className="size-3" />
                      Jobs Starting ({selectedEvents.jobsStarting.length})
                    </h5>
                    <div className="space-y-1">
                      {selectedEvents.jobsStarting.map((j) => (
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

                {selectedEvents.jobsEnding.length > 0 && (
                  <div>
                    <h5 className="mb-1 flex items-center gap-1 text-xs font-semibold text-orange-700">
                      <Briefcase className="size-3" />
                      Jobs Due ({selectedEvents.jobsEnding.length})
                    </h5>
                    <div className="space-y-1">
                      {selectedEvents.jobsEnding.map((j) => (
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

                {selectedEvents.deliveries.length > 0 && (
                  <div>
                    <h5 className="mb-1 flex items-center gap-1 text-xs font-semibold text-purple-700">
                      <Package className="size-3" />
                      Deliveries ({selectedEvents.deliveries.length})
                    </h5>
                    <div className="space-y-1">
                      {selectedEvents.deliveries.map((d) => (
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
                              : d.status === "CONFIRMED"
                                ? "bg-blue-100 text-blue-700"
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
            )}
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
