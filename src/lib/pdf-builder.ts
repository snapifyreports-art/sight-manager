import { format } from "date-fns";
import { NextResponse } from "next/server";
import {
  type PdfBrand,
  drawBrandHeader,
  drawBrandFooter,
} from "@/lib/pdf-branding";

/**
 * (May 2026 PDF library refactor) Canonical PDF-building helpers.
 *
 * Every PDF generated in the system — handover plot pack, snag
 * report, handover ZIP renderers, programme export — uses these
 * primitives. Before this module, each file imported jsPDF +
 * autoTable independently and re-wrote the same boilerplate
 * (dynamic import, ArrayBuffer→Buffer coerce, header layout,
 * currency formatting). Now they all share one path.
 *
 * Imports are deferred (await import) so non-PDF code paths don't
 * pull in jspdf at build time.
 *
 * Library choice: jspdf + jspdf-autotable. Considered react-pdf and
 * pdfme but both would require rewriting every existing renderer.
 * Unifying behind a thin wrapper keeps the existing layout work
 * while giving future PDFs a one-line "do the right thing" call.
 */

export type JsPDFType = import("jspdf").jsPDF;

export type AutoTableFn = (
  doc: JsPDFType,
  options: Record<string, unknown>,
) => void;

interface LoadedPdf {
  jsPDF: typeof import("jspdf").jsPDF;
  autoTable: AutoTableFn;
}

let cached: LoadedPdf | null = null;

/**
 * Dynamic import of jsPDF + jspdf-autotable. Cached on first call
 * so subsequent calls don't re-import.
 */
export async function loadJsPdf(): Promise<LoadedPdf> {
  if (cached) return cached;
  const { default: jsPDF } = await import("jspdf");
  const autoTable = ((await import("jspdf-autotable")).default ?? (await import("jspdf-autotable"))) as unknown as AutoTableFn;
  cached = { jsPDF, autoTable };
  return cached;
}

/** Convert a jsPDF doc to a Node Buffer (for archive append / NextResponse). */
export function pdfBuffer(doc: JsPDFType): Buffer {
  const ab = doc.output("arraybuffer");
  return Buffer.from(ab);
}

/** Format an ISO date safely. Returns the fallback if the input is
 *  null / undefined / unparseable. */
export function safeDate(iso: string | Date | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  try {
    const d = typeof iso === "string" ? new Date(iso) : iso;
    if (isNaN(d.getTime())) return fallback;
    return format(d, "dd MMM yyyy");
  } catch {
    return fallback;
  }
}

/** Format a number as a £-prefixed currency string. No decimals by
 *  default; pass digits to show pence. */
export function fmtCurrency(n: number, digits = 0): string {
  return `£${n.toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

interface HeaderOpts {
  /** Optional second-line subtitle in grey. */
  subtitle?: string;
  /** Show "Generated dd MMM yyyy HH:mm" under the subtitle. Default true. */
  showTimestamp?: boolean;
  /** Top-line title size. Default 18. */
  titleSize?: number;
  /**
   * (Jun 2026 white-label) When provided, the header is drawn branded —
   * customer logo top-right, brand name, and the primaryColor accent rule
   * (via drawBrandHeader) — and a co-branded "Powered by Sight Manager"
   * footer is stamped on the current page (via drawBrandFooter). Omit it
   * to keep the plain back-compat header.
   */
  brand?: PdfBrand;
}

/**
 * Draw a standard PDF header: large title (≈18pt) at top-left,
 * optional grey subtitle below, and a generated-at timestamp.
 * Returns the y-position where the next content should start.
 *
 * (Jun 2026 white-label) Pass `opts.brand` to render the branded header
 * (customer logo + name + accent rule) and footer instead. The plain,
 * no-brand path below is unchanged for back-compat.
 */
export function drawHeader(
  doc: JsPDFType,
  title: string,
  opts: HeaderOpts = {},
): number {
  const { subtitle, showTimestamp = true, titleSize = 18, brand } = opts;

  // (Jun 2026 white-label) Branded path: delegate the header to the shared
  // pdf-branding helper (logo + brand name + primaryColor accent), stamp the
  // co-brand footer on this page, and return the Y below the header. The
  // generated-at timestamp is appended under the header so callers keep it.
  if (brand) {
    let y = drawBrandHeader(doc, brand, title, subtitle);
    if (showTimestamp) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`,
        14,
        y,
      );
      doc.setTextColor(0);
      y += 6;
    }
    drawBrandFooter(doc, brand);
    return y + 4;
  }

  doc.setFontSize(titleSize);
  doc.text(title, 14, 22);
  let cursorY = 22;
  if (subtitle) {
    doc.setFontSize(11);
    doc.setTextColor(120);
    doc.text(subtitle, 14, 30);
    doc.setTextColor(0);
    cursorY = 30;
  }
  if (showTimestamp) {
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      `Generated ${format(new Date(), "dd MMM yyyy HH:mm")}`,
      14,
      cursorY + 6,
    );
    doc.setTextColor(0);
    cursorY += 6;
  }
  return cursorY + 8;
}

/**
 * Build a NextResponse with the right PDF headers + filename. Used
 * by API routes that return a single PDF (snag PDF, plot handover).
 */
export function pdfResponse(doc: JsPDFType, filename: string): NextResponse {
  // Buffer is assignable to BodyInit at runtime — the modern TS lib
  // typing got stricter and complains. Cast through Uint8Array.
  const buf = pdfBuffer(doc);
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
