"use client";

import { Printer } from "lucide-react";

/**
 * Print button on the contractor share page. Uses window.print() which
 * gives the contractor "Save as PDF" via their browser's print dialog.
 * Hidden in print output via print:hidden.
 */
export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 print:hidden"
      title="Print or save as PDF"
    >
      <Printer className="size-3.5" />
      Print / PDF
    </button>
  );
}
