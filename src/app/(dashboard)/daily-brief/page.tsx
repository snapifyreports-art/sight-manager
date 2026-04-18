import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserSiteIds } from "@/lib/site-access";
import { redirect } from "next/navigation";
import { GlobalDailyBriefClient } from "@/components/reports/GlobalDailyBriefClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Daily Brief | Sight Manager" };

export default async function DailyBriefPage() {
  const session = await auth();
  if (!session) redirect("/login");

  // Scope to sites the user can access
  const siteIds = await getUserSiteIds(session.user.id, session.user.role);
  const accessFilter = siteIds !== null ? { id: { in: siteIds } } : {};

  const sites = await prisma.site.findMany({
    where: { ...accessFilter, status: { in: ["ACTIVE", "ON_HOLD"] } },
    select: { id: true, name: true, postcode: true, status: true },
    orderBy: { name: "asc" },
  });

  return <GlobalDailyBriefClient sites={sites} />;
}
