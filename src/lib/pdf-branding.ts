import type { jsPDF } from "jspdf";
import { PLATFORM, type CustomerBranding } from "@/lib/platform";

/**
 * (Jun 2026 white-label) Shared PDF branding for every generator (handover
 * pack, snag PDF, reports). The CUSTOMER logo + name head the document; the
 * PLATFORM ("Powered by Sight Manager") sits small in the footer.
 *
 * jsPDF can only embed PNG/JPEG, and needs the bytes (not a URL), so the logo
 * is fetched server-side once and passed around as a data URL. Everything is
 * fail-safe: a missing/unfetchable/unsupported logo just omits the image.
 */

export interface PdfBrand {
  brandName: string;
  logoDataUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
}

/** Fetch a logo URL → base64 data URL (PNG/JPEG only). Null on any failure. */
export async function fetchLogoDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const isPng = ct.includes("png") || /\.png(\?|$)/i.test(url);
    const isJpg = ct.includes("jpeg") || ct.includes("jpg") || /\.jpe?g(\?|$)/i.test(url);
    if (!isPng && !isJpg) return null; // jsPDF can't embed svg/webp
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = isPng ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** Resolve a CustomerBranding into the PDF-ready brand (fetches the logo once). */
export async function loadPdfBrand(c: CustomerBranding): Promise<PdfBrand> {
  return {
    brandName: c.brandName,
    logoDataUrl: await fetchLogoDataUrl(c.logoUrl),
    primaryColor: c.primaryColor,
    supportEmail: c.supportEmail,
  };
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || "");
  if (!m) return [37, 99, 235];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Draw a branded document header: title (+ optional subtitle), the small brand
 * name, the customer logo top-right, and a primaryColor accent rule. Returns
 * the Y coordinate just below the header so callers can continue from there.
 */
export function drawBrandHeader(
  doc: jsPDF,
  brand: PdfBrand,
  title: string,
  subtitle?: string,
): number {
  const pageW = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(title, 14, 20);

  let y = 20;
  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(subtitle, 14, 27);
    y = 27;
  }

  // Issuing business name (small).
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(brand.brandName, 14, y + 6);

  // Customer logo, top-right, scaled to a 12mm-high box (max 45mm wide).
  if (brand.logoDataUrl) {
    try {
      const props = doc.getImageProperties(brand.logoDataUrl);
      const h = 12;
      const w = Math.min(45, h * (props.width / props.height));
      doc.addImage(brand.logoDataUrl, props.fileType || "PNG", pageW - 14 - w, 11, w, h);
    } catch {
      /* logo embed failed — header still renders without it */
    }
  }

  // primaryColor accent rule under the header.
  const [r, g, b] = hexToRgb(brand.primaryColor);
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.6);
  doc.line(14, y + 9, pageW - 14, y + 9);

  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  return y + 14;
}

/**
 * Draw the footer co-brand on the CURRENT page: a "Powered by Sight Manager"
 * platform mark (right) and an optional support-contact line (left). Call once
 * per page (e.g. after each addPage).
 */
export function drawBrandFooter(doc: jsPDF, brand: PdfBrand): void {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  if (brand.supportEmail) {
    doc.text(`Questions? ${brand.supportEmail}`, 14, pageH - 8);
  }
  doc.text(PLATFORM.poweredBy, pageW - 14, pageH - 8, { align: "right" });
  doc.setTextColor(0, 0, 0);
}

/** Tint a jsPDF-autotable head fillColor with the brand primary. */
export function brandHeadFill(brand: PdfBrand): [number, number, number] {
  return hexToRgb(brand.primaryColor);
}

export { PLATFORM };
