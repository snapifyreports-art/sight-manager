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
  // (Jun 2026 guardrail catch) The sign-in page is /login (auth.ts
  // pages.signIn) — /auth/signin doesn't exist and 404'd logged-out users.
  if (!session) redirect("/login");

  const { siteId } = await params;

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      <SiteWalkthrough siteId={siteId} />
    </div>
  );
}
