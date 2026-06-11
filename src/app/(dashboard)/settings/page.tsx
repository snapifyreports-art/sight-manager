import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { templateJobsInclude } from "@/lib/template-includes";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: initialTab } = await searchParams;
  const session = await auth();
  if (!session) redirect("/login");

  // (Jun 2026 audit) The full user directory (emails, phones, companies)
  // was server-loaded for EVERY authenticated visitor and rendered in
  // the Users tab — a CONTRACTOR (default permissions include
  // VIEW_SETTINGS but not VIEW_USERS) could open /settings → Users and
  // read every staff member's contact details. Only fetch users/sites
  // when the session can actually view user management, and hide the
  // tab entirely otherwise.
  const hasUsersAccess = sessionHasPermission(
    session.user as { role?: string; permissions?: string[] },
    "VIEW_USERS",
  );

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
      include: {
        jobs: templateJobsInclude,
        // (May 2026 Keith request) Variant rows feed the "N variants: …"
        // chip line on each template card. Pre-fix the query omitted
        // them, so `template.variants` was always undefined and the
        // chip line silently never rendered.
        variants: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            description: true,
            sortOrder: true,
          },
        },
      },
    }),
    hasUsersAccess
      ? prisma.user.findMany({
          // (May 2026 audit S-P0) Active users only by default; the
          // "Show archived" toggle in UsersClient re-fetches with
          // ?include=archived for the restore flow.
          where: { archivedAt: null },
          select: { id: true, name: true, email: true, role: true, jobTitle: true, company: true, phone: true, archivedAt: true, createdAt: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    hasUsersAccess
      ? prisma.site.findMany({
          select: { id: true, name: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
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
      hasUsersAccess={hasUsersAccess}
    />
  );
}
