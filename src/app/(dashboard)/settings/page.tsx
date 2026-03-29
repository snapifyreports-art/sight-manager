import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { templateJobsInclude } from "@/lib/template-includes";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const [templates, users] = await Promise.all([
    prisma.plotTemplate.findMany({
      orderBy: { createdAt: "desc" },
      include: { jobs: templateJobsInclude },
    }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, jobTitle: true, company: true, phone: true, createdAt: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serializedUsers = users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }));

  return (
    <SettingsClient
      user={{
        name: session.user.name ?? "",
        email: session.user.email ?? "",
        role: (session.user as { role: string }).role,
      }}
      templates={JSON.parse(JSON.stringify(templates))}
      users={serializedUsers}
      currentUserId={session.user.id}
    />
  );
}
