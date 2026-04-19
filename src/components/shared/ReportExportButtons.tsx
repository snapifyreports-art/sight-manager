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
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";

export interface ReportExportButtonsProps {
  /** Filename without extension. Will get `.xlsx` appended. */
  filename: string;
  /** Flat rows to export to Excel. Omit or pass [] to disable Excel button. */
  rows?: Array<Record<string, unknown>>;
  /** Excel sheet name (max 31 chars per xlsx spec). */
  sheetName?: string;
  /** Override the print handler. Default: window.print(). */
  onPrint?: () => void;
  /** Hide the PDF/print button. Some reports don't make sense printed. */
  hidePrint?: boolean;
  /** Hide the Excel button. Useful when there's no tabular data. */
  hideExcel?: boolean;
  /** Compact / small variant. Default false = normal size. */
  compact?: boolean;
}

export function ReportExportButtons({
  filename,
  rows,
  sheetName = "Data",
  onPrint,
  hidePrint = false,
  hideExcel = false,
  compact = false,
}: ReportExportButtonsProps) {
  const handlePrint = () => {
    if (onPrint) onPrint();
    else window.print();
  };

  const handleExcel = () => {
    if (!rows || rows.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    // Sheet names are limited to 31 chars.
    XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const canExcel = !!rows && rows.length > 0;
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
