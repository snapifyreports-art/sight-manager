import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ALL_PERMS = [
  "VIEW_DASHBOARD", "VIEW_TASKS", "VIEW_SITES", "VIEW_ORDERS", "VIEW_CONTACTS",
  "VIEW_EVENTS_LOG", "VIEW_ANALYTICS", "VIEW_SETTINGS", "VIEW_USERS",
  "SIGN_OFF_JOBS", "MANAGE_ORDERS", "EDIT_PROGRAMME", "DELETE_ITEMS", "MANAGE_USERS",
];
const SM_PERMS = ALL_PERMS.filter((p) => p !== "VIEW_USERS" && p !== "MANAGE_USERS");

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true } });
  for (const u of users) {
    const perms = u.role === "CEO" ? ALL_PERMS : SM_PERMS;
    for (const p of perms) {
      await prisma.userPermission.upsert({
        where: { userId_permission: { userId: u.id, permission: p } },
        create: { userId: u.id, permission: p },
        update: {},
      });
    }
    console.log(`${u.name}: ${perms.length} permissions set (${u.role})`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
