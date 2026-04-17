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
  // CEO and DIRECTOR see everything — return null to signal "no filter needed"
  if (role === "CEO" || role === "DIRECTOR") {
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
