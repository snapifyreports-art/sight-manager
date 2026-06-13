/**
 * (Jun 2026 Wave-4 D9) Backfill the new VIEW_COMPLIANCE / MANAGE_COMPLIANCE
 * permissions onto existing users.
 *
 * Permissions are stored per-user (UserPermission rows), not recomputed
 * from role at session time — so adding a new permission to the system
 * leaves existing users WITHOUT it. The NCR / defect / variation routes now
 * gate reads on VIEW_COMPLIANCE and writes on MANAGE_COMPLIANCE; without
 * this backfill every existing SITE_MANAGER / CONTRACT_MANAGER would lose
 * access to compliance data the moment the gating ships.
 *
 * For each user we grant whichever of the two compliance permissions their
 * role's DEFAULT_PERMISSIONS now includes, skipping rows that already exist
 * (idempotent — safe to re-run). CEO / DIRECTOR / SUPER_ADMIN bypass every
 * gate in code, so the rows are belt-and-braces for them; CONTRACTOR gets
 * neither (external — must not see commercial compliance data).
 *
 *   npx tsx scripts/backfill-compliance-permissions.ts
 */

import { PrismaClient, type UserRole } from "@prisma/client";
import { DEFAULT_PERMISSIONS } from "../src/lib/permissions";

const prisma = new PrismaClient();

const NEW_PERMISSIONS = ["VIEW_COMPLIANCE", "MANAGE_COMPLIANCE"] as const;

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, role: true },
  });
  console.log(`Checking ${users.length} users for the compliance permissions…`);

  const rows: { userId: string; permission: string }[] = [];
  for (const u of users) {
    const roleDefaults = DEFAULT_PERMISSIONS[u.role as UserRole] ?? [];
    for (const perm of NEW_PERMISSIONS) {
      if (roleDefaults.includes(perm)) {
        rows.push({ userId: u.id, permission: perm });
      }
    }
  }

  if (rows.length === 0) {
    console.log("No users qualify for the compliance permissions. Done.");
    return;
  }

  // createMany + skipDuplicates relies on the @@unique([userId, permission])
  // constraint — re-running this only inserts rows that don't already exist.
  const result = await prisma.userPermission.createMany({
    data: rows,
    skipDuplicates: true,
  });
  console.log(
    `Granted ${result.count} new compliance permission row(s) ` +
      `(${rows.length} candidate grants across ${users.length} users; ` +
      `the rest already existed).`,
  );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
