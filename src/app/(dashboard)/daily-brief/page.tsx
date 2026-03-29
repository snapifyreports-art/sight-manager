import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { GlobalDailyBriefClient } from "@/components/reports/GlobalDailyBriefClient";

export const dynamic = "force-dynamic";

export const metadata = { title: "Daily Brief | Sight Manager" };

export default async function DailyBriefPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const sites = await prisma.site.findMany({
    where: { status: { in: ["ACTIVE", "ON_HOLD"] } },
    select: { id: true, name: true, postcode: true, status: true },
    orderBy: { name: "asc" },
  });

  return <GlobalDailyBriefClient sites={sites} />;
}
