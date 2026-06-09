import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getUserSiteIds } from "@/lib/site-access";
import { sessionHasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { InspectionsClient } from "@/components/inspections/InspectionsClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Inspections | Sight Manager" };

export default async function InspectionsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!sessionHasPermission(session.user, "VIEW_INSPECTIONS")) redirect("/dashboard");

  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  const where = siteIds !== null ? { plot: { siteId: { in: siteIds } } } : {};

  const inspections = await prisma.inspection.findMany({
    where,
    orderBy: [{ scheduledDate: "asc" }],
    include: {
      plot: { select: { id: true, name: true, plotNumber: true, siteId: true, site: { select: { name: true } } } },
      anchorJob: { select: { id: true, name: true } },
      inspector: { select: { id: true, name: true, company: true } },
      certificate: { select: { id: true, name: true, url: true } },
      _count: { select: { snags: true, ncrs: true } },
    },
  });

  const canManage = sessionHasPermission(session.user, "MANAGE_INSPECTIONS");

  return (
    <InspectionsClient
      initial={JSON.parse(JSON.stringify(inspections))}
      canManage={canManage}
    />
  );
}
