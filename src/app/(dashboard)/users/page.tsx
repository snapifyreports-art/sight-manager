import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionHasPermission } from "@/lib/permissions";
import { UsersClient } from "@/components/users/UsersClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Users | Sight Manager",
};

export default async function UsersPage() {
  const session = await auth();
  // (May 2026 audit B-5) sessionHasPermission gives SUPER_ADMIN/CEO/DIRECTOR
  // the role-based bypass — bare hasPermission would lock them out if
  // their UserPermission rows haven't been seeded.
  if (
    !session ||
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "MANAGE_USERS",
    )
  ) {
    redirect("/dashboard");
  }

  const [users, sites] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        jobTitle: true,
        company: true,
        phone: true,
        createdAt: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.site.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serialized = users.map((u) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <UsersClient
      users={serialized}
      currentUserId={session.user.id}
      sites={sites}
    />
  );
}
