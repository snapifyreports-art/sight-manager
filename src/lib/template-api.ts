/**
 * Helper for building plot-template API URLs scoped to either the
 * base template or a variant.
 *
 * Usage:
 *   tplPath(templateId, variantId, "/jobs")
 *     → "/api/plot-templates/<id>/jobs?variantId=<v>"  if variant set
 *     → "/api/plot-templates/<id>/jobs"                if not
 *
 * The suffix can include further query params:
 *   tplPath(t, v, "/orders?foo=bar") composes correctly.
 *
 * Goal: all the template-editor sub-components reach for this helper
 * instead of doing string-concat surgery each time. Otherwise every
 * one of the ~20 fetch sites has to repeat the same logic.
 */
export function tplPath(
  templateId: string,
  variantId: string | null | undefined,
  suffix: string,
): string {
  const base = `/api/plot-templates/${templateId}${suffix}`;
  if (!variantId) return base;
  // Preserve any query string the caller already included.
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}variantId=${encodeURIComponent(variantId)}`;
}
