"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useJobAction } from "@/hooks/useJobAction";
import {
  format,
  startOfWeek,
  addWeeks,
  addDays,
  differenceInWeeks,
  differenceInCalendarDays,
  eachDayOfInterval,
  isWeekend,
  isSameDay,
  getMonth,
  getYear,
} from "date-fns";
import { getCurrentDate, getCurrentDateAtMidnight } from "@/lib/dev-date";
import { useDevDate } from "@/lib/dev-date-context";
import { differenceInWorkingDays } from "@/lib/working-days";
import { Loader2, Columns3, ChevronRight, Download, FileText, Search, X, Camera, StickyNote, CalendarDays, Calendar, Layers, List, CheckSquare, Check, Clock, ZoomIn, ZoomOut, Maximize2, Minimize2, Play } from "lucide-react";
import Link from "next/link";
import { getStageCode, getStageColor } from "@/lib/stage-codes";
import { getCurrentStage } from "@/lib/plot-stage";
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

// (May 2026 sprint 7b) Type definitions extracted to
// `./programme-modules/types.ts`.
import type {
  ProgrammeJob,
  ProgrammePlot,
  ProgrammeSite,
  WeatherDay,
} from "./programme-modules/types";

// (May 2026 sprint 7b) WEATHER_ROW_HEIGHT + weatherEmoji extracted
// to `./programme-modules/`. See helpers.ts.
import { WEATHER_ROW_HEIGHT } from "./programme-modules/types";
import { weatherEmoji } from "./programme-modules/helpers";

// (May 2026 sprint 7b) Helpers + ApprovalDot extracted to
// `./programme-modules/`. See helpers.ts + ApprovalDot.tsx.
import { getWeekKey, shortDate } from "./programme-modules/helpers";
import { ApprovalDot } from "./programme-modules/ApprovalDot";

// (May 2026 sprint 7b) Export helpers extracted to
// `./programme-modules/helpers.ts`.
import {
  getJobStageForCell,
  getActiveStageLabel,
  hexToRgb,
  getPlotStatus,
} from "./programme-modules/helpers";



// ---------- Component ----------

export function SiteProgramme({ siteId, postcode }: { siteId: string; postcode?: string | null }) {
  const { devDate } = useDevDate();
  const [site, setSite] = useState<ProgrammeSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Centralised job start hook for bulk actions
  const { triggerAction: triggerBulkStart, dialogs: bulkStartDialogs } = useJobAction(
    async () => {
      // Refresh programme data after bulk action
      const freshData = await fetch(`/api/sites/${siteId}/programme`, { cache: "no-store" }).then((r) => r.json());
      setSite(freshData);
    }
  );

  // View mode state
  const [viewMode, setViewMode] = useState<"week" | "day">("week");
  const [jobView, setJobView] = useState<"jobs" | "subjobs">("jobs");
  const [ganttMode, setGanttMode] = useState<"original" | "current" | "overlay">("current");
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [houseTypeFilter, setHouseTypeFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Weather + impact-day state
  // weatherImpactMap: date string → array of impact types logged for that date
  const [weatherData, setWeatherData] = useState<WeatherDay[]>([]);
  const [weatherImpactMap, setWeatherImpactMap] = useState<Map<string, Array<"RAIN" | "TEMPERATURE">>>(new Map());
  const [weatherImpactNotes, setWeatherImpactNotes] = useState<Map<string, string>>(new Map());
  const [rainedOffPopover, setRainedOffPopover] = useState<{ date: string; x: number; y: number } | null>(null);
  const [rainedOffNoteInput, setRainedOffNoteInput] = useState("");
  const [rainedOffType, setRainedOffType] = useState<"RAIN" | "TEMPERATURE">("RAIN");
  // Legacy alias used in visual rendering
  const rainedOffDates = useMemo(
    () => new Set(weatherImpactMap.keys()),
    [weatherImpactMap]
  );

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
  const [delayReason, setDelayReason] = useState("");
  const [delayReasonType, setDelayReasonType] = useState<"WEATHER_RAIN" | "WEATHER_TEMPERATURE" | "OTHER">("OTHER");
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
          delayReasonType,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      const result = await res.json();
      const freshData = await fetch(`/api/sites/${siteId}/programme`, { cache: "no-store" }).then((r) => r.json());
      setSite(freshData);
      setScrollTrigger((n) => n + 1);
      setDelayDialogOpen(false);
      setSelectedPlots(new Set());
      setSelectMode(false);
      showToast(`Delayed ${result.updated} plot(s) by ${delayDays} day(s)${result.skipped ? ` (${result.skipped} skipped — no active job)` : ""}`);
    } catch {
      showToast("Failed to apply bulk delay", "error");
    } finally {
      setDelayLoading(false);
    }
  }, [site, siteId, selectedPlots, delayDays, delayReason, delayReasonType, showToast]);

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
        setScrollTrigger((n) => n + 1);
        if (data?.rainedOffDays) {
          const impactMap = new Map<string, Array<"RAIN" | "TEMPERATURE">>();
          const notesMap = new Map<string, string>();
          for (const d of data.rainedOffDays) {
            const key = d.date.slice(0, 10);
            const existing = impactMap.get(key) ?? [];
            if (!existing.includes(d.type)) existing.push(d.type);
            impactMap.set(key, existing);
            if (d.note) notesMap.set(key, d.note);
          }
          setWeatherImpactMap(impactMap);
          setWeatherImpactNotes(notesMap);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => {
    fetchProgramme();
  }, [fetchProgramme, devDate]);
  useRefreshOnFocus(fetchProgramme);

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

  // Open the weather impact popover for a date
  const openRainedOffPopover = useCallback(
    (dateStr: string, e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setRainedOffPopover({ date: dateStr, x: rect.left, y: rect.bottom + 4 });
      setRainedOffNoteInput(weatherImpactNotes.get(dateStr) ?? "");
      // Default type: rain unless only temperature is already logged for this date
      const existing = weatherImpactMap.get(dateStr) ?? [];
      setRainedOffType(existing.includes("TEMPERATURE") && !existing.includes("RAIN") ? "TEMPERATURE" : "RAIN");
    },
    [weatherImpactNotes, weatherImpactMap]
  );

  // Confirm logging a weather impact day
  const confirmRainedOff = useCallback(
    async () => {
      if (!rainedOffPopover) return;
      const dateStr = rainedOffPopover.date;
      const note = rainedOffNoteInput.trim();

      // Optimistic update
      setWeatherImpactMap((prev) => {
        const next = new Map(prev);
        const existing = next.get(dateStr) ?? [];
        if (!existing.includes(rainedOffType)) existing.push(rainedOffType);
        next.set(dateStr, existing);
        return next;
      });
      if (note) {
        setWeatherImpactNotes((prev) => new Map(prev).set(dateStr, note));
      }
      setRainedOffPopover(null);

      try {
        const res = await fetch(`/api/sites/${siteId}/rained-off`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateStr, note: note || null, type: rainedOffType }),
        });
        const result = await res.json();
        const icon = rainedOffType === "TEMPERATURE" ? "🌡️" : "☔";
        const label = rainedOffType === "TEMPERATURE" ? "Temperature impact" : "Rain day";
        if (result.affectedJobs > 0) {
          showToast(`${icon} ${label} logged — ${result.affectedJobs} job(s) noted`);
        } else {
          showToast(`${icon} ${label} logged`);
        }
      } catch {
        // Revert on error
        setWeatherImpactMap((prev) => {
          const next = new Map(prev);
          const existing = (next.get(dateStr) ?? []).filter((t) => t !== rainedOffType);
          if (existing.length) next.set(dateStr, existing);
          else next.delete(dateStr);
          return next;
        });
        showToast("Failed to log weather impact", "error");
      }
    },
    [siteId, rainedOffPopover, rainedOffNoteInput, rainedOffType, showToast]
  );

  // Remove a specific weather impact type for a date
  const removeRainedOff = useCallback(
    async () => {
      if (!rainedOffPopover) return;
      const dateStr = rainedOffPopover.date;
      const typeToRemove = rainedOffType;

      // Optimistic update — remove just this type
      setWeatherImpactMap((prev) => {
        const next = new Map(prev);
        const remaining = (next.get(dateStr) ?? []).filter((t) => t !== typeToRemove);
        if (remaining.length) next.set(dateStr, remaining);
        else next.delete(dateStr);
        return next;
      });
      setRainedOffPopover(null);

      try {
        await fetch(`/api/sites/${siteId}/rained-off`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateStr, type: typeToRemove }),
        });
      } catch {
        // Revert on error
        setWeatherImpactMap((prev) => {
          const next = new Map(prev);
          const existing = next.get(dateStr) ?? [];
          if (!existing.includes(typeToRemove)) existing.push(typeToRemove);
          next.set(dateStr, existing);
          return next;
        });
      }
    },
    [siteId, rainedOffPopover, rainedOffType]
  );

  // (May 2026 audit SM-P1) Close the weather-impact popover on Escape.
  // Pre-fix the popover caught click-outside on the backdrop but
  // nothing handled Escape — keyboard-only users were trapped after
  // tabbing into the popover. Backdrop click + Escape now both close.
  useEffect(() => {
    if (!rainedOffPopover) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setRainedOffPopover(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rainedOffPopover]);

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

  // Apply filters + chronological sort.
  // Plots are ordered by their EARLIEST job's startDate (i.e. when
  // building begins) so the programme reads top-to-bottom in build
  // sequence. Plot number is a tie-break for plots that start the
  // same day. Without this the row order followed DB insertion which
  // could be arbitrary if plots were created out of sequence.
  const filteredPlots = useMemo(() => {
    if (!site) return [];

    const matched = site.plots.filter((plot) => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesPlot =
          (plot.plotNumber || "").toLowerCase().includes(term) ||
          plot.name.toLowerCase().includes(term);
        if (!matchesPlot) return false;
      }

      if (houseTypeFilter !== "all" && plot.houseType !== houseTypeFilter) {
        return false;
      }

      if (stageFilter !== "all") {
        const activeStage = getActiveStageLabel(plot);
        if (activeStage !== stageFilter) return false;
      }

      if (statusFilter !== "all") {
        const plotStatus = getPlotStatus(plot);
        if (plotStatus !== statusFilter) return false;
      }

      return true;
    });

    function plotEarliestJobMs(p: typeof matched[number]): number {
      let earliest = Infinity;
      for (const j of p.jobs) {
        if (!j.startDate) continue;
        const t = new Date(j.startDate).getTime();
        if (t < earliest) earliest = t;
      }
      return earliest;
    }

    return [...matched].sort((a, b) => {
      const at = plotEarliestJobMs(a);
      const bt = plotEarliestJobMs(b);
      // Plots with no scheduled jobs sink to the bottom rather than
      // floating above the dated ones (Infinity comparison handles this).
      if (at !== bt) return at - bt;
      const an = a.plotNumber ?? a.name;
      const bn = b.plotNumber ?? b.name;
      return an.localeCompare(bn, undefined, {
        numeric: true,
        sensitivity: "base",
      });
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
        // Use actualStartDate (if set) for the start — this reflects early starts
        const starts = children
          .map((c) => c.startDate)
          .filter(Boolean) as string[];
        const actualStarts = children
          .map((c) => c.actualStartDate)
          .filter(Boolean) as string[];
        const actualEnds = children
          .map((c) => c.actualEndDate)
          .filter(Boolean) as string[];
        const ends = children
          .map((c) => c.endDate)
          .filter(Boolean) as string[];
        if (!starts.length || !ends.length) continue;

        const minStart = starts.reduce((a, b) => (a < b ? a : b));
        const minActualStart = actualStarts.length
          ? actualStarts.reduce((a, b) => (a < b ? a : b))
          : null;
        const maxActualEnd = actualEnds.length
          ? actualEnds.reduce((a, b) => (a > b ? a : b))
          : null;
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

        // Aggregate original dates for overlay mode
        const origStarts = children
          .map((c) => c.originalStartDate)
          .filter(Boolean) as string[];
        const origEnds = children
          .map((c) => c.originalEndDate)
          .filter(Boolean) as string[];
        const minOrigStart = origStarts.length
          ? origStarts.reduce((a, b) => (a < b ? a : b))
          : null;
        const maxOrigEnd = origEnds.length
          ? origEnds.reduce((a, b) => (a > b ? a : b))
          : null;

        synthetic.push({
          id: `synth-${plot.id}-${stage}`,
          name: stage,
          status: aggStatus,
          stageCode: firstChild?.stageCode || null,
          startDate: minStart,
          endDate: maxEnd,
          originalStartDate: minOrigStart,
          originalEndDate: maxOrigEnd,
          actualStartDate: minActualStart,
          actualEndDate: maxActualEnd,
          sortOrder: firstChild?.sortOrder ?? 0,
          parentId: null,
          parentStage: null,
          orders: childOrders,
          _count: { photos: aggPhotos, actions: aggActions },
          _dotStartDates: dotStartDates,
        });
      }

      // Remove top-level parents that have been replaced by synthetic aggregates
      // (e.g. real "Groundworks" parent replaced by synthetic "GW" from children)
      const syntheticStages = new Set(grouped.keys());
      const filteredTopLevel = topLevel.filter(
        (j) => !j.stageCode || !syntheticStages.has(j.stageCode)
      );

      const allJobs = [...filteredTopLevel, ...synthetic].sort(
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
    dayName?: string; // e.g. "Mon", "Tue" — day view only
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

    // Midnight-snapped so SSR and hydration agree on "today".
    const now = getCurrentDateAtMidnight();

    // Ensure today is always within the visible range
    if (now < minDate) minDate = now;
    if (now > maxDate) maxDate = now;

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

      // `isWithinInterval` is inclusive on BOTH ends, which means when `now`
      // is exactly a Monday midnight it matches BOTH the previous week (whose
      // end is that Monday) AND the current week (whose start is that Monday).
      // findIndex picks the first match = wrong week. Use half-open interval
      // [start, end) instead so Monday morning sits in the new week's column.
      const todayIdx = cols.findIndex((w, i) => {
        const nextDate = i < cols.length - 1 ? cols[i + 1].date : addWeeks(w.date, 1);
        return now.getTime() >= w.date.getTime() && now.getTime() < nextDate.getTime();
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
        dayName: format(d, "EEE"), // Mon, Tue, Wed...
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
    // devDate is intentionally a dep: getCurrentDate() reads it from cookies,
    // so the memo must re-run when the user changes Dev Mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, viewMode, devDate]);

  // (May 2026 audit SM-P1) Auto-scroll-to-today now ONLY fires on the
  // first mount per siteId. Pre-fix every fetch (focus regain, action
  // complete, bulk-delay) bumped scrollTrigger which re-yanked the
  // user back to today — even if they'd scrolled to week 22 to inspect
  // the future. Now: a ref tracks "have we scrolled for this siteId
  // yet"; manual scroll position is preserved across refreshes.
  // The setScrollTrigger calls in handleBulkDelay / fetchProgramme are
  // kept so future explicit "Today" buttons can still re-engage the
  // effect; today's call sites no longer move the viewport once the
  // initial position is set.
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const lastScrolledSiteIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (todayIndex < 0 || !scrollRef.current) return;
    if (lastScrolledSiteIdRef.current === siteId) return;
    lastScrolledSiteIdRef.current = siteId;
    scrollRef.current.scrollLeft = Math.max(0, todayIndex * cellWidth);
    // scrollTrigger intentionally referenced to silence the lint
    // warning without changing scroll behaviour on bumps.
    void scrollTrigger;
  }, [siteId, todayIndex, cellWidth, scrollTrigger]);

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
    const { loadJsPdf } = await import("@/lib/pdf-builder");
    const { jsPDF, autoTable } = await loadJsPdf();

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
      // jspdf-autotable's CellHookData has tight styling types; we only read a
      // few fields, so we cast styles through to set colours without fighting
      // the declared union. eslint disabled locally for this single cast.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 200;
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

  // Overlay mode doubles row height: top half shows Current plan, bottom half
  // shows Original plan greyed out. Keith's feedback (Apr 2026): the old
  // 4px ghost strip at the bottom of a cell was illegible — you could see
  // "something shifted" but not what/from where. Two full-height labelled
  // rows make the before/after comparison obvious.
  const effectiveRowHeight = ganttMode === "overlay" ? ROW_HEIGHT * 2 : ROW_HEIGHT;
  const totalHeight = processedPlots.length * effectiveRowHeight;
  const timelineWidth = columns.length * cellWidth;

  return (
    <>
      {/* (#181) Desktop Gantt renders at every viewport — Keith picked
          the literal-same-format option over a mobile-specific card
          list. The toolbar wraps, the timeline scrolls horizontally on
          touch, the left columns stay readable down to ~375px. The
          MobileProgramme / MobileProgrammeGantt fallbacks have been
          removed; if mobile becomes painful again the answer is to
          improve THIS view, not fork it. */}
      <div className={`${isFullscreen ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-white" : "rounded-lg border bg-white"}`}>
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

        {/* Zoom controls — (May 2026 audit UX-P2) aria-labels on
            icon-only buttons; `title` alone isn't reliably announced
            by screen readers across browsers. */}
        <div className="flex items-center overflow-hidden rounded-md border">
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))))}
            disabled={zoomLevel <= 0.5}
            className="flex items-center px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="size-3" aria-hidden />
          </button>
          <span className="border-x px-1.5 text-[11px] text-muted-foreground" aria-live="polite">{Math.round(zoomLevel * 100)}%</span>
          <button
            onClick={() => setZoomLevel((z) => Math.min(3, parseFloat((z + 0.25).toFixed(2))))}
            disabled={zoomLevel >= 3}
            className="flex items-center px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="size-3" aria-hidden />
          </button>
        </div>

        {/* Gantt mode toggle: Current / Overlay.
            (May 2026 Keith bug report) Dropped "Original" — on a
            fresh site originalStartDate === startDate, so the
            Original mode rendered identically to Current and looked
            broken. Overlay shows BOTH bars (current above, original
            below) so a manager can SEE the shift visually whenever
            one exists. Original-as-its-own-view is implicit in
            Overlay: if a job hasn't shifted, the overlay rows align;
            if it has, the offset reveals the original underneath. */}
        <div className="flex items-center rounded-md border overflow-hidden">
          {(["current", "overlay"] as const).map((mode, i) => (
            <button
              key={mode}
              onClick={() => setGanttMode(mode)}
              className={`px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                ganttMode === mode
                  ? "bg-slate-700 text-white"
                  : "text-muted-foreground hover:bg-slate-50 hover:text-foreground"
              } ${i > 0 ? "border-l" : ""}`}
              title={
                mode === "current"
                  ? "Current schedule with actual dates for completed work"
                  : "Overlay: current schedule on top, original planned schedule below"
              }
            >
              {mode === "current" ? "Current" : "Overlay"}
            </button>
          ))}
        </div>

        {/* Fullscreen toggle. (May 2026 audit UX-P1) aria-pressed so
            screen readers convey the toggle state. */}
        <button
          onClick={() => setIsFullscreen((f) => !f)}
          aria-pressed={isFullscreen}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-slate-50 hover:text-foreground"
          title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="size-3.5" aria-hidden /> : <Maximize2 className="size-3.5" aria-hidden />}
        </button>

        {/* Select mode toggle */}
        <button
          onClick={() => {
            if (selectMode) { clearSelection(); } else { setSelectMode(true); }
          }}
          aria-pressed={selectMode}
          className={`flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            selectMode
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "text-muted-foreground hover:bg-slate-50 hover:text-foreground"
          }`}
          title="Select plots for bulk actions"
        >
          <CheckSquare className="size-3.5" aria-hidden />
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
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          {/* (May 2026 a11y audit #19) Visually-hidden label so screen
              readers announce the input role; type="search" for native
              clear affordance. */}
          <label htmlFor="programme-search" className="sr-only">Search plots</label>
          <Input
            id="programme-search"
            type="search"
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
                    style={{ height: effectiveRowHeight }}
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
                    <div className="w-[52px] flex flex-col items-start justify-center gap-0.5 truncate px-1.5 font-semibold">
                      <div className="flex items-center gap-1">
                        {scheduleStatuses[plot.id] && (() => {
                          const s = scheduleStatuses[plot.id];
                          if (s.awaitingRestart) return <span className="size-2 shrink-0 rounded-full bg-amber-400" title="Deferred" />;
                          if (s.status === "ahead") return <span className="size-2 shrink-0 rounded-full bg-emerald-500" title={`${s.daysDeviation}d ahead`} />;
                          if (s.status === "behind") return <span className="size-2 shrink-0 rounded-full bg-red-500" title={`${Math.abs(s.daysDeviation)}d behind`} />;
                          if (s.status === "on_track") return <span className="size-2 shrink-0 rounded-full bg-blue-400" title="On programme" />;
                          if (s.status === "idle") return <span className="size-2 shrink-0 rounded-full bg-orange-400" title="Idle — waiting for next stage" />;
                          return null;
                        })()}
                        <Link
                          href={`/sites/${site.id}/plots/${plot.id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline truncate"
                        >
                          {plot.plotNumber || plot.name}
                        </Link>
                      </div>
                      {/* Overlay mode: mini labels identifying which sub-row is
                          Current vs Original. Sits in the plot-metadata column
                          so it never overlaps the timeline bars. */}
                      {ganttMode === "overlay" && (
                        <div className="flex flex-col text-[7px] font-medium text-slate-400 leading-[9px]">
                          <span>now</span>
                          <span>was</span>
                        </div>
                      )}
                    </div>
                    {expanded && (
                      <>
                        <div className="w-[48px] truncate px-1 text-muted-foreground">
                          {site.name.slice(0, 6)}
                        </div>
                        <div className="w-[48px] truncate px-1 text-muted-foreground">
                          {plot.reservationType?.slice(0, 4) || "\u2014"}
                        </div>
                        {/* House column shows: top = manual houseType
                            (e.g. "2 STOREY"), bottom = source variant
                            name (or template name if no variant chosen
                            at apply time). Tooltip carries the full
                            "Template / Variant" string for when the
                            cell truncates. Keith May 2026: "I thought
                            that the variants and the plot template
                            that this was build from would be
                            referenced in this section of each plot?" */}
                        <div
                          className="w-[68px] flex flex-col justify-center px-1 leading-tight text-muted-foreground"
                          title={
                            plot.sourceTemplate || plot.sourceVariant
                              ? `${plot.sourceTemplate?.name ?? "\u2014"}${plot.sourceVariant ? ` / ${plot.sourceVariant.name}` : ""}`
                              : undefined
                          }
                        >
                          <span className="truncate">
                            {plot.houseType || "\u2014"}
                          </span>
                          {(plot.sourceTemplate || plot.sourceVariant) && (
                            <span className="truncate text-[8px] text-slate-400">
                              {plot.sourceVariant?.name ?? plot.sourceTemplate?.name}
                            </span>
                          )}
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
                          <ApprovalDot approved={plot.approvalG} label="Gas approval" />
                          <ApprovalDot approved={plot.approvalE} label="Electric approval" />
                          <ApprovalDot approved={plot.approvalW} label="Water approval" />
                          <ApprovalDot approved={plot.approvalKCO} label="KCO" />
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
                      const impactTypes = weatherImpactMap.get(colDate) ?? [];
                      const hasRain = impactTypes.includes("RAIN");
                      const hasTemp = impactTypes.includes("TEMPERATURE");
                      const hasImpact = hasRain || hasTemp;
                      const impactNote = weatherImpactNotes.get(colDate);
                      const impactIcon = hasRain && hasTemp ? "☔🌡️" : hasTemp ? "🌡️" : "☔";
                      const bgClass = hasRain && hasTemp
                        ? "bg-amber-200 ring-1 ring-inset ring-amber-400"
                        : hasTemp
                          ? "bg-cyan-200 ring-1 ring-inset ring-cyan-400"
                          : hasRain
                            ? "bg-orange-200 ring-1 ring-inset ring-orange-400"
                            : "hover:bg-slate-100";
                      const impactLabel = hasRain && hasTemp
                        ? "Rain + Temperature impact"
                        : hasTemp ? "Temperature impact" : "Rain day";
                      return (
                        <div
                          key={`weather-${col.key}`}
                          className={`flex shrink-0 items-center justify-center border-r cursor-pointer transition-colors ${bgClass}`}
                          style={{ width: cellWidth }}
                          title={
                            weather
                              ? `${weather.category} ${weather.tempMax}°/${weather.tempMin}°${hasImpact ? ` (${impactLabel.toUpperCase()}${impactNote ? `: ${impactNote}` : ""})` : " — click to log weather impact"}`
                              : hasImpact
                                ? `${impactLabel.toUpperCase()}${impactNote ? `: ${impactNote}` : ""} — click to edit`
                                : "Click to log weather impact"
                          }
                          onClick={(e) => openRainedOffPopover(colDate, e)}
                        >
                          {hasImpact ? (
                            <span className="text-[11px]">{impactIcon}</span>
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
                      {col.dayName && <span className={`leading-none ${col.isWeekendDay ? "text-slate-400" : ""}`}>{col.dayName}</span>}
                      <span>{col.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Grid + Stage code cells */}
              <div className="relative" style={{ height: totalHeight }}>
                {/* Today line — all three overlays MUST be pointer-events-none.
                    Previously the 40px-wide highlight column absorbed clicks,
                    which meant any job/order/delivery that happened to fall in
                    the current week became unclickable. A silent, high-impact
                    bug since "today" is exactly the column the user most wants
                    to interact with. */}
                {todayIndex >= 0 && (
                  <>
                    {/* Semi-transparent highlight column behind today.
                        (May 2026 audit UX-P0-6) role+aria so screen
                        readers announce "today" alongside the visual
                        red highlight; previously colour-only.
                        (Audit UX-P1) 6% opacity barely registered
                        against white — bumped to 12% so the column
                        actually highlights the day visually. */}
                    <div
                      role="img"
                      aria-label="Today's column on the programme"
                      className="pointer-events-none absolute top-0 z-[5] bg-red-500/[0.12]"
                      style={{
                        left: todayIndex * cellWidth,
                        width: cellWidth,
                        height: totalHeight,
                      }}
                    />
                    {/* Today label at top */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute z-20 -translate-x-1/2 rounded-b bg-red-500 px-1.5 py-0.5 text-[9px] font-bold leading-none text-white shadow-sm"
                      style={{
                        left: todayIndex * cellWidth + cellWidth / 2,
                        top: 0,
                      }}
                    >
                      Today
                    </div>
                    {/* Red vertical line — aria-hidden because the column
                        highlight above already conveys "today" to AT. */}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute top-0 z-10 bg-red-500"
                      style={{
                        left: todayIndex * cellWidth + cellWidth / 2 - 1,
                        width: 2,
                        height: totalHeight,
                        boxShadow: "0 0 4px rgba(239, 68, 68, 0.5)",
                      }}
                    />
                  </>
                )}

                {/* Row backgrounds + stage code cells */}
                {processedPlots.map((plot, plotIndex) => (
                  <div
                    key={plot.id}
                    className={`absolute left-0 right-0 border-b ${
                      plotIndex % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                    }`}
                    style={{
                      top: plotIndex * effectiveRowHeight,
                      height: effectiveRowHeight,
                    }}
                  >
                    {/* Overlay mode: dashed divider between Current (top half)
                        and Original (bottom half). Labels are shown in the
                        left plot-metadata column (not here in the timeline,
                        where they'd be covered by the first cell's bar). */}
                    {ganttMode === "overlay" && (
                      <div
                        className="absolute left-0 right-0 border-t border-dashed border-slate-300 pointer-events-none z-10"
                        style={{ top: ROW_HEIGHT - 1 }}
                      />
                    )}
                    {plot.jobs.map((job) => {
                      // Resolve dates for the CURRENT bar row.
                      // "original": show original planned dates (before any shifts)
                      // "current" / "overlay": show actual dates for completed jobs, planned for rest
                      const currentStart = ganttMode === "original"
                        ? (job.originalStartDate || job.startDate)
                        : (job.actualStartDate ?? job.startDate);
                      const currentEnd = ganttMode === "original"
                        ? (job.originalEndDate || job.endDate)
                        : (job.actualEndDate ?? job.endDate);
                      if (!currentStart || !currentEnd) return null;

                      const jobStart = new Date(currentStart);
                      const jobEnd = new Date(currentEnd);
                      const code = getStageCode(job);
                      const colors = ganttMode === "original"
                        ? { bg: "#e2e8f0", text: "#475569" }  // grey for original mode
                        : getStageColor(job.status);
                      const hasPhotos = (job._count?.photos ?? 0) > 0;
                      const hasNotes = (job._count?.actions ?? 0) > 0;

                      // Original dates for the second row in overlay mode.
                      // Fall back to current dates if no original was ever recorded
                      // (job never shifted) — in that case the original row shows
                      // the same position, giving a visual "didn't move" signal.
                      const origStart = job.originalStartDate ?? currentStart;
                      const origEnd = job.originalEndDate ?? currentEnd;
                      const origJobStart = new Date(origStart);
                      const origJobEnd = new Date(origEnd);
                      const hasShifted = ganttMode === "overlay" && (
                        (job.originalStartDate && job.originalStartDate !== currentStart) ||
                        (job.originalEndDate && job.originalEndDate !== currentEnd)
                      );

                      // Current bar sits at top=0. In non-overlay it fills the row;
                      // in overlay it occupies the top half (ROW_HEIGHT). Original
                      // (if overlay) is rendered in a second pass below at top=ROW_HEIGHT.
                      const orders = job.orders ?? [];
                      const jobFirstColIdx = columns.findIndex(
                        (c) => jobStart < c.endDate && jobEnd >= c.date
                      );

                      // Total working-day duration of this bar — used below
                      // in Week view to render partial-week fills for short
                      // (day-granularity) jobs. A 3-day job fills 60% of a
                      // week cell instead of the whole thing.
                      const barWorkingDays = Math.max(1, differenceInWorkingDays(jobEnd, jobStart) + 1);

                      const currentCells = columns.map((col, colIdx) => {
                        const overlaps = jobStart < col.endDate && jobEnd >= col.date;
                        if (!overlaps) return null;
                        // (May 2026 Keith bug report) Day-view weekend
                        // cells render nothing — construction work is
                        // working-day. A job from Thu→Tue (4 working
                        // days) used to paint its colour on Sat + Sun
                        // too because the calendar-overlap check sees
                        // them as "inside" the bar. Now we skip weekend
                        // day columns entirely. Week-view columns span
                        // Mon-Sun so this check is no-op there.
                        if (viewMode === "day" && col.isWeekendDay) return null;

                        const isFirstJobCell = colIdx === jobFirstColIdx;

                        // Partial-week fill detection. Week view only.
                        // Working days of this bar that fall within THIS column.
                        // For single-week jobs shorter than 5 WDs we show a
                        // shorter bar aligned to the start of the cell.
                        let partialWidth: number | null = null;
                        let partialLeft = 0;
                        if (viewMode === "week") {
                          // Start of this column's bar portion = max(jobStart, col.date)
                          const cellStart = col.date > jobStart ? col.date : jobStart;
                          const cellEnd = col.endDate < jobEnd ? col.endDate : jobEnd;
                          // Clamp to column edges, compute working days in this cell.
                          const daysInCell = Math.max(
                            1,
                            differenceInWorkingDays(cellEnd, cellStart) + 1
                          );
                          // If the bar doesn't fill the full 5 working days
                          // of the column, render a proportional width.
                          if (daysInCell < 5 || barWorkingDays < 5) {
                            const fullInner = cellWidth - 2;
                            partialWidth = Math.max(8, (fullInner * daysInCell) / 5);
                            // Offset from left when job starts mid-week —
                            // how many working days are we into the column.
                            const leadIn = differenceInWorkingDays(cellStart, col.date);
                            partialLeft = Math.max(0, (fullInner * leadIn) / 5);
                          }
                        }
                        void partialLeft; // applied in the wrapper div below
                        const colDateStr = format(col.date, "yyyy-MM-dd");
                        const colEndStr = format(col.endDate, "yyyy-MM-dd");
                        const isDotCol = job._dotStartDates
                          ? job._dotStartDates.some((d) => {
                              const ds = d.slice(0, 10);
                              return ds >= colDateStr && ds < colEndStr;
                            })
                          : isFirstJobCell;

                        const barStartStr = currentStart.slice(0, 10);
                        const hasOrderInCell = orders.some((o) => {
                          const ds = o.dateOfOrder.slice(0, 10);
                          if (ds < barStartStr && isFirstJobCell) return true;
                          return ds >= colDateStr && ds < colEndStr;
                        });
                        const hasDeliveryInCell = orders.some((o) => {
                          if (!o.expectedDeliveryDate) return false;
                          const ds = o.expectedDeliveryDate.slice(0, 10);
                          if (ds < barStartStr && isFirstJobCell) return true;
                          return ds >= colDateStr && ds < colEndStr;
                        });
                        void hasOrderInCell; void hasDeliveryInCell; // rendered in separate layer

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
                                job.status === "IN_PROGRESS" && ganttMode !== "original" ? "animate-[pulse-glow_2s_ease-in-out_infinite]" : ""
                              } ${
                                (() => {
                                  if (!job.weatherAffected || viewMode !== "day") return "";
                                  const types = weatherImpactMap.get(format(col.date, "yyyy-MM-dd")) ?? [];
                                  if (types.includes("RAIN") && types.includes("TEMPERATURE")) return "ring-2 ring-amber-500 ring-inset";
                                  if (types.includes("TEMPERATURE")) return "ring-2 ring-cyan-500 ring-inset";
                                  if (types.includes("RAIN")) return "ring-2 ring-orange-500 ring-inset";
                                  return "";
                                })()
                              }`}
                              style={{
                                // Partial-week fills: if this column holds only
                                // a fraction of a 5-WD week (because the job is
                                // a day-granularity sub-job or spans mid-week),
                                // shrink the bar + offset from the left. Keeps
                                // day-precision visible in Week view without
                                // needing to switch to Day view.
                                position: partialWidth !== null ? "absolute" : "relative",
                                ...(partialWidth !== null ? { left: partialLeft } : {}),
                                width: partialWidth !== null ? partialWidth : cellWidth - 2,
                                height: ROW_HEIGHT - 6,
                                backgroundColor: (() => {
                                  if (!job.weatherAffected || viewMode !== "day") return colors.bg;
                                  const types = weatherImpactMap.get(format(col.date, "yyyy-MM-dd")) ?? [];
                                  if (types.includes("RAIN") && types.includes("TEMPERATURE")) return "#fef3c7";
                                  if (types.includes("TEMPERATURE")) return "#cffafe";
                                  if (types.includes("RAIN")) return "#fecaca";
                                  return colors.bg;
                                })(),
                                color: (() => {
                                  if (!job.weatherAffected || viewMode !== "day") return colors.text;
                                  const types = weatherImpactMap.get(format(col.date, "yyyy-MM-dd")) ?? [];
                                  if (types.includes("RAIN") && types.includes("TEMPERATURE")) return "#92400e";
                                  if (types.includes("TEMPERATURE")) return "#164e63";
                                  if (types.includes("RAIN")) return "#991b1b";
                                  return colors.text;
                                })(),
                                ...(job.status === "IN_PROGRESS" && ganttMode !== "original"
                                  ? { boxShadow: "0 0 6px 1px rgba(59,130,246,0.4)" }
                                  : {}),
                              }}
                            >
                              {(() => {
                                if (!job.weatherAffected || viewMode !== "day") return code;
                                const types = weatherImpactMap.get(format(col.date, "yyyy-MM-dd")) ?? [];
                                if (types.includes("RAIN") && types.includes("TEMPERATURE")) return "☔🌡️";
                                if (types.includes("TEMPERATURE")) return "🌡️";
                                if (types.includes("RAIN")) return "☔";
                                return code;
                              })()}
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
                            </div>
                          </div>
                        );
                      });

                      // Overlay mode: render the ORIGINAL planned bar in the bottom
                      // half (top: ROW_HEIGHT). Greyed, dashed border, no onClick —
                      // it's informational. Shows WHERE the job was originally
                      // scheduled so Keith can see at a glance "it used to be here,
                      // now it's there". If the job never shifted, origStart/origEnd
                      // equal current, so the bottom row mirrors the top — still
                      // useful because the absence of a shift IS information.
                      const originalCells = ganttMode === "overlay"
                        ? columns.map((col, colIdx) => {
                            const overlaps = origJobStart < col.endDate && origJobEnd >= col.date;
                            if (!overlaps) return null;
                            // (May 2026 Keith bug report) Skip weekend
                            // day cells — same fix as the current bar
                            // loop above.
                            if (viewMode === "day" && col.isWeekendDay) return null;
                            return (
                              <div
                                key={`${job.id}-orig-${col.key}`}
                                className="absolute flex items-center justify-center pointer-events-none"
                                style={{
                                  left: colIdx * cellWidth,
                                  top: ROW_HEIGHT,
                                  width: cellWidth,
                                  height: ROW_HEIGHT,
                                }}
                                title={`${job.name} — originally planned ${origStart.slice(0, 10)} to ${origEnd.slice(0, 10)}${hasShifted ? " (since shifted)" : ""}`}
                              >
                                <div
                                  className={`relative flex items-center justify-center rounded font-medium ${
                                    viewMode === "day" ? "text-[7px]" : "text-[8px]"
                                  }`}
                                  style={{
                                    width: cellWidth - 2,
                                    height: ROW_HEIGHT - 6,
                                    backgroundColor: hasShifted ? "#f1f5f9" : "#e2e8f0",
                                    color: "#64748b",
                                    border: hasShifted ? "1px dashed #94a3b8" : "1px solid #cbd5e1",
                                    opacity: hasShifted ? 0.8 : 0.55,
                                  }}
                                >
                                  {code}
                                </div>
                              </div>
                            );
                          })
                        : null;

                      return <>{currentCells}{originalCells}</>;
                    })}
                  </div>
                ))}

                {/* Order/delivery dots — rendered as a separate layer on actual
                    calendar dates. Each dot is a clickable button that opens
                    the JobWeekPanel for the job that owns the order/delivery.
                    Visual dot stays small (8px) but the hit area is 20×18 so
                    it's tappable on mobile without swallowing the job cell's
                    clicks (dots only cover the bottom strip of the cell). */}
                {processedPlots.map((plot, plotIndex) => {
                  // Flatten orders tagged with their owning job so we can
                  // resolve the click target back to a job.
                  const ordersWithJob = plot.jobs.flatMap((j) =>
                    (j.orders ?? []).map((o) => ({ ...o, _job: j }))
                  );
                  if (ordersWithJob.length === 0) return null;

                  return columns.map((col, colIdx) => {
                    const colDateStr = format(col.date, "yyyy-MM-dd");
                    const colEndStr = format(col.endDate, "yyyy-MM-dd");

                    // First order placed in this cell — click target for purple dot
                    const orderInCell = ordersWithJob.find((o) => {
                      const ds = o.dateOfOrder?.slice(0, 10);
                      return ds && ds >= colDateStr && ds < colEndStr;
                    });
                    // First delivery expected in this cell — click target for teal dot
                    const deliveryInCell = ordersWithJob.find((o) => {
                      if (!o.expectedDeliveryDate) return false;
                      const ds = o.expectedDeliveryDate.slice(0, 10);
                      return ds >= colDateStr && ds < colEndStr;
                    });

                    if (!orderInCell && !deliveryInCell) return null;

                    const openPanelFor = (job: ProgrammeJob) => {
                      let childJobIds: string[] | undefined;
                      if (job.id.startsWith("synth-")) {
                        const origPlot = site?.plots.find((p) => p.id === plot.id);
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
                        siteName: site!.name,
                        siteId: site!.id,
                        childJobIds,
                      });
                      setPanelOpen(true);
                    };

                    return (
                      <div
                        key={`dots-${plot.id}-${col.key}`}
                        className="pointer-events-none absolute"
                        style={{ left: colIdx * cellWidth, top: plotIndex * effectiveRowHeight, width: cellWidth, height: ROW_HEIGHT }}
                      >
                        <div className="absolute bottom-0 left-1/2 flex -translate-x-1/2 gap-0.5">
                          {orderInCell && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openPanelFor(orderInCell._job); }}
                              title={`Order: ${orderInCell.supplier?.name || "Unknown"} — ${orderInCell._job.name}`}
                              aria-label={`Open order details: ${orderInCell.supplier?.name || "order"} on ${orderInCell._job.name}`}
                              className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded hover:bg-purple-100 active:bg-purple-200"
                            >
                              <div className="size-2 rounded-full bg-purple-500" />
                            </button>
                          )}
                          {deliveryInCell && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openPanelFor(deliveryInCell._job); }}
                              title={`Delivery: ${deliveryInCell.supplier?.name || "Unknown"} — ${deliveryInCell._job.name}`}
                              aria-label={`Open delivery details: ${deliveryInCell.supplier?.name || "delivery"} on ${deliveryInCell._job.name}`}
                              className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded hover:bg-teal-100 active:bg-teal-200"
                            >
                              <div className="size-2 rounded-full bg-teal-500" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  });
                })}

                {/* Weekend background stripes (day view) */}
                {/* Weekend stripes — z-[1] so they sit BELOW the today
                    highlight (z-[5]). Pre-fix the weekend stripe with no
                    z-index drew on top of today, hiding the red tint on
                    "today is a Sunday/Saturday". (May 2026 audit SM-P2) */}
                {viewMode === "day" &&
                  columns.map(
                    (col, i) =>
                      col.isWeekendDay && (
                        <div
                          key={`wknd-${col.key}`}
                          className="pointer-events-none absolute top-0 z-[1] bg-slate-200/30"
                          style={{
                            left: i * cellWidth,
                            width: cellWidth,
                            height: totalHeight,
                          }}
                        />
                      )
                  )}

                {/* Weather impact day column highlights (day view) */}
                {viewMode === "day" &&
                  columns.map((col, i) => {
                    const colDate = format(col.date, "yyyy-MM-dd");
                    const types = weatherImpactMap.get(colDate) ?? [];
                    if (!types.length) return null;
                    const bgColor =
                      types.includes("RAIN") && types.includes("TEMPERATURE")
                        ? "bg-amber-100/50"
                        : types.includes("TEMPERATURE")
                          ? "bg-cyan-100/50"
                          : "bg-orange-100/50";
                    return (
                      <div
                        key={`impact-${col.key}`}
                        className={`pointer-events-none absolute top-0 ${bgColor}`}
                        style={{ left: i * cellWidth, width: cellWidth, height: totalHeight }}
                      />
                    );
                  })}

                {/* Vertical gridlines — decorative, must not eat clicks */}
                {columns.map((col, i) => (
                  <div
                    key={`grid-${col.key}`}
                    className="pointer-events-none absolute top-0 border-r border-slate-100"
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
                  <div className="h-4 w-[2px] bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]" />
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
        <div className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-between border-t bg-blue-50 px-4 py-2.5 shadow-lg md:left-64">
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare className="size-4 text-blue-600" />
            <span className="font-medium text-blue-900">
              {selectedPlots.size} plot{selectedPlots.size > 1 ? "s" : ""} selected
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                // Start next job on each selected plot
                if (!site) return;
                for (const plotId of selectedPlots) {
                  const plot = site.plots.find((p) => p.id === plotId);
                  if (!plot) continue;
                  const nextJob = plot.jobs.find((j) => j.status === "NOT_STARTED");
                  if (nextJob) {
                    await triggerBulkStart(
                      { id: nextJob.id, name: nextJob.name, status: nextJob.status, startDate: nextJob.startDate ?? null, endDate: nextJob.endDate ?? null },
                      "start"
                    );
                  }
                }
                clearSelection();
              }}
              className="flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-green-700"
            >
              <Play className="size-3.5" />
              Start All
            </button>
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

      {bulkStartDialogs}
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

            {/* Weather suggestion if impact days are logged */}
            {weatherImpactMap.size > 0 && (() => {
              const rainCount = [...weatherImpactMap.values()].filter((t) => t.includes("RAIN")).length;
              const tempCount = [...weatherImpactMap.values()].filter((t) => t.includes("TEMPERATURE")).length;
              return (
                <div className="mt-3 rounded-md bg-orange-50 p-2 text-[11px] text-orange-700">
                  {rainCount > 0 && <span>☔ {rainCount} rain day{rainCount !== 1 ? "s" : ""} logged</span>}
                  {rainCount > 0 && tempCount > 0 && <span> · </span>}
                  {tempCount > 0 && <span>🌡️ {tempCount} temperature day{tempCount !== 1 ? "s" : ""} logged</span>}
                  <span className="ml-1">— suggest selecting a weather reason below</span>
                </div>
              );
            })()}

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Working days to delay (Mon-Fri)</label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={delayDays || ""}
                  onChange={(e) => setDelayDays(parseInt(e.target.value) || 0)}
                  className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Delay reason</label>
                <div className="flex gap-1">
                  {(["WEATHER_RAIN", "WEATHER_TEMPERATURE", "OTHER"] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => setDelayReasonType(r)}
                      className={`flex-1 rounded px-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                        delayReasonType === r
                          ? r === "WEATHER_RAIN" ? "bg-orange-500 text-white"
                            : r === "WEATHER_TEMPERATURE" ? "bg-cyan-500 text-white"
                            : "bg-slate-700 text-white"
                          : "border text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {r === "WEATHER_RAIN" ? "☔ Rain" : r === "WEATHER_TEMPERATURE" ? "🌡️ Temp" : "⏳ Other"}
                    </button>
                  ))}
                </div>
              </div>
              {delayReasonType === "OTHER" && (
                <div>
                  <label className="mb-1 block text-xs font-medium">Reason detail (optional)</label>
                  <input
                    type="text"
                    value={delayReason}
                    onChange={(e) => setDelayReason(e.target.value)}
                    placeholder="e.g. Material shortage, access issue..."
                    className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              )}
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

      {/* Weather impact popover */}
      {rainedOffPopover && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setRainedOffPopover(null)} />
          <div
            className="fixed z-50 w-72 rounded-lg border bg-white p-3 shadow-lg"
            style={{ left: rainedOffPopover.x, top: rainedOffPopover.y }}
          >
            <p className="mb-2 text-xs font-semibold text-slate-700">
              {format(new Date(rainedOffPopover.date), "EEE dd MMM yyyy")}
            </p>
            {/* Type selector */}
            <div className="mb-2 flex gap-1">
              <button
                onClick={() => setRainedOffType("RAIN")}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${rainedOffType === "RAIN" ? "bg-orange-500 text-white" : "border text-slate-600 hover:bg-slate-50"}`}
              >
                ☔ Rain
              </button>
              <button
                onClick={() => setRainedOffType("TEMPERATURE")}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${rainedOffType === "TEMPERATURE" ? "bg-cyan-500 text-white" : "border text-slate-600 hover:bg-slate-50"}`}
              >
                🌡️ Temperature
              </button>
            </div>
            <input
              type="text"
              placeholder="Add a note (optional)..."
              value={rainedOffNoteInput}
              onChange={(e) => setRainedOffNoteInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmRainedOff(); }}
              className="mb-2 w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
            <p className="mb-2 text-[10px] text-muted-foreground">
              Logs a note on affected jobs. To delay a job, use the Delay action on the job itself.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmRainedOff}
                className={`flex-1 rounded px-2 py-1 text-xs font-medium text-white ${rainedOffType === "TEMPERATURE" ? "bg-cyan-500 hover:bg-cyan-600" : "bg-orange-500 hover:bg-orange-600"}`}
              >
                {(weatherImpactMap.get(rainedOffPopover.date) ?? []).includes(rainedOffType) ? "Update" : "Log Impact"}
              </button>
              {(weatherImpactMap.get(rainedOffPopover.date) ?? []).includes(rainedOffType) && (
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
    </>
  );
}
