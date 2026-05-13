import { prisma } from "./prisma";

/**
 * Returns the site IDs a user is allowed to access.
 * - CEO and DIRECTOR roles: returns ALL site IDs (full access).
 * - Other roles: returns only the site IDs from the UserSite join table.
 *   If a non-admin user has no site assignments, returns an empty array (no access).
 */
export async function getUserSiteIds(
  userId: string,
  role: string
): Promise<string[] | null> {
  // (May 2026 audit #201) SUPER_ADMIN sees every site, same as
  // CEO + DIRECTOR. Return null to signal "no filter needed".
  if (role === "SUPER_ADMIN" || role === "CEO" || role === "DIRECTOR") {
    return null;
  }

  const userSites = await prisma.userSite.findMany({
    where: { userId },
    select: { siteId: true },
  });

  return userSites.map((us) => us.siteId);
}

/**
 * Build a Prisma `where` clause fragment to filter by site access.
 * Returns an empty object for admins (no filter), or { siteId: { in: [...] } } for others.
 * Use the `siteIdField` param when the field name differs (e.g. for nested relations).
 *
 * (May 2026 audit B-P1-37) DANGER: this is safe when spread into a
 * top-level `where: { ...siteAccessFilter(...), other: stuff }`. It is
 * UNSAFE inside an OR composition (`where: { OR: [siteAccessFilter, ...] }`)
 * — the empty admin object spreads to "match everything" inside the OR
 * and would grant access to records the user shouldn't see. Prefer the
 * explicit pattern:
 *   const accessibleSiteIds = await getUserSiteIds(userId, role);
 *   where: {
 *     ...(accessibleSiteIds !== null
 *       ? { siteId: { in: accessibleSiteIds } }
 *       : {}),
 *   }
 * which forces the caller to think about the OR vs AND placement.
 */
export async function siteAccessFilter(
  userId: string,
  role: string,
  siteIdField: string = "siteId"
): Promise<Record<string, unknown>> {
  const siteIds = await getUserSiteIds(userId, role);
  if (siteIds === null) return {}; // admin — no filter
  return { [siteIdField]: { in: siteIds } };
}

/**
 * Returns true if the user can access the given site.
 * CEO and DIRECTOR always can.
 */
export async function canAccessSite(
  userId: string,
  role: string,
  siteId: string
): Promise<boolean> {
  const ids = await getUserSiteIds(userId, role);
  if (ids === null) return true;
  return ids.includes(siteId);
}
