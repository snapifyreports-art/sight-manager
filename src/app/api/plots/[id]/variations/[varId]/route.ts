import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";
import { logEvent } from "@/lib/event-log";
import { sendPushToSiteAudience } from "@/lib/push";

export const dynamic = "force-dynamic";

async function authoriseByPlot(plotId: string, requiredPermission?: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { siteId: true },
  });
  if (!plot) return { error: NextResponse.json({ error: "Plot not found" }, { status: 404 }) };
  if (
    !(await canAccessSite(session.user.id, (session.user as { role: string }).role, plot.siteId))
  ) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  if (
    requiredPermission &&
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      requiredPermission,
    )
  ) {
    return {
      error: NextResponse.json(
        { error: `You do not have permission (${requiredPermission})` },
        { status: 403 },
      ),
    };
  }
  return { session, siteId: plot.siteId };
}

/** Short "(+£40k, +15d)" impact suffix for Site Log descriptions. */
function variationImpact(costDelta: number | null, daysDelta: number | null): string {
  const parts: string[] = [];
  if (typeof costDelta === "number" && costDelta !== 0) {
    parts.push(`${costDelta > 0 ? "+" : "−"}£${Math.abs(costDelta).toLocaleString("en-GB")}`);
  }
  if (typeof daysDelta === "number" && daysDelta !== 0) {
    parts.push(`${daysDelta > 0 ? "+" : "−"}${Math.abs(daysDelta)}d`);
  }
  return parts.length > 0 ? ` (${parts.join(", ")})` : "";
}

const VARIATION_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "IMPLEMENTED"];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; varId: string }> },
) {
  const { id, varId } = await params;
  // (Jun 2026 Wave-4 D9) Editing / approving a variation now requires
  // MANAGE_COMPLIANCE.
  const a = await authoriseByPlot(id, "MANAGE_COMPLIANCE");
  if ("error" in a) return a.error;

  // (Jun 2026 audit IDOR) The child must belong to the plot in the URL.
  // Pre-fix a caller with access to ANY site could pair their own plot
  // id with a foreign varId and edit commercial sign-off records on
  // sites they can't see.
  const existing = await prisma.variation.findUnique({
    where: { id: varId },
    select: { plotId: true },
  });
  if (!existing || existing.plotId !== id) {
    return NextResponse.json({ error: "Variation not found" }, { status: 404 });
  }

  const body = await req.json();
  // (Jun 2026 audit) Validate status against the enum up front — a
  // typo'd client value previously reached Prisma and 500'd via apiError.
  if ("status" in body && !VARIATION_STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: `status must be one of: ${VARIATION_STATUSES.join(", ")}` },
      { status: 400 },
    );
  }

  const data: Record<string, unknown> = {};
  // (Jun 2026 audit) title is a required column — skip empty values
  // instead of nulling them (`title: ""` previously 500'd in Prisma).
  if ("title" in body && typeof body.title === "string" && body.title.trim()) {
    data.title = body.title;
  }
  for (const key of ["description", "requestedBy"]) {
    if (key in body) data[key] = body[key] || null;
  }
  if ("costDelta" in body) data.costDelta = body.costDelta;
  if ("daysDelta" in body) data.daysDelta = body.daysDelta;
  if ("status" in body) {
    data.status = body.status;
    if (body.status === "APPROVED") {
      data.approvedAt = new Date();
      data.approvedById = a.session.user.id;
    } else if (body.status !== "IMPLEMENTED") {
      // (Jun 2026 audit) Moving back to REQUESTED/REJECTED clears the
      // approval stamp — pre-fix a rejected variation still showed
      // "Approved by X on date" under a REJECTED badge (PlotQualityPanel
      // renders the line whenever approvedAt is set). IMPLEMENTED keeps
      // it: an implemented variation was approved.
      data.approvedAt = null;
      data.approvedById = null;
    }
  }

  try {
    const v = await prisma.variation.update({ where: { id: varId }, data });
    // (Jun 2026 Wave-4 B18) Log the commercial decision to the Site Log so a
    // director sees an approved/rejected variation (and its cost/time impact)
    // in the Events Log + Story timeline. Only on the meaningful transitions.
    if (body.status === "APPROVED" || body.status === "REJECTED") {
      const impact = variationImpact(v.costDelta, v.daysDelta);
      await logEvent(prisma, {
        // (Jun 2026 Wave-4 S10) The approve/reject decision shares the
        // variation Site Log category so the log filter shows the whole
        // variation lifecycle, not just the raise.
        type: "VARIATION_RAISED",
        siteId: a.siteId,
        plotId: id,
        userId: a.session.user.id,
        description: `Variation ${v.ref} ${v.status.toLowerCase()}: "${v.title}"${impact}`,
        detail: { variationId: v.id, ref: v.ref, status: v.status },
      });
      // (Jun 2026 Wave-4 D12) Push the commercial decision to the site
      // audience — an approved/rejected variation moves budget + end date.
      // Mutable via the VARIATION_RAISED toggle. Best-effort.
      const plotForPush = await prisma.plot.findUnique({
        where: { id },
        select: { plotNumber: true, name: true, site: { select: { name: true } } },
      });
      const plotLabel = plotForPush?.plotNumber
        ? `Plot ${plotForPush.plotNumber}`
        : plotForPush?.name ?? "A plot";
      await sendPushToSiteAudience(a.siteId, "VARIATION_RAISED", {
        title: `Variation ${v.status.toLowerCase()}`,
        body: `${v.ref} on ${plotLabel}${plotForPush?.site?.name ? ` (${plotForPush.site.name})` : ""}: "${v.title}"${impact}`,
        url: `/sites/${a.siteId}?tab=variations`,
        tag: `variation-${v.id}`,
      }).catch(() => {});
    }
    return NextResponse.json(v);
  } catch (err) {
    return apiError(err, "Failed to update variation");
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; varId: string }> },
) {
  const { id, varId } = await params;
  const a = await authoriseByPlot(id, "DELETE_ITEMS");
  if ("error" in a) return a.error;
  try {
    // (Jun 2026 audit IDOR) deleteMany with both conditions — 404 when
    // the variation doesn't belong to the plot in the URL, instead of
    // hard-deleting another site's commercial record.
    const deleted = await prisma.variation.deleteMany({
      where: { id: varId, plotId: id },
    });
    if (deleted.count === 0) {
      return NextResponse.json({ error: "Variation not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to delete variation");
  }
}
