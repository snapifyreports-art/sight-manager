/**
 * (#183) Flip WatchedSite semantics from opt-IN to opt-OUT.
 *
 * Before this change, a WatchedSite row meant "user subscribed to
 * site notifications". Default audience for `sendPushToSiteAudience`
 * was opt-in: only people who'd clicked the Watch star received
 * pushes. Result: notifications silently never reached users who
 * hadn't toggled Watch on.
 *
 * After the change, a WatchedSite row means "user MUTED notifications
 * for this site". Default audience is now opt-out: every user with
 * site access is included unless they have a WatchedSite row.
 *
 * The existing rows represent users who'd EXPLICITLY opted IN. Under
 * the new semantics those rows would silently MUTE the very users
 * who'd actively asked for notifications — the opposite of intent.
 *
 * So this script deletes all existing rows. After this:
 *   - Existing "watchers" are now in the default audience anyway.
 *   - They'll receive pushes (no row = subscribed).
 *   - If they later want to mute, they click the new toggle and a
 *     row gets created to represent the mute.
 *
 * Idempotent: re-running after the flip is a no-op (only deletes if
 * there's anything to delete).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.watchedSite.count();
  if (count === 0) {
    console.log("No WatchedSite rows — already clean.");
    return;
  }
  console.log(`Deleting ${count} legacy WatchedSite (opt-in) rows…`);
  await prisma.watchedSite.deleteMany({});
  console.log("Done. Users now default-subscribed to every site they have access to.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
