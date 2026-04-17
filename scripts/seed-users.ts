import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Setting up users...");

  // Define the 3 users
  const users = [
    { name: "Keith", email: "keith@sightmanager.com", password: "keith1234", role: "CEO" as const },
    { name: "Ryan", email: "ryan@sightmanager.com", password: "ryan123", role: "CEO" as const },
    { name: "Paul", email: "paul@sightmanager.com", password: "paul123", role: "SITE_MANAGER" as const },
  ];

  for (const u of users) {
    const hashed = await hash(u.password, 12);
    const existing = await prisma.user.findUnique({ where: { email: u.email } });

    if (existing) {
      await prisma.user.update({
        where: { email: u.email },
        data: { name: u.name, password: hashed, role: u.role },
      });
      console.log(`Updated: ${u.name} (${u.email})`);
    } else {
      await prisma.user.create({
        data: { name: u.name, email: u.email, password: hashed, role: u.role },
      });
      console.log(`Created: ${u.name} (${u.email})`);
    }
  }

  // Remove all other users (keep only the 3 above)
  const keepEmails = users.map((u) => u.email);
  const toRemove = await prisma.user.findMany({
    where: { email: { notIn: keepEmails } },
    select: { id: true, name: true, email: true },
  });

  if (toRemove.length > 0) {
    console.log(`\nRemoving ${toRemove.length} other users:`);
    for (const u of toRemove) {
      // Reassign any jobs/sites assigned to this user before deleting
      // Reassign references to the first admin (Keith)
      const keithUser = await prisma.user.findUnique({ where: { email: "keith@sightmanager.com" } });
      const reassignId = keithUser?.id || null;

      await prisma.job.updateMany({ where: { assignedToId: u.id }, data: { assignedToId: reassignId } });
      await prisma.snag.updateMany({ where: { assignedToId: u.id }, data: { assignedToId: reassignId } });
      await prisma.eventLog.updateMany({ where: { userId: u.id }, data: { userId: reassignId } });
      await prisma.jobAction.updateMany({ where: { userId: u.id }, data: { userId: reassignId! } });
      await prisma.userPermission.deleteMany({ where: { userId: u.id } });
      await prisma.site.updateMany({ where: { assignedToId: u.id }, data: { assignedToId: reassignId } });
      if (reassignId) {
        await prisma.site.updateMany({ where: { createdById: u.id }, data: { createdById: reassignId } });
      }
      // Clean up any remaining references
      try { await prisma.jobPhoto.updateMany({ where: { uploadedById: u.id }, data: { uploadedById: reassignId } }); } catch {}
      try { await prisma.snag.updateMany({ where: { resolvedById: u.id }, data: { resolvedById: reassignId } }); } catch {}
      try { await prisma.job.updateMany({ where: { signedOffById: u.id }, data: { signedOffById: reassignId } }); } catch {}
      // raisedById is not directly updatable via Prisma updateMany, use raw SQL
      try { await prisma.$executeRawUnsafe(`UPDATE "Snag" SET "raisedById" = $1 WHERE "raisedById" = $2`, reassignId, u.id); } catch {}
      // NotificationPreference
      try { await prisma.$executeRawUnsafe(`DELETE FROM "NotificationPreference" WHERE "userId" = $1`, u.id); } catch {}
      // PushSubscription
      try { await prisma.$executeRawUnsafe(`DELETE FROM "PushSubscription" WHERE "userId" = $1`, u.id); } catch {}

      console.log(`  - ${u.name} (${u.email})`);
    }

    await prisma.user.deleteMany({ where: { email: { notIn: keepEmails } } });
    console.log("Removed.");
  }

  console.log("\nDone! Login with:");
  console.log("  keith@sightmanager.com / keith1234 (Admin)");
  console.log("  ryan@sightmanager.com / ryan123 (Admin)");
  console.log("  paul@sightmanager.com / paul123 (Site Manager)");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
