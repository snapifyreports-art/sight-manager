import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { templateJobsInclude } from "@/lib/template-includes";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: initialTab } = await searchParams;
  const session = await auth();
  if (!session) redirect("/login");

  const [templates, users, sites] = await Promise.all([
    prisma.plotTemplate.findMany({
      // (May 2026 bug Keith reported) Filter out archived templates
      // by default — pre-fix the settings page server-loaded EVERY
      // template including archived ones, so "deleted" (= archived)
      // templates kept coming back on refresh. The PlotTemplatesSection
      // doesn't yet have a "Show archived" toggle; the soft-archive is
      // strictly hidden until that UI ships.
      where: { archivedAt: null },
      orderBy: { createdAt: "desc" },
      include: { jobs: templateJobsInclude },
    }),
    prisma.user.findMany({
      // (May 2026 audit S-P0) Active users only by default; the
      // "Show archived" toggle in UsersClient re-fetches with
      // ?include=archived for the restore flow.
      where: { archivedAt: null },
      select: { id: true, name: true, email: true, role: true, jobTitle: true, company: true, phone: true, archivedAt: true, createdAt: true },
      orderBy: { name: "asc" },
    }),
    prisma.site.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const serializedUsers = users.map((u) => ({
    ...u,
    archivedAt: u.archivedAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  }));

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
      sites={sites}
      initialTab={initialTab}
    />
  );
}
