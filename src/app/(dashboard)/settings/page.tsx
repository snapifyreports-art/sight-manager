import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { templateJobsInclude } from "@/lib/template-includes";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const templates = await prisma.plotTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      jobs: templateJobsInclude,
    },
  });

  return (
    <SettingsClient
      user={{
        name: session.user.name ?? "",
        email: session.user.email ?? "",
        role: (session.user as { role: string }).role,
      }}
      templates={JSON.parse(JSON.stringify(templates))}
    />
  );
}
