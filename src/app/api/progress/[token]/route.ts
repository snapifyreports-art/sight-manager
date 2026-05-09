import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * PUBLIC, NO AUTH. The customer-facing plot progress endpoint.
 *
 * Hard rules — DO NOT WIDEN THE SELECT:
 *   - No dates leak to the customer (no startDate / endDate / actuals)
 *   - No snags, no orders, no materials, no contractors, no suppliers
 *   - No event logs
 *   - Photos are filtered to sharedWithCustomer=true ONLY
 *   - Top-level stages only (children are fetched but only their
 *     statuses are aggregated into the parent — no leaf-level detail)
 *
 * If you find yourself adding a field, ask: "could this field ever
 * carry bad news?" Bad news = anything that says "delayed", "snag",
 * "missing", "rejected", "going wrong". If so, don't add it.
 *
 * `Plot.shareEnabled` is checked before returning anything; flipping
 * it false in the admin UI revokes access instantly even if the
 * URL is already shared.
 */

// Customer-friendly status — three states only.
function aggregateStatus(jobs: { status: string }[]): "completed" | "in_progress" | "upcoming" {
  if (jobs.length === 0) return "upcoming";
  if (jobs.every((j) => j.status === "COMPLETED")) return "completed";
  if (jobs.some((j) => j.status === "IN_PROGRESS" || j.status === "COMPLETED")) return "in_progress";
  return "upcoming";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  // The narrowest possible select — every field below is intentional.
  // Reviewers: please scrutinise this select before approving any
  // change. Prisma's typed select is the security boundary here.
  const plot = await prisma.plot.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      plotNumber: true,
      houseType: true,
      shareEnabled: true,
      site: {
        select: {
          name: true,
          // Site location is a customer-friendly bit of context. No
          // postcode (could be sensitive). Just the site name.
        },
      },
      // Top-level jobs only (parentId IS NULL). Child statuses are
      // pulled into the parent's aggregate but never surfaced
      // individually — the customer milestone view is stage-only.
      jobs: {
        where: { parentId: null },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          status: true,
          // Children: status only, NO names / dates. Used purely to
          // decide whether the parent is "in progress" vs "upcoming".
          children: {
            select: { status: true },
          },
        },
      },
      journalEntries: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          // No author info — keep it impersonal / brand-feeling.
        },
      },
    },
  });

  if (!plot) {
    return NextResponse.json({ error: "This link isn't active" }, { status: 404 });
  }
  if (!plot.shareEnabled) {
    return NextResponse.json({ error: "This link isn't active" }, { status: 404 });
  }

  // Photos: only the ticked ones, across all jobs on this plot.
  // Separate query so the select stays trivially auditable.
  const photos = await prisma.jobPhoto.findMany({
    where: {
      sharedWithCustomer: true,
      job: { plotId: plot.id },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      caption: true,
      createdAt: true,
    },
  });

  // Build customer-friendly milestones from the top-level stages. We
  // include ALL top-level stages from the plot (which were created
  // from the template) so the milestone count matches what the
  // customer's house actually involves.
  const milestones = plot.jobs.map((j) => {
    const allChildStatuses = [j.status, ...j.children.map((c) => c.status)];
    return {
      id: j.id,
      name: j.name,
      status: aggregateStatus(
        j.children.length > 0
          ? j.children.map((c) => ({ status: c.status }))
          : [{ status: j.status }],
      ),
      // Hint for ordering / iconography — but no leaf-level detail
      _childCount: allChildStatuses.length,
    };
  });

  return NextResponse.json({
    plotNumber: plot.plotNumber,
    houseType: plot.houseType,
    siteName: plot.site.name,
    milestones,
    journalEntries: plot.journalEntries,
    photos,
  });
}
