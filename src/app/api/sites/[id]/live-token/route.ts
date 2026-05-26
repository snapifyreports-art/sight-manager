import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessSite } from "@/lib/site-access";
import { signLiveToken } from "@/lib/share-token";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * POST /api/sites/[id]/live-token
 *
 * Mints a signed long-lived token for the /live/[token] wall-cabin
 * dashboard. Default expiry is 5 years — the cabin TV stays pinned
 * to a single URL for the duration of a project, and rotation
 * happens via secret-key rotation rather than per-token lifetime.
 *
 * Returns the URL the admin should paste into the cabin browser.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { id } = await params;
    if (
      !(await canAccessSite(
        session.user.id,
        (session.user as { role: string }).role,
        id,
      ))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const exp = Date.now() + 5 * 365 * 24 * 60 * 60 * 1000;
    const token = signLiveToken({ siteId: id, exp });
    const origin = req.headers.get("origin") ?? "";
    const url = `${origin}/live/${token}`;
    return NextResponse.json({ token, url, exp });
  } catch (err) {
    return apiError(err, "Failed to mint live token");
  }
}
