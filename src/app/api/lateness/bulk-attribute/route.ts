import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const VALID_REASONS = [
  "OTHER",
  "WEATHER_RAIN",
  "WEATHER_TEMPERATURE",
  "WEATHER_WIND",
  "MATERIAL_LATE",
  "MATERIAL_WRONG",
  "MATERIAL_SHORT",
  "LABOUR_NO_SHOW",
  "LABOUR_SHORT",
  "DESIGN_CHANGE",
  "SPEC_CLARIFICATION",
  "PREDECESSOR_LATE",
  "ACCESS_BLOCKED",
  "INSPECTION_FAILED",
] as const;

/**
 * POST /api/lateness/bulk-attribute
 *
 * Apply one reason / contractor / supplier / note to a list of
 * lateness event ids in a single round-trip. Used by the Daily Brief
 * "Set reason for all N" button — when 18 identical "Order not sent"
 * rows share a root cause, attributing them one-by-one was 18 clicks.
 *
 * Body: { ids: string[], reasonCode?, reasonNote?, attributedContactId?, attributedSupplierId? }
 *
 * All events must belong to sites the user can access. Permission
 * check mirrors the single-event PATCH (EDIT_PROGRAMME).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (
      !sessionHasPermission(
        session.user as { role?: string; permissions?: string[] },
        "EDIT_PROGRAMME",
      )
    ) {
      return NextResponse.json(
        { error: "You do not have permission to attribute lateness" },
        { status: 403 },
      );
    }

    const body = await req.json();
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: "ids must be a non-empty array" }, { status: 400 });
    }
    if (body.ids.length > 200) {
      return NextResponse.json({ error: "Up to 200 events per call" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.reasonCode !== undefined) {
      if (!VALID_REASONS.includes(body.reasonCode)) {
        return NextResponse.json(
          { error: `Invalid reasonCode. Must be one of: ${VALID_REASONS.join(", ")}` },
          { status: 400 },
        );
      }
      data.reasonCode = body.reasonCode;
    }
    if (body.reasonNote !== undefined) data.reasonNote = body.reasonNote;
    if (body.attributedContactId !== undefined) {
      data.attributedContactId = body.attributedContactId || null;
    }
    if (body.attributedSupplierId !== undefined) {
      data.attributedSupplierId = body.attributedSupplierId || null;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }
    data.recordedById = session.user.id;

    // Single round-trip: fetch all events + their siteIds, verify
    // access to every site touched, then updateMany. We deliberately
    // don't allow partial success — if the user can't access one of
    // the sites, the whole batch is rejected.
    const events = await prisma.latenessEvent.findMany({
      where: { id: { in: body.ids } },
      select: { id: true, siteId: true },
    });
    if (events.length !== body.ids.length) {
      return NextResponse.json(
        { error: "One or more lateness events not found" },
        { status: 404 },
      );
    }
    const uniqueSiteIds = Array.from(new Set(events.map((e) => e.siteId)));
    const role = (session.user as { role: string }).role;
    for (const siteId of uniqueSiteIds) {
      if (!(await canAccessSite(session.user.id, role, siteId))) {
        return NextResponse.json(
          { error: "Forbidden — one or more sites are outside your access" },
          { status: 403 },
        );
      }
    }

    const result = await prisma.latenessEvent.updateMany({
      where: { id: { in: body.ids } },
      data,
    });
    return NextResponse.json({ updated: result.count });
  } catch (err) {
    return apiError(err, "Failed to bulk-attribute lateness events");
  }
}
