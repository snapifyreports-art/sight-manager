#!/usr/bin/env node
/**
 * (Jun 2026 IDOR sweep) Static authorization guardrail for API route handlers.
 *
 * The sibling `check-site-access-gates.mjs` only audits *pages*. This audits
 * every `src/app/api/** /route.ts` HTTP handler and FAILS THE BUILD when a
 * handler that touches data via Prisma isn't authorized. Two buckets:
 *
 *  1. SITE-ADDRESSABLE routes (sites/[id], plots/[id], jobs/[id], orders/[id],
 *     snags/[id], inspections/[id], lateness/[id], photos/[..], documents/[id])
 *     MUST carry real per-site scoping — canAccessSite (directly or via a local
 *     guard helper), siteAccessFilter, getUserSiteIds, or an ownership
 *     cross-check (`.siteId !==` / `.plotId !==`). A permission gate ALONE is
 *     NOT enough: permissions gate *what* you may do, not *which site* — that's
 *     exactly the cross-site IDOR class (handover POST, bulk-delay, pre-start).
 *  2. EVERY OTHER data route (global catalogues, admin, self-scoped) must have
 *     SOME authorization — site-scoping, a permission/role gate, or self-scoping
 *     by session.user.id.
 *
 * Tier-2 additionally flags nested-id mutations (.../[id]/.../[childId]) that
 * update/delete by the child id with no parent-ownership cross-check.
 *
 * Heuristic, with an explicit ALLOWLIST for reviewed by-design exceptions.
 * To clear a flag: add a real check, or allowlist it WITH A REASON.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "src", "app", "api");

// Intentionally public / non-tenant by design (token-, secret-, or auth-gated).
const PUBLIC_PREFIXES = [
  "auth/",
  "contractor-share/[token]",
  "share/[token]",
  "progress/[token]",
  "cron/",
  "weather",
];

// Routes whose [id] resolves to a Site — these REQUIRE true site-scoping.
const SITE_ADDRESSABLE = [
  /^sites\/\[id\]/, /^plots\/\[id\]/, /^jobs\/\[id\]/, /^orders\/\[id\]/,
  /^snags\/\[id\]/, /^inspections\/\[id\]/, /^lateness\/\[id\]/,
  /^photos\/\[/, /^documents\/\[id\]/,
];

// Reviewed by-design exceptions: "<route>::<METHOD>" -> reason.
// (Full sweep 2026-06-28: every other flagged handler was legitimately
//  permission-gated, self-scoped, or public — only these two reads remain.)
const ALLOWLIST = new Map([
  ["settings/branding::GET", "Intentionally public — the login page + external/customer pages theme themselves before auth. Returns only branding (name, colours, logo URLs, legal identity for certs); no tenant/user data."],
  ["delay-reasons::GET", "Authed read of a global, non-sensitive chip list (delay-reason labels). Not site-scoped data; any signed-in staff member legitimately sees the same picker."],
]);

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name === "route.ts") out.push(p);
  }
  return out;
}
const routeKey = (file) => path.relative(API_DIR, path.dirname(file)).split(path.sep).join("/");
const isPublic = (key) => PUBLIC_PREFIXES.some((p) => key === p || key.startsWith(p));
const isSiteAddressable = (key) => SITE_ADDRESSABLE.some((re) => re.test(key));
const dynSegments = (key) => [...key.matchAll(/\[([A-Za-z0-9_]+)\]/g)].map((x) => x[1]);

// Names of local functions whose body references site-access — the guard helpers.
function localGuardNames(src) {
  const names = new Set();
  const fnRe = /(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g;
  let m;
  while ((m = fnRe.exec(src))) {
    const bodyStart = src.indexOf("{", fnRe.lastIndex);
    if (bodyStart === -1) continue;
    let depth = 0, end = -1;
    for (let i = bodyStart; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) continue;
    const body = src.slice(bodyStart, end);
    if (/canAccessSite\s*\(|getUserSiteIds\s*\(|siteAccessFilter\b/.test(body)) names.add(m[1]);
  }
  const arrowRe = /const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/g;
  while ((m = arrowRe.exec(src))) {
    const after = src.slice(m.index, m.index + 700);
    if (/canAccessSite\s*\(|getUserSiteIds\s*\(|siteAccessFilter\b/.test(after)) names.add(m[1]);
  }
  return names;
}

function handlers(src) {
  const out = [];
  const re = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const bodyStart = src.indexOf("{", re.lastIndex);
    if (bodyStart === -1) continue;
    let depth = 0, end = -1;
    for (let i = bodyStart; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) continue;
    out.push({ method: m[1], body: src.slice(bodyStart, end + 1) });
  }
  return out;
}

const files = walk(API_DIR).sort();
const flags = [];
let handlerCount = 0;

for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const key = routeKey(file);
  if (isPublic(key)) continue;

  const guards = localGuardNames(src);
  const guardCall = guards.size ? new RegExp("\\b(" + [...guards].join("|") + ")\\s*\\(") : null;
  const segs = dynSegments(key);
  const siteRoute = isSiteAddressable(key);

  for (const h of handlers(src)) {
    handlerCount++;
    const id = `${key}::${h.method}`;
    if (ALLOWLIST.has(id)) continue;
    if (!/\bprisma\.|\btx\./.test(h.body)) continue; // no DB access → nothing to authorize

    const siteScoped =
      /canAccessSite\s*\(/.test(h.body) ||
      /siteAccessFilter\b/.test(h.body) ||
      /getUserSiteIds\s*\(/.test(h.body) ||
      /\.siteId\s*!==/.test(h.body) ||
      /\.plotId\s*!==/.test(h.body) ||
      (guardCall && guardCall.test(h.body));
    const permGated =
      /sessionHasPermission\s*\(|hasPermission\s*\(|requirePermission\s*\(/.test(h.body) ||
      /\brole\s*[!=]==/.test(h.body) ||
      /managerRoles|"SUPER_ADMIN"|"CEO"|"DIRECTOR"/.test(h.body);
    const selfScoped = /userId:\s*session\.user\.id/.test(h.body);

    if (siteRoute) {
      // Bucket 1: must be site-scoped (permission gate alone is insufficient).
      if (!siteScoped) {
        flags.push({ id, tier: 1, reason: "SITE-ADDRESSABLE route without per-site scoping (canAccessSite/guard/ownership) — permission gate alone can't stop cross-site access" });
        continue;
      }
      // Tier-2: nested-id mutation without ownership cross-check.
      if (segs.length >= 2) {
        const child = segs[segs.length - 1];
        const mutatesByChild = new RegExp(
          "\\.(update|delete|upsert)\\s*\\(\\s*\\{[\\s\\S]{0,140}where:\\s*\\{[\\s\\S]{0,90}id:\\s*" + child + "\\b"
        ).test(h.body);
        const hasOwnership = /!==\s*[A-Za-z0-9_.]+/.test(h.body) || /\.(findUnique|findFirst)\b/.test(h.body);
        if (mutatesByChild && !hasOwnership) {
          flags.push({ id, tier: 2, reason: `mutates by [${child}] with no parent-ownership cross-check` });
        }
      }
    } else {
      // Bucket 2: needs SOME authorization beyond auth().
      if (!siteScoped && !permGated && !selfScoped) {
        flags.push({ id, tier: 1, reason: "data route with no authorization beyond auth() (no site-scope, permission gate, or self-scope)" });
      }
    }
  }
}

console.log(`Scanned ${files.length} route files · ${handlerCount} handlers · ${ALLOWLIST.size} allowlisted`);
if (flags.length === 0) {
  console.log("✓ API authz OK — every tenant-data handler is authorized (site-addressable routes are site-scoped)");
  process.exit(0);
}
const t1 = flags.filter((f) => f.tier === 1);
const t2 = flags.filter((f) => f.tier === 2);
console.log(`\n✗ ${flags.length} handler(s) need attention: ${t1.length} Tier-1 (no/!insufficient authz), ${t2.length} Tier-2 (nested-id)`);
for (const f of flags) console.log(`  [T${f.tier}] ${f.id}\n        ${f.reason}`);
console.log("\nFix: add canAccessSite/ownership check, or allowlist with a reason in check-api-authz.mjs");
process.exit(1);
