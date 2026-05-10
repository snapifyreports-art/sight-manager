import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessSite } from "@/lib/site-access";
import { signCalendarToken } from "@/lib/share-token";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #59 + #189) Mint a signed token + URL for the
 * .ics feed so the caller can subscribe in an external calendar
 * app. Requires session — the token bears the caller's userId so
 * access stays bound to who issued it.
 *
 * The route deliberately doesn't store the token anywhere; tokens
 * are stateless. Re-issuing on each call returns a fresh 1-year
 * exp without invalidating older ones (since we don't track them).
 * That's fine — the worst case is one user has multiple valid
 * subscription URLs, which has zero security impact and matches
 * how Apple/Google/Microsoft issue their own calendar tokens.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: siteId } = await params;
  if (
    !(await canAccessSite(
      session.user.id,
      (session.user as { role: string }).role,
      siteId,
    ))
  ) {
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 },
    );
  }

  const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
  const exp = Date.now() + ONE_YEAR_MS;
  const token = signCalendarToken({ userId: session.user.id, siteId, exp });

  const baseUrl =
    req.headers.get("origin") ??
    process.env.NEXTAUTH_URL ??
    "https://sight-manager.vercel.app";
  const url = `${baseUrl}/api/sites/${siteId}/calendar.ics?token=${token}`;

  return NextResponse.json({ url, expiresAt: new Date(exp).toISOString() });
}
