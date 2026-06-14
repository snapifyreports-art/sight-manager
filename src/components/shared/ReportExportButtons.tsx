"use client";

/**
 * Shared export buttons for reports. Keith Apr 2026 Q4=c: PDF + Excel
 * on every report. Two buttons side-by-side:
 *
 *  - **Print / PDF**: invokes the browser's print dialog. Users can
 *    "Save as PDF" from there. Respects any `print:*` classes in the
 *    report's markup so layouts stay clean.
 *  - **Download Excel**: generates an `.xlsx` client-side from the
 *    passed `rows` using SheetJS. Rows are flattened objects; keys
 *    become column headers, values become cells.
 *
 * Usage:
 *   <ReportExportButtons
 *     filename="budget-report-2026-04-19"
 *     rows={flatRows}
 *     sheetName="Budget"
 *   />
 *
 * If `rows` is empty, the Excel button is disabled (still renders so
 * the layout doesn't jump between reports with and without data).
 */

import { Printer, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORM } from "@/lib/platform";

// (May 2026 audit P-* bundle-bloat) xlsx is ~190 KB gzipped — pre-fix
// the static import shipped it on every authenticated page that
// included a ReportExportButtons component (i.e. most of the app).
// Lazy-import on click so it only loads when the user actually
// downloads an Excel file. First-click latency rises by ~200ms; every
// other page load gets faster.

export interface ReportExportButtonsProps {
  /** Filename without extension. Will get `.xlsx` appended. */
  filename: string;
  /** Flat rows to export to Excel. Omit or pass [] to disable Excel button. */
  rows?: Array<Record<string, unknown>>;
  /** Excel sheet name (max 31 chars per xlsx spec). */
  sheetName?: string;
  /**
   * (Jun 2026 Wave-4 D5) Multi-sheet export — one tab per entry. When
   * provided, this takes precedence over `rows`/`sheetName`, so a report
   * with several tables (e.g. Analytics) downloads as one workbook with a
   * sheet each. Empty-row sheets are skipped.
   */
  sheets?: Array<{ name: string; rows: Array<Record<string, unknown>> }>;
  /** Override the print handler. Default: window.print(). */
  onPrint?: () => void;
  /** Hide the PDF/print button. Some reports don't make sense printed. */
  hidePrint?: boolean;
  /** Hide the Excel button. Useful when there's no tabular data. */
  hideExcel?: boolean;
  /** Compact / small variant. Default false = normal size. */
  compact?: boolean;
  /**
   * (Jun 2026 white-label) Customer display name. When provided, the Excel
   * export gets a leading brand row + a title row above the data, so a
   * downloaded spreadsheet carries the customer's identity. Omit it (or pass
   * the platform name) for the previous unbranded behaviour.
   */
  brandName?: string;
  /**
   * (Jun 2026 white-label) Optional support email. Appended after the brand
   * name in the Excel banner row when present.
   */
  supportEmail?: string;
  /**
   * (Jun 2026 white-label) Human title for the report (e.g. "Weekly Site
   * Report"). Used as the Excel title row when a brand banner is added.
   */
  reportTitle?: string;
}

/**
 * (Jun 2026 white-label) Print-only co-branded banner. Reports that have a
 * print view render this above their print header so the printed/Save-as-PDF
 * output carries the customer name at the top and "Powered by Sight Manager"
 * at the bottom. Hidden on screen (`print:block` only). Pass the resolved
 * display name (brandName || platformName) as `brandName`.
 */
export function PrintBrandHeader({
  brandName,
  supportEmail,
}: {
  brandName?: string;
  supportEmail?: string;
}) {
  if (!brandName) return null;
  return (
    <div className="hidden print:block">
      <div className="mb-2 flex items-center justify-between border-b pb-2">
        <span className="text-base font-bold">{brandName}</span>
        {supportEmail && (
          <span className="text-xs text-slate-500">{supportEmail}</span>
        )}
      </div>
    </div>
  );
}

/**
 * (Jun 2026 white-label) Print-only co-brand footer — the fixed
 * "Powered by Sight Manager" platform mark. Reports include it at the
 * bottom of their print view alongside PrintBrandHeader.
 */
export function PrintBrandFooter() {
  return (
    <div className="hidden print:block">
      <p className="mt-4 border-t pt-2 text-center text-[10px] text-slate-400">
        {PLATFORM.poweredBy}
      </p>
    </div>
  );
}

export function ReportExportButtons({
  filename,
  rows,
  sheetName = "Data",
  sheets,
  onPrint,
  hidePrint = false,
  hideExcel = false,
  compact = false,
  brandName,
  supportEmail,
  reportTitle,
}: ReportExportButtonsProps) {
  const handlePrint = () => {
    if (onPrint) onPrint();
    else window.print();
  };

  // (Jun 2026 Wave-4 D5) A workbook is exportable if there's a non-empty
  // single sheet OR at least one non-empty multi-sheet entry.
  const multiSheets = (sheets ?? []).filter((s) => s.rows.length > 0);
  const canExcel =
    multiSheets.length > 0 || (!!rows && rows.length > 0);

  const handleExcel = async () => {
    if (!canExcel) return;
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();

    // (Jun 2026 white-label) When a brandName is supplied, prepend a brand
    // banner row (brand name + optional support email) and a title row above
    // the data, so a downloaded spreadsheet carries the customer's identity.
    // Without a brandName the sheet is built exactly as before. The data JSON
    // is offset down by the number of banner rows via the `origin` option.
    const bannerRows: string[][] = [];
    if (brandName) {
      bannerRows.push([supportEmail ? `${brandName} — ${supportEmail}` : brandName]);
      if (reportTitle) bannerRows.push([reportTitle]);
    }
    const buildSheet = (sheetRows: Array<Record<string, unknown>>) => {
      if (bannerRows.length === 0) return XLSX.utils.json_to_sheet(sheetRows);
      // Banner rows occupy the top; the data table (with its own header row)
      // starts immediately below them.
      const ws = XLSX.utils.aoa_to_sheet(bannerRows);
      XLSX.utils.sheet_add_json(ws, sheetRows, { origin: bannerRows.length });
      return ws;
    };

    if (multiSheets.length > 0) {
      // (Jun 2026 Wave-4 D5) One tab per table. Sheet names are limited to
      // 31 chars and must be unique within the workbook.
      const used = new Set<string>();
      for (const s of multiSheets) {
        let name = s.name.slice(0, 31);
        let i = 2;
        while (used.has(name)) name = `${s.name.slice(0, 28)} ${i++}`;
        used.add(name);
        XLSX.utils.book_append_sheet(wb, buildSheet(s.rows), name);
      }
    } else {
      const ws = buildSheet(rows!);
      // Sheet names are limited to 31 chars.
      XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    }
    // (May 2026 audit) Auto-append today's date unless the caller
    // already included one in the filename. Pre-this, every download
    // was just "budget-report.xlsx" — stacking reports across days
    // overwrote each other in Downloads. Detect YYYY-MM-DD anywhere
    // in the supplied filename so opt-in date naming stays respected.
    const hasDate = /\d{4}-\d{2}-\d{2}/.test(filename);
    const dateSuffix = hasDate
      ? ""
      : `-${new Date().toISOString().slice(0, 10)}`;
    XLSX.writeFile(wb, `${filename}${dateSuffix}.xlsx`);
  };

  const size = compact ? "sm" : "default";
  const iconSize = compact ? "size-3" : "size-4";
  const textSize = compact ? "text-xs" : "text-sm";

  return (
    <div className="flex items-center gap-2 print:hidden">
      {!hidePrint && (
        <Button
          variant="outline"
          size={size}
          onClick={handlePrint}
          className={`gap-1.5 ${textSize}`}
          title="Open your browser's print dialog. Choose 'Save as PDF' to download."
        >
          <Printer className={iconSize} />
          Print / PDF
        </Button>
      )}
      {!hideExcel && (
        <Button
          variant="outline"
          size={size}
          onClick={handleExcel}
          disabled={!canExcel}
          className={`gap-1.5 ${textSize}`}
          title={canExcel ? "Download as Excel spreadsheet" : "No data to export"}
        >
          <FileSpreadsheet className={iconSize} />
          Excel
        </Button>
      )}
    </div>
  );
}
