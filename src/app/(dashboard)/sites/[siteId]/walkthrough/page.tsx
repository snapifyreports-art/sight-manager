import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import SiteWalkthrough from "@/components/walkthrough/SiteWalkthrough";

export const dynamic = "force-dynamic";

export default async function WalkthroughPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/auth/signin");

  const { siteId } = await params;

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      <SiteWalkthrough siteId={siteId} />
    </div>
  );
}
