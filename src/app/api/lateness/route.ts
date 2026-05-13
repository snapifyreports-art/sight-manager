import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite, getUserSiteIds } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * GET /api/lateness?siteId=... | plotId=... | jobId=... | orderId=... | contactId=...
 *   &status=open|resolved|all      (default: open)
 *   &kind=JOB_END_OVERDUE|...      (optional filter)
 *
 * (#191) Single scoped read for every consumer:
 *   - Plot Detail / Job Detail / Site Story embeds (siteId | plotId | jobId)
 *   - Contractor scorecard (contactId — events attributed to them)
 *   - Analytics dashboards (siteId list or null)
 *
 * Returns enriched events with the names of associated job/order/contact
 * so callers don't need to join client-side.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const siteIdParam = url.searchParams.get("siteId");
  const plotIdParam = url.searchParams.get("plotId");
  const jobIdParam = url.searchParams.get("jobId");
  const orderIdParam = url.searchParams.get("orderId");
  const contactIdParam = url.searchParams.get("contactId");
  const statusParam = url.searchParams.get("status") ?? "open";
  const kindParam = url.searchParams.get("kind");

  // Scope check — caller must scope to something they can access.
  const userSiteIds = await getUserSiteIds(session.user.id, (session.user as { role: string }).role);

  const where: Record<string, unknown> = {};
  if (siteIdParam) {
    if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteIdParam))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    where.siteId = siteIdParam;
  } else if (plotIdParam) {
    const plot = await prisma.plot.findUnique({ where: { id: plotIdParam }, select: { siteId: true } });
    if (!plot || !(await canAccessSite(session.user.id, (session.user as { role: string }).role, plot.siteId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    where.plotId = plotIdParam;
  } else if (jobIdParam) {
    const job = await prisma.job.findUnique({ where: { id: jobIdParam }, select: { plot: { select: { siteId: true } } } });
    if (!job || !(await canAccessSite(session.user.id, (session.user as { role: string }).role, job.plot.siteId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    where.jobId = jobIdParam;
  } else if (orderIdParam) {
    where.orderId = orderIdParam;
    // Scope check via the order's site.
    const order = await prisma.materialOrder.findUnique({
      where: { id: orderIdParam },
      select: { siteId: true, job: { select: { plot: { select: { siteId: true } } } } },
    });
    const siteId = order?.siteId ?? order?.job?.plot?.siteId;
    if (!siteId || !(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (contactIdParam) {
    where.attributedContactId = contactIdParam;
    // Restrict to accessible sites so a regular user can't pull all
    // attribution history for a contractor working on other sites.
    if (userSiteIds !== null) where.siteId = { in: userSiteIds };
  } else {
    // No scope — default to user's accessible sites.
    if (userSiteIds !== null) where.siteId = { in: userSiteIds };
  }

  if (statusParam === "open") where.resolvedAt = null;
  else if (statusParam === "resolved") where.resolvedAt = { not: null };
  // "all" → no filter

  if (kindParam) where.kind = kindParam;

  const events = await prisma.latenessEvent.findMany({
    where,
    orderBy: [{ resolvedAt: { sort: "asc", nulls: "first" } }, { wentLateOn: "desc" }],
    include: {
      job: { select: { id: true, name: true } },
      plot: { select: { id: true, plotNumber: true, name: true } },
      order: {
        select: {
          id: true,
          itemsDescription: true,
          supplier: { select: { id: true, name: true } },
        },
      },
      attributedContact: { select: { id: true, name: true, company: true } },
      recordedBy: { select: { id: true, name: true } },
    },
    take: 200,
  });

  return NextResponse.json(events);
}

/**
 * POST /api/lateness/[id]/attribute is on a sub-route. POST here is
 * not needed — events are created server-side by the cron + the
 * various capture flows.
 */
export function POST() {
  return apiError(new Error("Use PATCH /api/lateness/[id] to attribute"), "Not allowed");
}
