"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  format,
  startOfWeek,
  addWeeks,
  addDays,
  differenceInWeeks,
  differenceInCalendarDays,
  isWithinInterval,
  eachDayOfInterval,
  isWeekend,
  isSameDay,
  getMonth,
  getYear,
} from "date-fns";
import { getCurrentDate } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import { Loader2, Columns3, ChevronRight, Download, FileText, Search, X, Camera, StickyNote, CalendarDays, Calendar, Layers, List, CheckSquare, Clock, ZoomIn, ZoomOut, Maximize2, Minimize2 } from "lucide-react";
import Link from "next/link";
import { getStageCode, getStageColor } from "@/lib/stage-codes";
import { Input } from "@/components/ui/input";
import { JobWeekPanel } from "@/components/programme/JobWeekPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------- Constants ----------

const CELL_WIDTH_WEEK = 40;
const CELL_WIDTH_DAY = 28;
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 40;
const HEADER_HEIGHT_DAY = 56; // two-row header for day view

const LEFT_PANEL_EXPANDED = 520;
// Collapsed: just Plot (52px)
const LEFT_PANEL_COLLAPSED = 52;

// ---------- Types ----------

interface ProgrammeOrder {
  id: string;
  dateOfOrder: string;
  expectedDeliveryDate: string | null;
  leadTimeDays: number | null;
  status: string;
  supplier: { name: string };
}

interface ProgrammeJob {
  id: string;
  name: string;
  status: string;
  stageCode: string | null;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
  weatherAffected?: boolean;
  parentId: string | null;
  parentStage: string | null;
  orders?: ProgrammeOrder[];
  _count?: { photos: number; actions: number };
  // For synthetic parent jobs: all calendar positions where dots should appear
  // (one per child with photos/notes — keeps Jobs and Sub-Jobs views consistent)
  _dotStartDates?: string[];
}

interface ProgrammePlot {
  id: string;
  name: string;
  plotNumber: string | null;
  houseType: string | null;
  reservationType: string | null;
  reservationDate: string | null;
  exchangeDate: string | null;
  legalDate: string | null;
  approvalG: boolean;
  approvalE: boolean;
  approvalW: boolean;
  approvalKCO: boolean;
  buildCompletePercent: number;
  jobs: ProgrammeJob[];
}

interface ProgrammeSite {
  id: string;
  name: string;
  postcode: string | null;
  rainedOffDays?: { date: string; note?: string | null }[];
  plots: ProgrammePlot[];
}

interface WeatherDay {
  date: string;
  category: string;
  tempMax: number;
  tempMin: number;
}

const WEATHER_ROW_HEIGHT = 22;

function weatherEmoji(category: string): string {
  switch (category) {
    case "clear": return "\u2600\uFE0F";
    case "partly_cloudy": return "\u26C5";
    case "cloudy": return "\u2601\uFE0F";
    case "fog": return "\uD83C\uDF2B\uFE0F";
    case "rain": return "\uD83C\uDF27\uFE0F";
    case "snow": return "\uD83C\uDF28\uFE0F";
    case "thunder": return "\u26C8\uFE0F";
    default: return "\u2601\uFE0F";
  }
}

// ---------- Helpers ----------

function getWeekKey(date: Date): string {
  const ws = startOfWeek(date, { weekStartsOn: 1 });
  return format(ws, "yyyy-MM-dd");
}

function shortDate(dateStr: string | null): string {
  if (!dateStr) return "\u2014";
  return format(new Date(dateStr), "dd/MM");
}

function ApprovalDot({ approved }: { approved: boolean }) {
  return (
    <div
      className={`size-3.5 rounded-sm text-center text-[8px] font-bold leading-[14px] ${
        approved
          ? "bg-green-500 text-white"
          : "border border-slate-300 bg-white text-transparent"
      }`}
    >
      {approved ? "\u2713" : ""}
    </div>
  );
}

// ---------- Export helpers ----------

function getJobStageForCell(
  jobs: ProgrammeJob[],
  cellDate: Date,
  cellEnd: Date
): { code: string; status: string } | null {
  for (const job of jobs) {
    if (!job.startDate || !job.endDate) continue;
    const jobStart = new Date(job.startDate);
    const jobEnd = new Date(job.endDate);
    if (jobStart < cellEnd && jobEnd >= cellDate) {
      return { code: getStageCode(job), status: job.status };
    }
  }
  return null;
}

function getActiveStageLabel(plot: ProgrammePlot): string {
  const activeJob = plot.jobs.find((j) => j.status === "IN_PROGRESS");
  if (activeJob) return getStageCode(activeJob);
  if (plot.jobs.length > 0) return getStageCode(plot.jobs[plot.jobs.length - 1]);
  return "\u2014";
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0, 0, 0];
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ];
}

/** Get the dominant status for a plot based on its jobs */
function getPlotStatus(plot: ProgrammePlot): string {
  if (plot.jobs.length === 0) return "NONE";
  if (plot.jobs.some((j) => j.status === "IN_PROGRESS")) return "IN_PROGRESS";
  if (plot.jobs.every((j) => j.status === "COMPLETED")) return "COMPLETED";
  if (plot.jobs.some((j) => j.status === "ON_HOLD")) return "ON_HOLD";
  return "NOT_STARTED";
}

// ---------- Component ----------

export function SiteProgramme({ siteId, postcode }: { siteId: string; postcode?: string | null }) {
  const { devDate } = useDevDate();
  const [site, setSite] = useState<ProgrammeSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // View mode state
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [jobView, setJobView] = useState<"jobs" | "subjobs">("jobs");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [houseTypeFilter, setHouseTypeFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Weather + rained-off state
  const [weatherData, setWeatherData] = useState<WeatherDay[]>([]);
  const [rainedOffDates, setRainedOffDates] = useState<Set<string>>(new Set());
  const [rainedOffNotes, setRainedOffNotes] = useState<Map<string, string>>(new Map());
  const [rainedOffPopover, setRainedOffPopover] = useState<{ date: string; x: number; y: number } | null>(null);
  const [rainedOffNoteInput, setRainedOffNoteInput] = useState("");
  const [rainedOffDelay, setRainedOffDelay] = useState(false);

  // Toast notification
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Schedule status per plot (traffic lights)
  const [scheduleStatuses, setScheduleStatuses] = useState<Record<string, { status: string; daysDeviation: number; awaitingRestart: boolean }>>({});

  useEffect(() => {
    fetch(`/api/sites/${siteId}/plot-schedules`)
      .then((r) => r.json())
      .then((arr: Array<{ plotId: string; status: string; daysDeviation: number; awaitingRestart: boolean }>) => {
        const map: Record<string, { status: string; daysDeviation: number; awaitingRestart: boolean }> = {};
        for (const item of arr) map[item.plotId] = item;
        setScheduleStatuses(map);
      })
      .catch(() => {});
  }, [siteId]);

  // Select mode state (bulk actions)
  const [selectMode, setSelectMode] = useState(false);
  const [selectedPlots, setSelectedPlots] = useState<Set<string>>(new Set());
  const [delayDialogOpen, setDelayDialogOpen] = useState(false);
  const [delayDays, setDelayDays] = useState(1);
  const [delayReason, setDelayReason] = useState("Delay");
  const [delayLoading, setDelayLoading] = useState(false);

  const togglePlotSelection = useCallback((plotId: string) => {
    setSelectedPlots((prev) => {
      const next = new Set(prev);
      if (next.has(plotId)) next.delete(plotId);
      else next.add(plotId);
      return next;
    });
  }, []);

  const selectAllPlots = useCallback(() => {
    if (!site) return;
    setSelectedPlots(new Set(site.plots.map((p) => p.id)));
  }, [site]);

  const clearSelection = useCallback(() => {
    setSelectedPlots(new Set());
    setSelectMode(false);
  }, []);

  const handleBulkDelay = useCallback(async () => {
    if (!site || selectedPlots.size === 0 || delayDays < 1) return;
    setDelayLoading(true);
    try {
      const res = await fetch(`/api/sites/${site.id}/bulk-delay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plotIds: [...selectedPlots],
          days: delayDays,
          reason: delayReason.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const result = await res.json();
      // Refresh programme data
      const freshData = await fetch(`/api/sites/${siteId}/programme`, { cache: "no-store" }).then((r) => r.json());
      setSite(freshData);
      setDelayDialogOpen(false);
      setSelectedPlots(new Set());
      setSelectMode(false);
      showToast(`Delayed ${result.updated} plot(s) by ${delayDays} day(s)${result.skipped ? ` (${result.skipped} skipped — no active job)` : ""}`);
    } catch {
      showToast("Failed to apply bulk delay", "error");
    } finally {
      setDelayLoading(false);
    }
  }, [site, siteId, selectedPlots, delayDays, delayReason]);

  // Job week panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelContext, setPanelContext] = useState<{
    job: ProgrammeJob;
    plotName: string;
    plotId: string;
    siteName: string;
    siteId: string;
    childJobIds?: string[];
  } | null>(null);

  const selectColWidth = selectMode ? 28 : 0;
  const leftPanelWidth = (expanded ? LEFT_PANEL_EXPANDED : LEFT_PANEL_COLLAPSED) + selectColWidth;

  const fetchProgramme = useCallback(() => {
    fetch(`/api/sites/${siteId}/programme`, { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        setSite(data);
        // Initialize rained-off dates and notes from site data
        if (data?.rainedOffDays) {
          setRainedOffDates(
            new Set(data.rainedOffDays.map((d: { date: string }) => d.date.slice(0, 10)))
          );
          const notes = new Map<string, string>();
          for (const d of data.rainedOffDays) {
            if (d.note) notes.set(d.date.slice(0, 10), d.note);
          }
          setRainedOffNotes(notes);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => {
    fetchProgramme();
  }, [fetchProgramme, devDate]);

  // Fetch weather when postcode is available
  // When dev date is active, offset the returned forecast dates to align
  // with the simulated timeline (Open-Meteo always returns real dates).
  useEffect(() => {
    if (!postcode) { setWeatherData([]); return; }
    fetch(`/api/weather?postcode=${encodeURIComponent(postcode)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.forecast) {
          const now = getCurrentDate();
          const realToday = new Date();
          const diffMs = now.getTime() - realToday.getTime();
          const diffDays = Math.round(diffMs / 86400000);
          if (diffDays !== 0) {
            // Shift forecast dates to match the simulated dev date
            const shifted = data.forecast.map((day: WeatherDay) => {
              const d = new Date(day.date + "T00:00:00");
              d.setDate(d.getDate() + diffDays);
              return { ...day, date: d.toISOString().split("T")[0] };
            });
            setWeatherData(shifted);
          } else {
            setWeatherData(data.forecast);
          }
        }
      })
      .catch(() => {}); // silently fail — weather is non-critical
  }, [postcode, devDate]);

  // Weather lookup by date string
  const weatherMap = useMemo(() => {
    const map = new Map<string, WeatherDay>();
    for (const day of weatherData) {
      map.set(day.date, day);
    }
    return map;
  }, [weatherData]);

  const hasWeather = weatherData.length > 0 && viewMode === "day";

  // Open the rained-off popover for a date
  const openRainedOffPopover = useCallback(
    (dateStr: string, e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setRainedOffPopover({ date: dateStr, x: rect.left, y: rect.bottom + 4 });
      setRainedOffNoteInput(rainedOffNotes.get(dateStr) ?? "Rain day");
      setRainedOffDelay(false);
    },
    [rainedOffNotes]
  );

  // Confirm marking a date as rained off (with note + optional delay)
  const confirmRainedOff = useCallback(
    async () => {
      if (!rainedOffPopover) return;
      const dateStr = rainedOffPopover.date;
      const note = rainedOffNoteInput.trim();

      // Optimistic update
      setRainedOffDates((prev) => new Set(prev).add(dateStr));
      setRainedOffNotes((prev) => {
        const next = new Map(prev);
        if (note) next.set(dateStr, note);
        return next;
      });
      setRainedOffPopover(null);

      try {
        const res = await fetch(`/api/sites/${siteId}/rained-off`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: dateStr,
            note: note || null,
            delayJobs: rainedOffDelay,
          }),
        });
        const result = await res.json();

        // Refresh programme data to reflect any date changes
        if (rainedOffDelay || result.affectedJobs > 0) {
          const freshData = await fetch(`/api/sites/${siteId}/programme`, { cache: "no-store" }).then((r) => r.json());
          setSite(freshData);
          if (freshData?.rainedOffDays) {
            setRainedOffDates(
              new Set(freshData.rainedOffDays.map((d: { date: string }) => d.date.slice(0, 10)))
            );
            const notes = new Map<string, string>();
            for (const d of freshData.rainedOffDays) {
              if (d.note) notes.set(d.date.slice(0, 10), d.note);
            }
            setRainedOffNotes(notes);
          }
        }

        // Show feedback
        if (result.affectedJobs > 0) {
          showToast(
            rainedOffDelay
              ? `Rained off — ${result.delayed} job(s) delayed by 1 day`
              : `Rained off — ${result.affectedJobs} job(s) noted`
          );
        } else {
          showToast("Marked as rained off");
        }
      } catch {
        // Revert on error
        setRainedOffDates((prev) => {
          const next = new Set(prev);
          next.delete(dateStr);
          return next;
        });
        showToast("Failed to mark rained off", "error");
      }
    },
    [siteId, rainedOffPopover, rainedOffNoteInput, rainedOffDelay, showToast]
  );

  // Remove a rained-off date
  const removeRainedOff = useCallback(
    async () => {
      if (!rainedOffPopover) return;
      const dateStr = rainedOffPopover.date;

      // Optimistic update
      setRainedOffDates((prev) => {
        const next = new Set(prev);
        next.delete(dateStr);
        return next;
      });
      setRainedOffNotes((prev) => {
        const next = new Map(prev);
        next.delete(dateStr);
        return next;
      });
      setRainedOffPopover(null);

      try {
        await fetch(`/api/sites/${siteId}/rained-off`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateStr }),
        });
      } catch {
        // Revert on error
        setRainedOffDates((prev) => new Set(prev).add(dateStr));
      }
    },
    [siteId, rainedOffPopover]
  );

  // Derive unique filter options from data
  const filterOptions = useMemo(() => {
    if (!site) return { houseTypes: [], stageCodes: [] };

    const houseTypes = [...new Set(
      site.plots
        .map((p) => p.houseType)
        .filter((h): h is string => !!h)
    )].sort();

    const stageCodes = [...new Set(
      site.plots.map((p) => getActiveStageLabel(p))
    )].filter((s) => s !== "\u2014").sort();

    return { houseTypes, stageCodes };
  }, [site]);

  // Apply filters
  const filteredPlots = useMemo(() => {
    if (!site) return [];

    return site.plots.filter((plot) => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesPlot =
          (plot.plotNumber || "").toLowerCase().includes(term) ||
          plot.name.toLowerCase().includes(term);
        if (!matchesPlot) return false;
      }

      // House type filter
      if (houseTypeFilter !== "all" && plot.houseType !== houseTypeFilter) {
        return false;
      }

      // Stage filter
      if (stageFilter !== "all") {
        const activeStage = getActiveStageLabel(plot);
        if (activeStage !== stageFilter) return false;
      }

      // Status filter
      if (statusFilter !== "all") {
        const plotStatus = getPlotStatus(plot);
        if (plotStatus !== statusFilter) return false;
      }

      return true;
    });
  }, [site, searchTerm, houseTypeFilter, stageFilter, statusFilter]);

  const hasFilters = searchTerm || houseTypeFilter !== "all" || stageFilter !== "all" || statusFilter !== "all";

  // Derived constants
  const cellWidth = (viewMode === "week" ? CELL_WIDTH_WEEK : CELL_WIDTH_DAY) * zoomLevel;
  const baseHeaderHeight = viewMode === "day" ? HEADER_HEIGHT_DAY : HEADER_HEIGHT;
  const headerHeight = baseHeaderHeight + (hasWeather ? WEATHER_ROW_HEIGHT : 0);

  // Filter jobs by job/subjob toggle
  const processedPlots = useMemo(() => {
    return filteredPlots.map((plot) => {
      if (jobView === "subjobs") {
        return { ...plot, jobs: plot.jobs.filter((j) => !!j.parentStage) };
      }

      // "jobs" view: show top-level jobs (no parentStage) as-is,
      // and aggregate sub-jobs by parentStage into synthetic parent rows
      const topLevel = plot.jobs.filter((j) => !j.parentStage);
      const grouped = new Map<string, ProgrammeJob[]>();
      for (const j of plot.jobs) {
        if (!j.parentStage) continue;
        const arr = grouped.get(j.parentStage) || [];
        arr.push(j);
        grouped.set(j.parentStage, arr);
      }

      const synthetic: ProgrammeJob[] = [];
      for (const [stage, children] of grouped) {
        const starts = children
          .map((c) => c.startDate)
          .filter(Boolean) as string[];
        const ends = children
          .map((c) => c.endDate)
          .filter(Boolean) as string[];
        if (!starts.length || !ends.length) continue;

        const minStart = starts.reduce((a, b) => (a < b ? a : b));
        const maxEnd = ends.reduce((a, b) => (a > b ? a : b));

        // Determine aggregate status
        const statuses = children.map((c) => c.status);
        let aggStatus = "NOT_STARTED";
        if (statuses.every((s) => s === "COMPLETED")) aggStatus = "COMPLETED";
        else if (statuses.some((s) => s === "IN_PROGRESS" || s === "COMPLETED"))
          aggStatus = "IN_PROGRESS";
        else if (statuses.some((s) => s === "ON_HOLD")) aggStatus = "ON_HOLD";

        // Use first child's stageCode or derive from stage name
        const firstChild = children.sort(
          (a, b) => a.sortOrder - b.sortOrder
        )[0];

        const childOrders = children.flatMap((c) => c.orders ?? []);
        const aggPhotos = children.reduce((sum, c) => sum + (c._count?.photos ?? 0), 0);
        const aggActions = children.reduce((sum, c) => sum + (c._count?.actions ?? 0), 0);

        // Collect the startDate of every child that has photos or notes — this
        // pins dots to their exact calendar weeks in both Jobs and Sub-Jobs views.
        const childrenWithDots = children.filter(
          (c) => (c._count?.photos ?? 0) > 0 || (c._count?.actions ?? 0) > 0
        );
        const dotStartDates = childrenWithDots
          .map((c) => c.startDate)
          .filter(Boolean) as string[];

        synthetic.push({
          id: `synth-${plot.id}-${stage}`,
          name: stage,
          status: aggStatus,
          stageCode: firstChild?.stageCode || null,
          startDate: minStart,
          endDate: maxEnd,
          sortOrder: firstChild?.sortOrder ?? 0,
          parentId: null,
          parentStage: null,
          orders: childOrders,
          _count: { photos: aggPhotos, actions: aggActions },
          _dotStartDates: dotStartDates,
        });
      }

      const allJobs = [...topLevel, ...synthetic].sort(
        (a, b) => a.sortOrder - b.sortOrder
      );
      return { ...plot, jobs: allJobs };
    });
  }, [filteredPlots, jobView]);

  // Keep panelContext in sync when programme data refreshes (e.g. after order status change)
  const panelJobId = panelContext?.job.id;
  useEffect(() => {
    if (!panelOpen || !panelJobId) return;
    for (const plot of processedPlots) {
      const freshJob = plot.jobs.find((j) => j.id === panelJobId);
      if (freshJob) {
        setPanelContext((prev) =>
          prev ? { ...prev, job: freshJob } : prev
        );
        break;
      }
    }
  }, [processedPlots, panelOpen, panelJobId]);

  // Check if any jobs have sub-jobs (parentStage)
  const hasSubJobs = useMemo(() => {
    if (!site) return false;
    return site.plots.some((p) => p.jobs.some((j) => !!j.parentStage));
  }, [site]);

  // Calculate columns (weeks or days)
  interface TimelineColumn {
    date: Date;
    endDate: Date; // exclusive end
    label: string;
    key: string;
    isWeekendDay?: boolean;
  }

  interface MonthSpan {
    label: string;
    colCount: number;
  }

  const { columns, todayIndex, monthSpans } = useMemo(() => {
    if (!site) return { columns: [] as TimelineColumn[], todayIndex: -1, monthSpans: [] as MonthSpan[] };

    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const plot of site.plots) {
      for (const job of plot.jobs) {
        if (job.startDate) {
          const d = new Date(job.startDate);
          if (!minDate || d < minDate) minDate = d;
        }
        if (job.endDate) {
          const d = new Date(job.endDate);
          if (!maxDate || d > maxDate) maxDate = d;
        }
      }
    }

    if (!minDate || !maxDate) return { columns: [] as TimelineColumn[], todayIndex: -1, monthSpans: [] as MonthSpan[] };

    const now = getCurrentDate();

    if (viewMode === "week") {
      const start = addWeeks(startOfWeek(minDate, { weekStartsOn: 1 }), -2);
      const end = addWeeks(startOfWeek(maxDate, { weekStartsOn: 1 }), 3);
      const totalWeeks = differenceInWeeks(end, start);

      const cols: TimelineColumn[] = [];
      for (let i = 0; i < totalWeeks; i++) {
        const d = addWeeks(start, i);
        const next = addWeeks(d, 1);
        cols.push({
          date: d,
          endDate: next,
          label: format(d, "dd/MM"),
          key: getWeekKey(d),
        });
      }

      const todayIdx = cols.findIndex((w, i) => {
        const nextDate = i < cols.length - 1 ? cols[i + 1].date : addWeeks(w.date, 1);
        return isWithinInterval(now, { start: w.date, end: nextDate });
      });

      return { columns: cols, todayIndex: todayIdx, monthSpans: [] as MonthSpan[] };
    } else {
      // Day mode
      const start = addDays(minDate, -7);
      const end = addDays(maxDate, 7);
      const days = eachDayOfInterval({ start, end });

      const cols: TimelineColumn[] = days.map((d) => ({
        date: d,
        endDate: addDays(d, 1),
        label: format(d, "d"),
        key: format(d, "yyyy-MM-dd"),
        isWeekendDay: isWeekend(d),
      }));

      const todayIdx = cols.findIndex((c) => isSameDay(c.date, now));

      // Build month spans for top header
      const spans: MonthSpan[] = [];
      let currentMonth = -1;
      let currentYear = -1;
      for (const col of cols) {
        const m = getMonth(col.date);
        const y = getYear(col.date);
        if (m === currentMonth && y === currentYear) {
          spans[spans.length - 1].colCount++;
        } else {
          spans.push({ label: format(col.date, "MMM yy"), colCount: 1 });
          currentMonth = m;
          currentYear = y;
        }
      }

      return { columns: cols, todayIndex: todayIdx, monthSpans: spans };
    }
  }, [site, viewMode, devDate]);

  // Auto-scroll to today
  useEffect(() => {
    if (todayIndex >= 0 && scrollRef.current) {
      const scrollLeft = todayIndex * cellWidth - 200;
      scrollRef.current.scrollLeft = Math.max(0, scrollLeft);
    }
  }, [todayIndex, cellWidth]);

  // ---------- Export: Excel ----------
  const handleExportExcel = useCallback(async () => {
    if (!site) return;
    const XLSX = await import("xlsx");

    const plotsToExport = processedPlots;

    const headers = [
      "Plot #",
      "Type",
      "House",
      "RES",
      "EXC",
      "LEG",
      "G",
      "E",
      "W",
      "KCO",
      "Stage",
      "Build %",
      ...columns.map((c) => c.label),
    ];

    const rows = plotsToExport.map((plot) => {
      const stageLabel = getActiveStageLabel(plot);
      const baseRow: (string | number)[] = [
        plot.plotNumber || plot.name,
        plot.reservationType || "",
        plot.houseType || "",
        shortDate(plot.reservationDate),
        shortDate(plot.exchangeDate),
        shortDate(plot.legalDate),
        plot.approvalG ? "Y" : "",
        plot.approvalE ? "Y" : "",
        plot.approvalW ? "Y" : "",
        plot.approvalKCO ? "Y" : "",
        stageLabel,
        Math.round(plot.buildCompletePercent),
      ];

      for (const col of columns) {
        const result = getJobStageForCell(plot.jobs, col.date, col.endDate);
        baseRow.push(result ? result.code : "");
      }

      return baseRow;
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map((_, i) => ({ wch: i < 12 ? 10 : (viewMode === "day" ? 3 : 6) }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Programme");
    XLSX.writeFile(wb, `${site.name.replace(/\s+/g, "_")}_programme.xlsx`);
  }, [site, processedPlots, columns, viewMode]);

  // ---------- Export: PDF ----------
  const handleExportPDF = useCallback(async () => {
    if (!site) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const plotsToExport = processedPlots;

    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });

    // Title
    doc.setFontSize(14);
    doc.text(`${site.name} — Programme`, 14, 15);
    doc.setFontSize(8);
    doc.setTextColor(120);
    const filterLabel = hasFilters
      ? ` | Filtered: ${plotsToExport.length} of ${site.plots.length} plots`
      : "";
    doc.text(`Generated ${format(new Date(), "dd/MM/yyyy HH:mm")}${filterLabel}`, 14, 21);
    doc.setTextColor(0);

    // Columns — no "Site" column (already in title)
    const leftCols = ["Plot", "Type", "House", "RES", "EXC", "LEG", "G", "E", "W", "K", "Stage", "%"];
    const colLabels = columns.map((c) => c.label);
    const allCols = [...leftCols, ...colLabels];
    const leftColCount = leftCols.length;

    // Build rows
    const rows = plotsToExport.map((plot) => {
      const stageLabel = getActiveStageLabel(plot);
      const leftData: string[] = [
        plot.plotNumber || plot.name,
        plot.reservationType?.slice(0, 5) || "",
        plot.houseType || "",
        shortDate(plot.reservationDate),
        shortDate(plot.exchangeDate),
        shortDate(plot.legalDate),
        plot.approvalG ? "\u2713" : "",
        plot.approvalE ? "\u2713" : "",
        plot.approvalW ? "\u2713" : "",
        plot.approvalKCO ? "\u2713" : "",
        stageLabel,
        String(Math.round(plot.buildCompletePercent)),
      ];

      const colData = columns.map((col) => {
        const result = getJobStageForCell(plot.jobs, col.date, col.endDate);
        return result ? result.code : "";
      });

      return [...leftData, ...colData];
    });

    // Pre-compute cell colours for timeline columns
    const cellStyleMap: Record<string, { fillColor: [number, number, number]; textColor: [number, number, number] }> = {};
    plotsToExport.forEach((plot, plotIdx) => {
      columns.forEach((col, colIdx) => {
        const result = getJobStageForCell(plot.jobs, col.date, col.endDate);
        if (result) {
          const colors = getStageColor(result.status);
          cellStyleMap[`${plotIdx}-${leftColCount + colIdx}`] = {
            fillColor: hexToRgb(colors.bg),
            textColor: hexToRgb(colors.text),
          };
        }
      });
    });

    // Column widths matching on-screen proportions
    const leftColWidths: Record<number, number> = {
      0: 11,  // Plot
      1: 10,  // Type
      2: 18,  // House
      3: 11,  // RES
      4: 11,  // EXC
      5: 11,  // LEG
      6: 5,   // G
      7: 5,   // E
      8: 5,   // W
      9: 5,   // K
      10: 10, // Stage
      11: 7,  // %
    };

    const timelineColWidth = viewMode === "day" ? 3 : 6;

    autoTable(doc, {
      startY: 25,
      head: [allCols],
      body: rows,
      styles: {
        fontSize: viewMode === "day" ? 4 : 5.5,
        cellPadding: { top: 1, right: 0.8, bottom: 1, left: 0.8 },
        lineWidth: 0.1,
        lineColor: [226, 232, 240], // slate-200
      },
      headStyles: {
        fillColor: [248, 250, 252], // slate-50
        textColor: [71, 85, 105],   // slate-500
        fontSize: viewMode === "day" ? 3.5 : 5,
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: Object.fromEntries(
        allCols.map((_, i) => [
          i,
          {
            cellWidth: i < leftColCount ? leftColWidths[i] : timelineColWidth,
            halign: (i >= leftColCount || (i >= 6 && i <= 9) || i === 11 ? "center" : "left") as "center" | "left",
            fontSize: i >= leftColCount ? (viewMode === "day" ? 3 : 5) : 5.5,
          },
        ])
      ),
      alternateRowStyles: {
        fillColor: [248, 250, 252], // slate-50 for alternating rows
      },
      didParseCell: (data: any) => {
        if (data.section === "body") {
          const key = `${data.row.index}-${data.column.index}`;
          const style = cellStyleMap[key];
          if (style) {
            data.cell.styles.fillColor = style.fillColor;
            data.cell.styles.textColor = style.textColor;
            data.cell.styles.fontStyle = "bold";
          }

          // Highlight today's column
          const colIdx = data.column.index;
          if (colIdx === leftColCount + todayIndex && !style) {
            data.cell.styles.fillColor = [239, 246, 255]; // blue-50 tint
          }
        }

        // Today's column header highlight
        if (data.section === "head") {
          const colIdx = data.column.index;
          if (colIdx === leftColCount + todayIndex) {
            data.cell.styles.fillColor = [219, 234, 254]; // blue-100
            data.cell.styles.textColor = [29, 78, 216];   // blue-700
          }
        }
      },
    });

    // Legend at the bottom
    const finalY = (doc as any).lastAutoTable?.finalY || 200;
    const legendY = finalY + 5;
    const legendItems = [
      { label: "Not Started", color: "#e2e8f0" },
      { label: "In Progress", color: "#dbeafe" },
      { label: "On Hold", color: "#fef3c7" },
      { label: "Completed", color: "#dcfce7" },
    ];
    let legendX = 14;
    doc.setFontSize(5);
    legendItems.forEach(({ label, color }) => {
      const rgb = hexToRgb(color);
      doc.setFillColor(rgb[0], rgb[1], rgb[2]);
      doc.rect(legendX, legendY, 3, 3, "F");
      doc.setTextColor(100);
      doc.text(label, legendX + 4, legendY + 2.5);
      legendX += 25;
    });

    doc.save(`${site.name.replace(/\s+/g, "_")}_programme.pdf`);
  }, [site, processedPlots, columns, hasFilters, todayIndex, viewMode]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!site || site.plots.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No plots found. Add plots to see the programme view.
      </p>
    );
  }

  const totalHeight = processedPlots.length * ROW_HEIGHT;
  const timelineWidth = columns.length * cellWidth;

  return (
    <div className={isFullscreen ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-white" : "rounded-lg border bg-white"}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground"
          title={expanded ? "Collapse details" : "Expand details"}
        >
          {expanded ? (
            <>
              <Columns3 className="size-3.5" />
              Collapse
            </>
          ) : (
            <>
              <ChevronRight className="size-3.5" />
              Expand
            </>
          )}
        </button>

        {/* Day/Week toggle */}
        <div className="flex overflow-hidden rounded-md border">
          <button
            onClick={() => setViewMode("week")}
            className={`flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
              viewMode === "week"
                ? "bg-slate-900 text-white"
                : "text-muted-foreground hover:bg-slate-50"
            }`}
          >
            <CalendarDays className="size-3" />
            Week
          </button>
          <button
            onClick={() => setViewMode("day")}
            className={`flex items-center gap-1 border-l px-2 py-1.5 text-[11px] font-medium transition-colors ${
              viewMode === "day"
                ? "bg-slate-900 text-white"
                : "text-muted-foreground hover:bg-slate-50"
            }`}
          >
            <Calendar className="size-3" />
            Day
          </button>
        </div>

        {/* Jobs/Sub-Jobs toggle */}
        <div className="flex overflow-hidden rounded-md border">
          <button
            onClick={() => setJobView("jobs")}
            className={`flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium transition-colors ${
              jobView === "jobs"
                ? "bg-slate-900 text-white"
                : "text-muted-foreground hover:bg-slate-50"
            }`}
          >
            <Layers className="size-3" />
            Jobs
          </button>
          <button
            onClick={() => hasSubJobs && setJobView("subjobs")}
            disabled={!hasSubJobs}
            title={!hasSubJobs ? "No sub-jobs in this programme — use hierarchical templates to enable" : undefined}
            className={`flex items-center gap-1 border-l px-2 py-1.5 text-[11px] font-medium transition-colors ${
              jobView === "subjobs"
                ? "bg-slate-900 text-white"
                : !hasSubJobs
                  ? "cursor-not-allowed text-muted-foreground/40"
                  : "text-muted-foreground hover:bg-slate-50"
            }`}
          >
            <List className="size-3" />
            Sub-Jobs
          </button>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center overflow-hidden rounded-md border">
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))))}
            disabled={zoomLevel <= 0.5}
            className="flex items-center px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="Zoom out"
          >
            <ZoomOut className="size-3" />
          </button>
          <span className="border-x px-1.5 text-[11px] text-muted-foreground">{Math.round(zoomLevel * 100)}%</span>
          <button
            onClick={() => setZoomLevel((z) => Math.min(3, parseFloat((z + 0.25).toFixed(2))))}
            disabled={zoomLevel >= 3}
            className="flex items-center px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="Zoom in"
          >
            <ZoomIn className="size-3" />
          </button>
        </div>

        {/* Fullscreen toggle */}
        <button
          onClick={() => setIsFullscreen((f) => !f)}
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        </button>

        {/* Select mode toggle */}
        <button
          onClick={() => {
            if (selectMode) { clearSelection(); } else { setSelectMode(true); }
          }}
          className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            selectMode
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "text-muted-foreground hover:bg-slate-50 hover:text-foreground"
          }`}
          title="Select plots for bulk actions"
        >
          <CheckSquare className="size-3.5" />
          Select
        </button>

        {/* Select all / clear when in select mode */}
        {selectMode && (
          <div className="flex items-center gap-2 text-[11px]">
            <button
              onClick={selectAllPlots}
              className="font-medium text-blue-600 hover:text-blue-800"
            >
              All
            </button>
            <span className="text-muted-foreground">|</span>
            <button
              onClick={() => setSelectedPlots(new Set())}
              className="font-medium text-blue-600 hover:text-blue-800"
            >
              None
            </button>
            {selectedPlots.size > 0 && (
              <span className="text-muted-foreground">
                {selectedPlots.size} selected
              </span>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search plots..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-7 w-36 pl-7 text-xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* House Type Filter */}
        {filterOptions.houseTypes.length > 1 && (
          <Select value={houseTypeFilter} onValueChange={(v) => v !== null && setHouseTypeFilter(v)}>
            <SelectTrigger size="sm" className="h-7 text-xs">
              <SelectValue placeholder="House Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {filterOptions.houseTypes.map((ht) => (
                <SelectItem key={ht} value={ht}>
                  {ht}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Stage Filter */}
        {filterOptions.stageCodes.length > 1 && (
          <Select value={stageFilter} onValueChange={(v) => v !== null && setStageFilter(v)}>
            <SelectTrigger size="sm" className="h-7 text-xs">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {filterOptions.stageCodes.map((sc) => (
                <SelectItem key={sc} value={sc}>
                  {sc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Status Filter */}
        <Select value={statusFilter} onValueChange={(v) => v !== null && setStatusFilter(v)}>
          <SelectTrigger size="sm" className="h-7 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="COMPLETED">Completed</SelectItem>
            <SelectItem value="ON_HOLD">On Hold</SelectItem>
            <SelectItem value="NOT_STARTED">Not Started</SelectItem>
          </SelectContent>
        </Select>

        {/* Filter count + clear */}
        {hasFilters && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              {filteredPlots.length} of {site.plots.length} plots
            </span>
            <button
              onClick={() => {
                setSearchTerm("");
                setHouseTypeFilter("all");
                setStageFilter("all");
                setStatusFilter("all");
              }}
              className="text-[11px] font-medium text-blue-600 hover:text-blue-800"
            >
              Clear
            </button>
          </div>
        )}

        {/* Export buttons — pushed to the right */}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground"
          >
            <Download className="size-3.5" />
            Excel
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground"
          >
            <FileText className="size-3.5" />
            PDF
          </button>
        </div>
      </div>

      {processedPlots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="size-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">No plots match your filters</p>
          <button
            onClick={() => {
              setSearchTerm("");
              setHouseTypeFilter("all");
              setStageFilter("all");
              setStatusFilter("all");
            }}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className={isFullscreen ? "flex-1 overflow-x-auto overflow-y-auto" : "overflow-x-auto"} ref={scrollRef}>
          <div
            className="flex"
            style={{ minWidth: leftPanelWidth + timelineWidth }}
          >
            {/* ═══════ LEFT PANEL ═══════ */}
            <div
              className="sticky left-0 z-20 shrink-0 border-r bg-white transition-all duration-200"
              style={{ width: leftPanelWidth }}
            >
              {/* Header row */}
              <div
                className="flex items-end border-b bg-slate-50 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
                style={{ height: headerHeight }}
              >
                {selectMode && <div className="w-[28px] px-1 pb-1" />}
                <div className="w-[52px] px-1.5 pb-1">Plot</div>
                {expanded && (
                  <>
                    <div className="w-[48px] px-1 pb-1">Site</div>
                    <div className="w-[48px] px-1 pb-1">Type</div>
                    <div className="w-[68px] px-1 pb-1">House</div>
                    <div className="w-[44px] px-1 pb-1">RES</div>
                    <div className="w-[44px] px-1 pb-1">EXC</div>
                    <div className="w-[44px] px-1 pb-1">LEG</div>
                    <div className="flex w-[72px] items-center justify-center gap-0.5 px-1 pb-1">
                      <span>G</span>
                      <span>E</span>
                      <span>W</span>
                      <span>K</span>
                    </div>
                    <div className="w-[44px] px-1 pb-1">Stage</div>
                    <div className="w-[36px] px-1 pb-1 text-right">%</div>
                  </>
                )}
              </div>

              {/* Plot rows */}
              {processedPlots.map((plot, index) => {
                const stageLabel = getActiveStageLabel(plot);

                return (
                  <div
                    key={plot.id}
                    className={`flex items-center border-b text-[10px] ${
                      selectMode && selectedPlots.has(plot.id)
                        ? "bg-blue-50"
                        : index % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    }`}
                    style={{ height: ROW_HEIGHT }}
                  >
                    {selectMode && (
                      <div className="flex w-[28px] items-center justify-center px-1">
                        <input
                          type="checkbox"
                          checked={selectedPlots.has(plot.id)}
                          onChange={() => togglePlotSelection(plot.id)}
                          className="size-3.5 cursor-pointer rounded border-slate-300 text-blue-600 accent-blue-600"
                        />
                      </div>
                    )}
                    <div className="w-[52px] flex items-center gap-1 truncate px-1.5 font-semibold">
                      {scheduleStatuses[plot.id] && (() => {
                        const s = scheduleStatuses[plot.id];
                        if (s.awaitingRestart) return <span className="size-2 shrink-0 rounded-full bg-amber-400" title="Awaiting restart" />;
                        if (s.status === "ahead") return <span className="size-2 shrink-0 rounded-full bg-emerald-500" title={`${s.daysDeviation}d ahead`} />;
                        if (s.status === "behind") return <span className="size-2 shrink-0 rounded-full bg-red-500" title={`${Math.abs(s.daysDeviation)}d behind`} />;
                        if (s.status === "on_track") return <span className="size-2 shrink-0 rounded-full bg-blue-400" title="On programme" />;
                        return null;
                      })()}
                      <Link
                        href={`/sites/${site.id}/plots/${plot.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline truncate"
                      >
                        {plot.plotNumber || plot.name}
                      </Link>
                    </div>
                    {expanded && (
                      <>
                        <div className="w-[48px] truncate px-1 text-muted-foreground">
                          {site.name.slice(0, 6)}
                        </div>
                        <div className="w-[48px] truncate px-1 text-muted-foreground">
                          {plot.reservationType?.slice(0, 4) || "\u2014"}
                        </div>
                        <div className="w-[68px] truncate px-1 text-muted-foreground">
                          {plot.houseType || "\u2014"}
                        </div>
                        <div className="w-[44px] px-1 text-muted-foreground">
                          {shortDate(plot.reservationDate)}
                        </div>
                        <div className="w-[44px] px-1 text-muted-foreground">
                          {shortDate(plot.exchangeDate)}
                        </div>
                        <div className="w-[44px] px-1 text-muted-foreground">
                          {shortDate(plot.legalDate)}
                        </div>
                        <div className="flex w-[72px] items-center justify-center gap-1 px-1">
                          <ApprovalDot approved={plot.approvalG} />
                          <ApprovalDot approved={plot.approvalE} />
                          <ApprovalDot approved={plot.approvalW} />
                          <ApprovalDot approved={plot.approvalKCO} />
                        </div>
                        <div className="w-[44px] px-1 font-medium">
                          {stageLabel}
                        </div>
                        <div className="w-[36px] px-1 text-right font-medium">
                          {Math.round(plot.buildCompletePercent)}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ═══════ RIGHT PANEL — TIMELINE ═══════ */}
            <div className="relative flex-1">
              {/* Column headers */}
              <div className="border-b bg-slate-50" style={{ height: headerHeight }}>
                {/* Weather icon row (day view only) */}
                {hasWeather && (
                  <div className="flex border-b" style={{ height: WEATHER_ROW_HEIGHT }}>
                    {columns.map((col) => {
                      const colDate = format(col.date, "yyyy-MM-dd");
                      const weather = weatherMap.get(colDate);
                      const isRainedOff = rainedOffDates.has(colDate);
                      return (
                        <div
                          key={`weather-${col.key}`}
                          className={`flex shrink-0 items-center justify-center border-r cursor-pointer transition-colors ${
                            isRainedOff
                              ? "bg-orange-200 ring-1 ring-inset ring-orange-400"
                              : "hover:bg-slate-100"
                          }`}
                          style={{ width: cellWidth }}
                          title={
                            weather
                              ? `${weather.category} ${weather.tempMax}°/${weather.tempMin}°${isRainedOff ? ` (RAINED OFF${rainedOffNotes.get(colDate) ? `: ${rainedOffNotes.get(colDate)}` : ""})` : " — click to mark rained off"}`
                              : isRainedOff
                                ? `RAINED OFF${rainedOffNotes.get(colDate) ? `: ${rainedOffNotes.get(colDate)}` : ""} — click to edit`
                                : undefined
                          }
                          onClick={(e) => openRainedOffPopover(colDate, e)}
                        >
                          {isRainedOff ? (
                            <span className="text-[11px]">☔</span>
                          ) : weather ? (
                            <span className="text-[11px]">
                              {weatherEmoji(weather.category)}
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Day mode: month header row */}
                {viewMode === "day" && monthSpans.length > 0 && (
                  <div className="flex" style={{ height: 20 }}>
                    {monthSpans.map((span, i) => (
                      <div
                        key={`month-${i}`}
                        className="flex shrink-0 items-center justify-center border-b border-r text-[8px] font-semibold text-muted-foreground"
                        style={{ width: span.colCount * cellWidth }}
                      >
                        {span.label}
                      </div>
                    ))}
                  </div>
                )}

                {/* Day/week column labels */}
                <div className="flex" style={{ height: viewMode === "day" ? baseHeaderHeight - 20 : baseHeaderHeight }}>
                  {columns.map((col, i) => (
                    <div
                      key={col.key}
                      className={`flex shrink-0 flex-col items-center justify-end border-r pb-1 ${
                        viewMode === "day" ? "text-[7px]" : "text-[9px]"
                      } ${
                        i === todayIndex
                          ? "bg-blue-100 font-bold text-blue-700"
                          : col.isWeekendDay
                            ? "bg-slate-100/60 text-muted-foreground/60"
                            : "text-muted-foreground"
                      }`}
                      style={{ width: cellWidth }}
                    >
                      <span>{col.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grid + Stage code cells */}
              <div className="relative" style={{ height: totalHeight }}>
                {/* Today line */}
                {todayIndex >= 0 && (
                  <div
                    className="absolute top-0 z-10 w-0.5 bg-red-500"
                    style={{
                      left: todayIndex * cellWidth + cellWidth / 2,
                      height: totalHeight,
                    }}
                  />
                )}

                {/* Row backgrounds + stage code cells */}
                {processedPlots.map((plot, plotIndex) => (
                  <div
                    key={plot.id}
                    className={`absolute left-0 right-0 border-b ${
                      plotIndex % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                    }`}
                    style={{
                      top: plotIndex * ROW_HEIGHT,
                      height: ROW_HEIGHT,
                    }}
                  >
                    {plot.jobs.map((job) => {
                      if (!job.startDate || !job.endDate) return null;

                      const jobStart = new Date(job.startDate);
                      const jobEnd = new Date(job.endDate);
                      const code = getStageCode(job);
                      const colors = getStageColor(job.status);
                      const hasPhotos = (job._count?.photos ?? 0) > 0;
                      const hasNotes = (job._count?.actions ?? 0) > 0;

                      // Check which columns have order/delivery dates
                      const orders = job.orders ?? [];

                      // Find the first column index where job bar starts
                      const jobFirstColIdx = columns.findIndex(
                        (c) => jobStart < c.endDate && jobEnd >= c.date
                      );

                      return columns.map((col, colIdx) => {
                        const overlaps = jobStart < col.endDate && jobEnd >= col.date;
                        if (!overlaps) return null;

                        const isFirstJobCell = colIdx === jobFirstColIdx;

                        // Dots: for synthetic parents check each child's dot date;
                        // for individual jobs use the job's own first column.
                        // Use string comparison (YYYY-MM-DD) to avoid UTC vs local timezone
                        // mismatch that can shift dots by one week.
                        const colDateStr = format(col.date, "yyyy-MM-dd");
                        const colEndStr = format(col.endDate, "yyyy-MM-dd");
                        const isDotCol = job._dotStartDates
                          ? job._dotStartDates.some((d) => {
                              const ds = d.slice(0, 10);
                              return ds >= colDateStr && ds < colEndStr;
                            })
                          : isFirstJobCell;

                        // Check if any order dates fall in this cell
                        // If order date is before job starts, show on first job cell
                        const hasOrderInCell = orders.some((o) => {
                          const d = new Date(o.dateOfOrder);
                          if (d < jobStart && isFirstJobCell) return true;
                          return d >= col.date && d < col.endDate;
                        });
                        const hasDeliveryInCell = orders.some((o) => {
                          if (!o.expectedDeliveryDate) return false;
                          const d = new Date(o.expectedDeliveryDate);
                          if (d < jobStart && isFirstJobCell) return true;
                          return d >= col.date && d < col.endDate;
                        });

                        return (
                          <div
                            key={`${job.id}-${col.key}`}
                            className="absolute flex cursor-pointer items-center justify-center"
                            style={{
                              left: colIdx * cellWidth,
                              top: 0,
                              width: cellWidth,
                              height: ROW_HEIGHT,
                            }}
                            title={`${job.name} (${job.status}) — Click for details`}
                            onClick={() => {
                              // For synthetic parents, find child job IDs from original site data
                              let childJobIds: string[] | undefined;
                              if (job.id.startsWith("synth-")) {
                                const origPlot = site.plots.find((p) => p.id === plot.id);
                                if (origPlot) {
                                  childJobIds = origPlot.jobs
                                    .filter((j) => j.parentStage === job.name)
                                    .map((j) => j.id);
                                }
                              }
                              setPanelContext({
                                job,
                                plotName: plot.plotNumber ? `Plot ${plot.plotNumber}` : plot.name,
                                plotId: plot.id,
                                siteName: site.name,
                                siteId: site.id,
                                childJobIds,
                              });
                              setPanelOpen(true);
                            }}
                          >
                            <div
                              className={`relative flex items-center justify-center rounded font-bold transition-all hover:brightness-90 hover:shadow-sm ${
                                viewMode === "day" ? "text-[7px]" : "text-[8px]"
                              } ${
                                job.weatherAffected && viewMode === "day" && rainedOffDates.has(format(col.date, "yyyy-MM-dd"))
                                  ? "ring-2 ring-red-500 ring-inset"
                                  : ""
                              }`}
                              style={{
                                width: cellWidth - 2,
                                height: ROW_HEIGHT - 6,
                                backgroundColor: job.weatherAffected && viewMode === "day" && rainedOffDates.has(format(col.date, "yyyy-MM-dd"))
                                  ? "#fecaca"
                                  : colors.bg,
                                color: job.weatherAffected && viewMode === "day" && rainedOffDates.has(format(col.date, "yyyy-MM-dd"))
                                  ? "#991b1b"
                                  : colors.text,
                              }}
                            >
                              {job.weatherAffected && viewMode === "day" && rainedOffDates.has(format(col.date, "yyyy-MM-dd")) ? "☔" : code}
                              {/* Photo/note indicators (week view only — too small for day).
                                  isDotCol is true for every column where a child job (or this
                                  job itself) has photos/notes, keeping dots identical between
                                  Jobs and Sub-Jobs views. */}
                              {isDotCol && viewMode === "week" && (hasPhotos || hasNotes) && (
                                <div className="absolute -right-0.5 -top-0.5 flex gap-px">
                                  {hasPhotos && (
                                    <div className="size-[6px] rounded-full bg-blue-500" title="Has photos" />
                                  )}
                                  {hasNotes && (
                                    <div className="size-[6px] rounded-full bg-amber-500" title="Has notes" />
                                  )}
                                </div>
                              )}
                              {/* Order/delivery indicators */}
                              {(hasOrderInCell || hasDeliveryInCell) && (
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex gap-px p-1 cursor-pointer" onClick={(e) => { e.stopPropagation(); window.location.href = "/orders"; }} title="Click to view orders">
                                  {hasOrderInCell && (
                                    <div className="size-[5px] rounded-full bg-purple-500" />
                                  )}
                                  {hasDeliveryInCell && (
                                    <div className="size-[5px] rounded-full bg-teal-500" />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      });
                    })}
                  </div>
                ))}

                {/* Weekend background stripes (day view) */}
                {viewMode === "day" &&
                  columns.map(
                    (col, i) =>
                      col.isWeekendDay && (
                        <div
                          key={`wknd-${col.key}`}
                          className="pointer-events-none absolute top-0 bg-slate-50/40"
                          style={{
                            left: i * cellWidth,
                            width: cellWidth,
                            height: totalHeight,
                          }}
                        />
                      )
                  )}

                {/* Rained-off day column highlights (day view) */}
                {viewMode === "day" &&
                  columns.map(
                    (col, i) => {
                      const colDate = format(col.date, "yyyy-MM-dd");
                      return rainedOffDates.has(colDate) ? (
                        <div
                          key={`rained-${col.key}`}
                          className="pointer-events-none absolute top-0 bg-orange-100/50"
                          style={{
                            left: i * cellWidth,
                            width: cellWidth,
                            height: totalHeight,
                          }}
                        />
                      ) : null;
                    }
                  )}

                {/* Vertical gridlines */}
                {columns.map((col, i) => (
                  <div
                    key={`grid-${col.key}`}
                    className="absolute top-0 border-r border-slate-100"
                    style={{
                      left: i * cellWidth,
                      height: totalHeight,
                      width: 1,
                    }}
                  />
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 border-t px-3 py-2">
                {Object.entries({
                  NOT_STARTED: "Not Started",
                  IN_PROGRESS: "In Progress",
                  ON_HOLD: "On Hold",
                  COMPLETED: "Completed",
                }).map(([status, label]) => {
                  const colors = getStageColor(status);
                  return (
                    <div key={status} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <div
                        className="size-3 rounded"
                        style={{ backgroundColor: colors.bg }}
                      />
                      {label}
                    </div>
                  );
                })}
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="h-4 w-0.5 bg-red-500" />
                  Today
                </div>
                <div className="ml-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="size-[6px] rounded-full bg-blue-500" />
                  Photos
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="size-[6px] rounded-full bg-amber-500" />
                  Notes
                </div>
                <div className="ml-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="size-[5px] rounded-full bg-purple-500" />
                  Order
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div className="size-[5px] rounded-full bg-teal-500" />
                  Delivery
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating action bar for bulk select */}
      {selectMode && selectedPlots.size > 0 && (
        <div className="sticky bottom-0 z-30 flex items-center justify-between border-t bg-blue-50 px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare className="size-4 text-blue-600" />
            <span className="font-medium text-blue-900">
              {selectedPlots.size} plot{selectedPlots.size > 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDelayDays(1);
                setDelayReason("Delay");
                setDelayDialogOpen(true);
              }}
              className="flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-600"
            >
              <Clock className="size-3.5" />
              Delay Jobs
            </button>
            <button
              onClick={clearSelection}
              className="rounded-md border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delay dialog */}
      {delayDialogOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => !delayLoading && setDelayDialogOpen(false)}
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-96 -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-white p-5 shadow-xl">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Clock className="size-4 text-amber-500" />
              Delay Selected Plots
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              This will delay the current active job on {selectedPlots.size} plot{selectedPlots.size > 1 ? "s" : ""} and cascade to all downstream jobs.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Days to delay</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={delayDays}
                  onChange={(e) => setDelayDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Reason (optional)</label>
                <input
                  type="text"
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                  placeholder="e.g. Weather delay, material shortage..."
                  className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDelayDialogOpen(false)}
                disabled={delayLoading}
                className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelay}
                disabled={delayLoading}
                className="flex items-center gap-1.5 rounded-md bg-amber-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {delayLoading ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Applying...
                  </>
                ) : (
                  <>
                    Delay {selectedPlots.size} plot{selectedPlots.size > 1 ? "s" : ""} by {delayDays} day{delayDays > 1 ? "s" : ""}
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Rained-off popover */}
      {rainedOffPopover && (
        <>
          {/* Backdrop to close */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setRainedOffPopover(null)}
          />
          <div
            className="fixed z-50 w-64 rounded-lg border bg-white p-3 shadow-lg"
            style={{ left: rainedOffPopover.x, top: rainedOffPopover.y }}
          >
            <p className="mb-2 text-xs font-semibold text-slate-700">
              ☔ {format(new Date(rainedOffPopover.date), "EEE dd MMM yyyy")}
            </p>
            <input
              type="text"
              placeholder="Add a note (optional)..."
              value={rainedOffNoteInput}
              onChange={(e) => setRainedOffNoteInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmRainedOff(); }}
              className="mb-2 w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
            <label className="mb-2 flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={rainedOffDelay}
                onChange={(e) => setRainedOffDelay(e.target.checked)}
                className="size-3 rounded border-slate-300 accent-orange-500"
              />
              <span className="text-[11px] text-slate-600">Delay affected jobs by 1 day</span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={confirmRainedOff}
                className="flex-1 rounded bg-orange-500 px-2 py-1 text-xs font-medium text-white hover:bg-orange-600"
              >
                {rainedOffDates.has(rainedOffPopover.date) ? "Update" : "Mark Rained Off"}
              </button>
              {rainedOffDates.has(rainedOffPopover.date) && (
                <button
                  onClick={removeRainedOff}
                  className="rounded border px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        </>
      )}

      <JobWeekPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        context={panelContext}
        onOrderUpdated={fetchProgramme}
        onJobUpdated={fetchProgramme}
      />

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-[60] flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg transition-all ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "success" ? "✓" : "✕"} {toast.message}
        </div>
      )}
    </div>
  );
}
