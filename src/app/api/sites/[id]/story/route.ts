import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { buildSiteStory } from "@/lib/site-story";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/sites/[id]/story
 *
 * Returns the structured Site Story payload — same synthesizer is used
 * by the Handover ZIP generator so the two artefacts can never drift.
 *
 * Query params:
 *   ?detail=full   include per-plot timeline highlights + quote board
 *                  (heavier payload — used by the printable view + ZIP).
 *                  Default omitted = compact payload for the Story tab.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    return NextResponse.json(
      { error: "You do not have access to this site" },
      { status: 403 },
    );
  }

  const url = new URL(req.url);
  const detail = url.searchParams.get("detail") === "full";

  try {
    const story = await buildSiteStory(prisma, id, {
      includeFullDetail: detail,
    });
    return NextResponse.json(story);
  } catch (err) {
    return apiError(err, "Failed to build site story");
  }
}
