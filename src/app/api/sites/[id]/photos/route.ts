import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #154) GET /api/sites/[id]/photos
 *
 * Aggregated photo gallery for a whole site. Pulls every JobPhoto on
 * every plot, with enough metadata for the album UI to group by stage
 * / plot / day and to drill into the originating job.
 *
 * Pagination: simple ?cursor=<photoId>&limit=N keyset pagination,
 * default 60 per page. We don't expect a single site to exceed a few
 * thousand photos but the cursor pattern means it's safe even if it
 * does.
 */
export async function GET(
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

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor");
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit") ?? "60") || 60, 1),
    200,
  );

  const photos = await prisma.jobPhoto.findMany({
    where: { job: { plot: { siteId } } },
    take: limit + 1, // peek for next-page detection
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      caption: true,
      tag: true,
      sharedWithCustomer: true,
      createdAt: true,
      job: {
        select: {
          id: true,
          name: true,
          stageCode: true,
          plot: {
            select: {
              id: true,
              name: true,
              plotNumber: true,
            },
          },
        },
      },
      uploadedBy: { select: { name: true } },
    },
  });

  const hasMore = photos.length > limit;
  const items = hasMore ? photos.slice(0, limit) : photos;

  return NextResponse.json({
    photos: items.map((p) => ({
      id: p.id,
      url: p.url,
      caption: p.caption,
      tag: p.tag,
      sharedWithCustomer: p.sharedWithCustomer,
      createdAt: p.createdAt.toISOString(),
      jobId: p.job.id,
      jobName: p.job.name,
      stageCode: p.job.stageCode,
      plotId: p.job.plot.id,
      plotName: p.job.plot.name,
      plotNumber: p.job.plot.plotNumber,
      uploadedBy: p.uploadedBy?.name ?? null,
    })),
    nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
  });
}
