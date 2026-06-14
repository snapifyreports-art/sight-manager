import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sessionHasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * Recurring themes across free-text (keyword rollup).
 *
 * Gathers free-text blobs from every place a manager types a reason or
 * description — delay notes, sign-off notes, NCRs, snags, defects,
 * variations, toolbox talks — lowercases each blob, and counts how many
 * blobs mention each of a fixed set of themes (a blob counts once per
 * theme even if multiple keywords for that theme appear). The themes are
 * defined here so reporting buckets stay consistent across surfaces.
 *
 * Returns:
 *   - themes  : [{ theme, mentions }] sorted desc by mentions
 *   - totalTexts : number of free-text blobs scanned
 *   - sources : [{ source, count }] per-source blob counts
 */

// Keyword → theme map. A blob is tagged with a theme when ANY of the
// theme's keywords appears as a substring of the (lowercased) blob.
const THEME_KEYWORDS: Record<string, string[]> = {
  Weather: ["weather", "rain", "wet", "storm", "frost", "cold", "snow", "wind"],
  Scaffold: ["scaffold", "scaff"],
  Access: ["access", "blocked", "locked", "gate", "egress"],
  "Materials/Delivery": [
    "material",
    "delivery",
    "deliver",
    "supply",
    "stock",
    "shortage",
    "short",
    "backorder",
  ],
  Labour: ["labour", "labor", "no-show", "noshow", "crew", "operative", "manpower"],
  "Design/Spec": ["design", "spec", "drawing", "rfi", "clarif", "change", "revision"],
  "Damage/Defect": ["damage", "damaged", "crack", "broken", "snag", "defect"],
  Drainage: ["drain", "drainage", "sewer", "manhole"],
  Inspection: ["inspection", "nhbc", "fail", "reject"],
};

export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "VIEW_ANALYTICS",
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);

  // Scope helpers — direct siteId vs nested plot.siteId. When siteIds is
  // null (admin/all sites) we apply no filter.
  const directScope = siteIds !== null ? { siteId: { in: siteIds } } : {};
  const plotScope =
    siteIds !== null ? { plot: { siteId: { in: siteIds } } } : {};

  const [
    lateness,
    jobs,
    ncrs,
    snags,
    defects,
    variations,
    toolboxTalks,
  ] = await Promise.all([
    prisma.latenessEvent.findMany({
      where: { ...directScope, reasonNote: { not: null } },
      select: { reasonNote: true },
    }),
    prisma.job.findMany({
      where: { ...plotScope, signOffNotes: { not: null } },
      select: { signOffNotes: true },
    }),
    prisma.nCR.findMany({
      where: directScope,
      select: { rootCause: true, description: true },
    }),
    prisma.snag.findMany({
      where: plotScope,
      select: { description: true },
    }),
    prisma.defectReport.findMany({
      where: plotScope,
      select: { description: true },
    }),
    prisma.variation.findMany({
      where: { ...plotScope, description: { not: null } },
      select: { description: true },
    }),
    prisma.toolboxTalk.findMany({
      where: directScope,
      select: { topic: true, notes: true },
    }),
  ]);

  // Build one blob per record. NCR and ToolboxTalk join their two
  // free-text fields into a single blob so a record counts once per theme.
  const join = (...parts: Array<string | null | undefined>): string =>
    parts.filter((p): p is string => !!p && p.trim().length > 0).join(" ");

  const blobsBySource: Array<{ source: string; blobs: string[] }> = [
    {
      source: "Delay notes",
      blobs: lateness.map((r) => join(r.reasonNote)).filter(Boolean),
    },
    {
      source: "Sign-off notes",
      blobs: jobs.map((r) => join(r.signOffNotes)).filter(Boolean),
    },
    {
      source: "NCRs",
      blobs: ncrs.map((r) => join(r.rootCause, r.description)).filter(Boolean),
    },
    {
      source: "Snags",
      blobs: snags.map((r) => join(r.description)).filter(Boolean),
    },
    {
      source: "Defects",
      blobs: defects.map((r) => join(r.description)).filter(Boolean),
    },
    {
      source: "Variations",
      blobs: variations.map((r) => join(r.description)).filter(Boolean),
    },
    {
      source: "Toolbox talks",
      blobs: toolboxTalks.map((r) => join(r.topic, r.notes)).filter(Boolean),
    },
  ];

  const themeNames = Object.keys(THEME_KEYWORDS);
  const themeCounts: Record<string, number> = {};
  for (const t of themeNames) themeCounts[t] = 0;

  let totalTexts = 0;
  const sources: Array<{ source: string; count: number }> = [];

  for (const { source, blobs } of blobsBySource) {
    sources.push({ source, count: blobs.length });
    for (const raw of blobs) {
      totalTexts += 1;
      const blob = raw.toLowerCase();
      for (const theme of themeNames) {
        // Count the blob once for this theme if ANY keyword matches.
        if (THEME_KEYWORDS[theme].some((kw) => blob.includes(kw))) {
          themeCounts[theme] += 1;
        }
      }
    }
  }

  const themes = themeNames
    .map((theme) => ({ theme, mentions: themeCounts[theme] }))
    .sort((a, b) => b.mentions - a.mentions);

  return NextResponse.json({ themes, totalTexts, sources });
}
