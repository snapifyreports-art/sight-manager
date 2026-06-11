import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";
import { canAccessSite } from "@/lib/site-access";
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
  // (Jun 2026 audit) Coherent 404 for sites the user can't access — the
  // data API already blocks, but the page rendered a fake-empty state.
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      siteId,
    ))
  ) {
    notFound();
  }

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden">
      <SiteWalkthrough siteId={siteId} />
    </div>
  );
}
