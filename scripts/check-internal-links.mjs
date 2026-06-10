/**
 * (Jun 2026 guardrail) Internal-link existence check.
 *
 * Why: the On-Site-Today page shipped a plot link to /plots/[id] — a page
 * that does not exist — and every click 404'd in front of users. This
 * script makes that class of bug fail the BUILD instead of a site visit:
 * it inventories every page route under src/app, extracts every internal
 * <Link href> / router.push / redirect target in the source, and fails if
 * any target matches no route.
 *
 * Wired into `npm run build` (before `next build`). Escape hatches: the
 * ALLOWLIST below for deliberate exceptions, or `npm run build:nocheck`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const SRC = "src";
const APP = join(SRC, "app");

// Deliberate exceptions (path patterns, after ${...} → [x] normalisation).
const ALLOWLIST = new Set([]);

// ── 1. Route inventory ─────────────────────────────────────────────────
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const routes = [];
for (const f of walk(APP)) {
  if (!/[\\/]page\.tsx?$/.test(f)) continue;
  let rel = f.slice(APP.length).split(sep).join("/");
  rel = rel.replace(/\/page\.tsx?$/, "") || "/";
  // Route groups "(dashboard)" vanish from the URL.
  rel = rel
    .split("/")
    .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")))
    .join("/");
  if (!rel.startsWith("/")) rel = "/" + rel;
  if (rel === "") rel = "/";
  routes.push(rel === "" ? "/" : rel);
}

function segMatch(routeSeg, linkSeg) {
  if (routeSeg.startsWith("[...") || routeSeg.startsWith("[[...")) return "rest";
  if (routeSeg.startsWith("[") && routeSeg.endsWith("]")) return true;
  return routeSeg === linkSeg;
}

function linkMatchesRoute(link, route) {
  const ls = link.split("/").filter(Boolean);
  const rs = route.split("/").filter(Boolean);
  for (let i = 0; i < rs.length; i++) {
    const m = segMatch(rs[i], ls[i] ?? "");
    if (m === "rest") return true; // catch-all swallows the remainder
    if (!m) return false;
    if (ls[i] === undefined) return false;
  }
  return ls.length === rs.length;
}

// ── 2. Extract internal link targets from source ───────────────────────
const linkRe =
  /(?:href=\{?["'`]|router\.push\(\s*["'`]|redirect\(\s*["'`])(\/[^"'`\s?#]*)/g;

const problems = [];
const seen = new Map(); // normalised link → first "file:line"

for (const f of walk(SRC)) {
  if (!/\.(tsx|ts)$/.test(f)) continue;
  const text = readFileSync(f, "utf8");
  let m;
  while ((m = linkRe.exec(text)) !== null) {
    let target = m[1];
    if (target.startsWith("/api/")) continue; // API fetches: separate concern
    if (target.startsWith("//")) continue; // protocol-relative external
    // Normalise template params ${...} → [x]
    target = target.replace(/\$\{[^}]*\}/g, "[x]").replace(/\/+$/, "") || "/";
    if (ALLOWLIST.has(target)) continue;
    if (seen.has(target)) continue;
    const line = text.slice(0, m.index).split("\n").length;
    seen.set(target, `${f}:${line}`);
  }
}

for (const [target, where] of seen) {
  const linkForMatch = target.replace(/\[x\]/g, "__param__");
  const ok = routes.some((r) =>
    linkMatchesRoute(
      linkForMatch.replace(/__param__/g, "x"),
      r,
    ),
  );
  if (!ok) problems.push({ target, where });
}

if (problems.length > 0) {
  console.error(`✗ ${problems.length} internal link(s) point at pages that don't exist:\n`);
  for (const p of problems) console.error(`  ${p.target}\n    at ${p.where}\n`);
  console.error("Fix the href, or add the path to ALLOWLIST in scripts/check-internal-links.mjs if deliberate.");
  process.exit(1);
}
console.log(`✓ internal links OK — ${seen.size} unique link targets checked against ${routes.length} routes`);
