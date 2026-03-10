"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { format, startOfWeek, addWeeks, differenceInWeeks, isWithinInterval } from "date-fns";
import { Loader2, Columns3, ChevronRight, Download, FileText, Search, X, Camera, StickyNote } from "lucide-react";
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

const CELL_WIDTH = 40;
const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 40;

const LEFT_PANEL_EXPANDED = 520;
// Collapsed: just Plot (52px)
const LEFT_PANEL_COLLAPSED = 52;

// ---------- Types ----------

interface ProgrammeJob {
  id: string;
  name: string;
  status: string;
  stageCode: string | null;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
  _count?: { photos: number; actions: number };
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
  plots: ProgrammePlot[];
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

function getJobStageForWeek(
  plot: ProgrammePlot,
  weekDate: Date
): { code: string; status: string } | null {
  const weekEnd = addWeeks(weekDate, 1);
  for (const job of plot.jobs) {
    if (!job.startDate || !job.endDate) continue;
    const jobStart = new Date(job.startDate);
    const jobEnd = new Date(job.endDate);
    if (jobStart < weekEnd && jobEnd >= weekDate) {
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

export function SiteProgramme({ siteId }: { siteId: string }) {
  const [site, setSite] = useState<ProgrammeSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [houseTypeFilter, setHouseTypeFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  // Job week panel state
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelContext, setPanelContext] = useState<{
    job: ProgrammeJob;
    plotName: string;
    plotId: string;
    siteName: string;
    siteId: string;
  } | null>(null);

  const leftPanelWidth = expanded ? LEFT_PANEL_EXPANDED : LEFT_PANEL_COLLAPSED;

  useEffect(() => {
    fetch(`/api/sites/${siteId}/programme`)
      .then((r) => r.json())
      .then(setSite)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [siteId]);

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

  // Calculate week range
  const { weeks, todayWeekIndex } = useMemo(() => {
    if (!site) return { weeks: [], todayWeekIndex: -1 };

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

    if (!minDate || !maxDate) return { weeks: [], todayWeekIndex: -1 };

    const start = addWeeks(startOfWeek(minDate, { weekStartsOn: 1 }), -2);
    const end = addWeeks(startOfWeek(maxDate, { weekStartsOn: 1 }), 3);
    const totalWeeks = differenceInWeeks(end, start);

    const weekList: Array<{ date: Date; label: string; key: string }> = [];
    for (let i = 0; i < totalWeeks; i++) {
      const d = addWeeks(start, i);
      weekList.push({
        date: d,
        label: format(d, "dd/MM"),
        key: getWeekKey(d),
      });
    }

    const now = new Date();
    const todayIdx = weekList.findIndex((w, i) => {
      const nextWeek = i < weekList.length - 1 ? weekList[i + 1].date : addWeeks(w.date, 1);
      return isWithinInterval(now, { start: w.date, end: nextWeek });
    });

    return { weeks: weekList, todayWeekIndex: todayIdx };
  }, [site]);

  // Auto-scroll to today's week
  useEffect(() => {
    if (todayWeekIndex >= 0 && scrollRef.current) {
      const scrollLeft = todayWeekIndex * CELL_WIDTH - 200;
      scrollRef.current.scrollLeft = Math.max(0, scrollLeft);
    }
  }, [todayWeekIndex]);

  // ---------- Export: Excel ----------
  const handleExportExcel = useCallback(async () => {
    if (!site) return;
    const XLSX = await import("xlsx");

    const plotsToExport = filteredPlots;

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
      ...weeks.map((w) => w.label),
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

      for (const week of weeks) {
        const result = getJobStageForWeek(plot, week.date);
        baseRow.push(result ? result.code : "");
      }

      return baseRow;
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map((_, i) => ({ wch: i < 12 ? 10 : 6 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Programme");
    XLSX.writeFile(wb, `${site.name.replace(/\s+/g, "_")}_programme.xlsx`);
  }, [site, filteredPlots, weeks]);

  // ---------- Export: PDF ----------
  const handleExportPDF = useCallback(async () => {
    if (!site) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const plotsToExport = filteredPlots;

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
    const weekCols = weeks.map((w) => w.label);
    const allCols = [...leftCols, ...weekCols];
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

      const weekData = weeks.map((week) => {
        const result = getJobStageForWeek(plot, week.date);
        return result ? result.code : "";
      });

      return [...leftData, ...weekData];
    });

    // Pre-compute cell colours for week columns
    const cellStyleMap: Record<string, { fillColor: [number, number, number]; textColor: [number, number, number] }> = {};
    plotsToExport.forEach((plot, plotIdx) => {
      weeks.forEach((week, weekIdx) => {
        const result = getJobStageForWeek(plot, week.date);
        if (result) {
          const colors = getStageColor(result.status);
          cellStyleMap[`${plotIdx}-${leftColCount + weekIdx}`] = {
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

    autoTable(doc, {
      startY: 25,
      head: [allCols],
      body: rows,
      styles: {
        fontSize: 5.5,
        cellPadding: { top: 1, right: 0.8, bottom: 1, left: 0.8 },
        lineWidth: 0.1,
        lineColor: [226, 232, 240], // slate-200
      },
      headStyles: {
        fillColor: [248, 250, 252], // slate-50
        textColor: [71, 85, 105],   // slate-500
        fontSize: 5,
        fontStyle: "bold",
        halign: "center",
      },
      columnStyles: Object.fromEntries(
        allCols.map((_, i) => [
          i,
          {
            cellWidth: i < leftColCount ? leftColWidths[i] : 6,
            halign: (i >= leftColCount || i >= 6 && i <= 9 || i === 11 ? "center" : "left") as "center" | "left",
            fontSize: i >= leftColCount ? 5 : 5.5,
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

          // Highlight today's week column header
          const colIdx = data.column.index;
          if (colIdx === leftColCount + todayWeekIndex && !style) {
            data.cell.styles.fillColor = [239, 246, 255]; // blue-50 tint
          }
        }

        // Today's week header highlight
        if (data.section === "head") {
          const colIdx = data.column.index;
          if (colIdx === leftColCount + todayWeekIndex) {
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
  }, [site, filteredPlots, weeks, hasFilters, todayWeekIndex]);

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

  const totalHeight = filteredPlots.length * ROW_HEIGHT;
  const timelineWidth = weeks.length * CELL_WIDTH;

  return (
    <div className="rounded-lg border bg-white">
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

        {/* Spacer */}
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

      {filteredPlots.length === 0 ? (
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
        <div className="overflow-x-auto" ref={scrollRef}>
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
                style={{ height: HEADER_HEIGHT }}
              >
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
              {filteredPlots.map((plot, index) => {
                const stageLabel = getActiveStageLabel(plot);

                return (
                  <div
                    key={plot.id}
                    className={`flex items-center border-b text-[10px] ${
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/50"
                    }`}
                    style={{ height: ROW_HEIGHT }}
                  >
                    <div className="w-[52px] truncate px-1.5 font-semibold">
                      <Link
                        href={`/sites/${site.id}/plots/${plot.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
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
              {/* Week headers */}
              <div
                className="flex border-b bg-slate-50"
                style={{ height: HEADER_HEIGHT }}
              >
                {weeks.map((week, i) => (
                  <div
                    key={week.key}
                    className={`flex shrink-0 flex-col items-center justify-end border-r pb-1 text-[9px] ${
                      i === todayWeekIndex
                        ? "bg-blue-100 font-bold text-blue-700"
                        : "text-muted-foreground"
                    }`}
                    style={{ width: CELL_WIDTH }}
                  >
                    <span>{week.label}</span>
                  </div>
                ))}
              </div>

              {/* Grid + Stage code cells */}
              <div className="relative" style={{ height: totalHeight }}>
                {/* Today line */}
                {todayWeekIndex >= 0 && (
                  <div
                    className="absolute top-0 z-10 w-0.5 bg-red-500"
                    style={{
                      left: todayWeekIndex * CELL_WIDTH + CELL_WIDTH / 2,
                      height: totalHeight,
                    }}
                  />
                )}

                {/* Row backgrounds + stage code cells */}
                {filteredPlots.map((plot, plotIndex) => (
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

                      return weeks.map((week, weekIdx) => {
                        const weekEnd = addWeeks(week.date, 1);
                        const overlaps = jobStart < weekEnd && jobEnd >= week.date;
                        if (!overlaps) return null;

                        return (
                          <div
                            key={`${job.id}-${week.key}`}
                            className="absolute flex cursor-pointer items-center justify-center"
                            style={{
                              left: weekIdx * CELL_WIDTH,
                              top: 0,
                              width: CELL_WIDTH,
                              height: ROW_HEIGHT,
                            }}
                            title={`${job.name} (${job.status}) — Click for details`}
                            onClick={() => {
                              setPanelContext({
                                job,
                                plotName: plot.plotNumber || plot.name,
                                plotId: plot.id,
                                siteName: site.name,
                                siteId: site.id,
                              });
                              setPanelOpen(true);
                            }}
                          >
                            <div
                              className="relative flex items-center justify-center rounded text-[8px] font-bold transition-all hover:brightness-90 hover:shadow-sm"
                              style={{
                                width: CELL_WIDTH - 2,
                                height: ROW_HEIGHT - 6,
                                backgroundColor: colors.bg,
                                color: colors.text,
                              }}
                            >
                              {code}
                              {/* Photo/note indicators */}
                              {(hasPhotos || hasNotes) && (
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
                    })}
                  </div>
                ))}

                {/* Vertical gridlines */}
                {weeks.map((week, i) => (
                  <div
                    key={`grid-${week.key}`}
                    className="absolute top-0 border-r border-slate-100"
                    style={{
                      left: i * CELL_WIDTH,
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
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Week Panel */}
      <JobWeekPanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        context={panelContext}
      />
    </div>
  );
}
