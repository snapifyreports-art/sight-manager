/**
 * (May 2026) Test-account seeder.
 *
 * Creates / refreshes ONE dedicated test login so the app can be
 * click-tested on the preview before a change is called done — closing
 * the gap where bugs were only ever caught by Keith eyeballing
 * production.
 *
 * Deliberately additive: unlike scripts/seed-users.ts this does NOT
 * remove or touch any other user — it only upserts `test@sightmanager
 * .com`.
 *
 * IMPORTANT — Keith runs this, not Claude. The password is YOUR choice
 * and is passed on the command line; the script never bakes in a
 * credential. Once you've run it, the account is yours to manage
 * (rotate the password, change the role, or archive it in Settings →
 * Users whenever you like).
 *
 *   npx tsx scripts/ensure-test-account.ts "<a-strong-password>" [ROLE]
 *
 * ROLE defaults to SITE_MANAGER (broad enough to exercise programme,
 * order and template flows). Pass CEO for full admin coverage.
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const TEST_EMAIL = "test@sightmanager.com";
const VALID_ROLES = [
  "CEO",
  "SITE_MANAGER",
  "CONTRACT_MANAGER",
  "CONTRACTOR",
] as const;
type Role = (typeof VALID_ROLES)[number];

async function main() {
  const password = process.argv[2];
  const roleArg = (process.argv[3] || "SITE_MANAGER").toUpperCase();

  if (!password || password.length < 8) {
    console.error(
      "\n✗ Pass a password (8+ chars) you choose:\n" +
        '    npx tsx scripts/ensure-test-account.ts "<a-strong-password>" [ROLE]\n' +
        `  ROLE is optional — one of ${VALID_ROLES.join(", ")} (default SITE_MANAGER).\n`,
    );
    process.exit(1);
  }
  if (!VALID_ROLES.includes(roleArg as Role)) {
    console.error(
      `\n✗ Unknown role "${roleArg}". Use one of: ${VALID_ROLES.join(", ")}\n`,
    );
    process.exit(1);
  }
  const role = roleArg as Role;

  const hashed = await hash(password, 12);
  const existing = await prisma.user.findUnique({
    where: { email: TEST_EMAIL },
  });

  if (existing) {
    await prisma.user.update({
      where: { email: TEST_EMAIL },
      data: { password: hashed, role, archivedAt: null },
    });
    console.log(`✓ Refreshed test account: ${TEST_EMAIL} (role ${role})`);
  } else {
    await prisma.user.create({
      data: {
        name: "Test Account",
        email: TEST_EMAIL,
        password: hashed,
        role,
      },
    });
    console.log(`✓ Created test account: ${TEST_EMAIL} (role ${role})`);
  }
  console.log(
    "  Use it to log into the preview / production for click-testing.\n" +
      "  Rotate or archive it any time in Settings → Users.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
