import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { buildSiteStory } from "@/lib/site-story";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

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
      // (Jun 2026 Q8) Story + Closure inspection blocks follow the same
      // permission boundary as the Brief and the inspections API.
      includeInspections: sessionHasPermission(
        session.user as { role?: string; permissions?: string[] },
        "VIEW_INSPECTIONS",
      ),
      // (Jun 2026 Wave-4 D9 leak fix) The compliance block carries variation
      // cost/time deltas + NCR/defect/cert detail — commercially sensitive.
      // Gate it on VIEW_COMPLIANCE so this aggregating route matches the
      // dedicated NCR/defect/variation APIs; without this a CONTRACTOR with
      // site access could fetch variation pricing straight off the story API.
      includeCompliance: sessionHasPermission(
        session.user as { role?: string; permissions?: string[] },
        "VIEW_COMPLIANCE",
      ),
    });
    return NextResponse.json(story);
  } catch (err) {
    return apiError(err, "Failed to build site story");
  }
}
