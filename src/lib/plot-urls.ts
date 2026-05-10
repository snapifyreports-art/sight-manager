/**
 * Canonical plot URL builder. ONE function — every place that needs
 * "the URL for this plot" calls this. Includes the QR code generators,
 * sidebar links, anywhere that links plot-to-plot.
 *
 * The plot's database ID (cuid) is permanent — once assigned at
 * creation it never changes — so the URL is effectively a fixed
 * identity for the plot. QR codes encode this URL, which means a
 * printed QR for a plot will keep working forever (until the plot is
 * deleted).
 *
 * Why this exists: before May 2026 the QR code component computed two
 * different URLs in two places (both wrong) while BatchPlotQR computed
 * a third. Single source of truth for plot URLs kills that class of
 * bug — change the path here and every consumer updates automatically.
 */

interface PlotUrlInput {
  siteId: string;
  plotId: string;
  /** Optional. Falls back to NEXT_PUBLIC_APP_URL or window.location.origin. */
  origin?: string;
}

function resolveOrigin(override?: string): string {
  if (override) return override;
  if (typeof window !== "undefined") return window.location.origin;
  // Server-side fallback. NEXTAUTH_URL is configured on Vercel.
  return process.env.NEXTAUTH_URL || "";
}

/** Internal app URL for a plot's detail page. Requires login. */
export function getPlotInternalUrl({ siteId, plotId, origin }: PlotUrlInput): string {
  return `${resolveOrigin(origin)}/sites/${siteId}/plots/${plotId}`;
}

/** URL that printed QR codes encode. Resolves at scan time to the
 *  customer-share /progress/<token> page (when one exists), otherwise
 *  shows a friendly "not yet active" message. The intermediate
 *  /q/<plotId> redirect means rotating the share token doesn't
 *  invalidate the printed QR — the QR is permanent for the life of
 *  the plot.
 *
 *  (May 2026 audit #206) Pre-fix this returned the internal app URL —
 *  scanning the for-sale board QR sent buyers to a login screen. */
export function getPlotQrUrl({ plotId, origin }: PlotUrlInput): string {
  return `${resolveOrigin(origin)}/q/${plotId}`;
}
