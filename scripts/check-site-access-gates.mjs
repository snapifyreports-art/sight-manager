/**
 * (Jun 2026 guardrail) Per-site page access-gate check.
 *
 * Why: a `sites/[siteId]` page once server-rendered a site's full detail —
 * plot budgets and margins included — WITHOUT calling canAccessSite, so any
 * logged-in user (even a contractor) could read any site by typing the URL.
 * The (dashboard) layout enforces login but NOT per-site access. This makes
 * that class of leak fail the BUILD instead of reaching a user: every page
 * route whose path is scoped to a specific site or plot (a [siteId] or
 * [plotId] dynamic segment) MUST reference an access gate.
 *
 * Wired into `npm run build` (test:gates). Escape hatch: the ALLOWLIST below
 * for a deliberate, reviewed exception, or `npm run build:nocheck`.
 *
 * Scope note: this fences the DIRECT site-scoped page class (path contains
 * [siteId]/[plotId]). Entity pages that resolve to a site (jobs/[id],
 * orders/[id]) gate via the entity's own siteId and are checked by review;
 * tenant-global pages (contacts, suppliers) are correctly ungated.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const APP = join("src", "app");

// Any of these tokens in the file body counts as an access gate.
const GATE_TOKENS = ["canAccessSite", "getUserSiteIds", "assertSiteAccess"];

// Deliberate, reviewed exceptions: route paths (forward-slash, no extension)
// that legitimately render a [siteId]/[plotId] page without a per-request
// site gate. Keep this empty unless there's a real reason + a comment.
const ALLOWLIST = new Set([
  // Public QR-redirect: reads only plot.shareToken/shareEnabled and 302s to
  // the already-gated /progress/<token> page. Exposes no site data itself.
  "/q/[plotId]",
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const offenders = [];
let checked = 0;

for (const f of walk(APP)) {
  if (!/[\\/]page\.tsx?$/.test(f)) continue;
  const rel = f.slice(APP.length).split(sep).join("/");
  // Only site/plot-scoped page routes.
  if (!/\[siteId\]|\[plotId\]/.test(rel)) continue;
  const routePath = rel.replace(/\/page\.tsx?$/, "");
  if (ALLOWLIST.has(routePath)) continue;
  checked++;
  const text = readFileSync(f, "utf8");
  if (!GATE_TOKENS.some((t) => text.includes(t))) {
    offenders.push(rel);
  }
}

if (offenders.length > 0) {
  console.error(
    `✗ ${offenders.length} site-scoped page(s) have no access gate (${GATE_TOKENS.join(" / ")}):\n`,
  );
  for (const o of offenders) console.error(`  src/app${o}`);
  console.error(
    "\nA [siteId]/[plotId] page must verify the user can access the site before rendering its data.\n" +
      "Add a canAccessSite/getUserSiteIds check, or add the route to ALLOWLIST in scripts/check-site-access-gates.mjs if deliberate.",
  );
  process.exit(1);
}
console.log(`✓ site access gates OK — ${checked} site-scoped page(s) all gated`);
