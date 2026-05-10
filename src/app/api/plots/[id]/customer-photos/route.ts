import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * Photo curation for a plot's customer-share page.
 *
 * GET   — list every photo across all jobs on this plot, with each
 *         photo's `sharedWithCustomer` flag, ordered by createdAt desc.
 *         Used by the Customer view tab to render a tickable grid.
 * PATCH — bulk update share flags.
 *         body: { updates: Array<{ photoId, shared }> }
 */

async function authoriseAdmin(plotId: string) {
  const session = await auth();
  if (!session) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const plot = await prisma.plot.findUnique({
    where: { id: plotId },
    select: { id: true, siteId: true },
  });
  if (!plot) return { error: NextResponse.json({ error: "Plot not found" }, { status: 404 }) };

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, plot.siteId))) {
    return { error: NextResponse.json({ error: "You do not have access to this site" }, { status: 403 }) };
  }
  return { plot };
}

// GET — list photos for the plot
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await authoriseAdmin(id);
  if ("error" in result) return result.error;

  const photos = await prisma.jobPhoto.findMany({
    where: { job: { plotId: id } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      url: true,
      caption: true,
      tag: true,
      sharedWithCustomer: true,
      createdAt: true,
      job: { select: { id: true, name: true, stageCode: true } },
    },
  });
  return NextResponse.json(photos);
}

// PATCH — bulk toggle share flags
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await authoriseAdmin(id);
  if ("error" in result) return result.error;

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body?.updates)) {
    return NextResponse.json({ error: "updates array is required" }, { status: 400 });
  }

  const updates = body.updates.filter(
    (u: unknown) =>
      typeof u === "object" && u !== null &&
      typeof (u as { photoId: unknown }).photoId === "string" &&
      typeof (u as { shared: unknown }).shared === "boolean",
  ) as Array<{ photoId: string; shared: boolean }>;

  try {
    // Atomic batch — all-or-nothing — also enforces that every photo
    // we touch genuinely belongs to a job on THIS plot, so a malicious
    // payload can't toggle a different plot's photos.
    await prisma.$transaction(
      updates.map((u) =>
        prisma.jobPhoto.updateMany({
          where: { id: u.photoId, job: { plotId: id } },
          data: { sharedWithCustomer: u.shared },
        }),
      ),
    );

    // (May 2026 audit #196) If at least one photo was flipped to
    // sharedWithCustomer = true, fire a single customer push. We
    // dedupe by the operation rather than per-photo — a manager
    // bulk-sharing 12 photos at once shouldn't buzz the buyer 12
    // times. Best-effort, fire-and-forget.
    const sharedCount = updates.filter((u) => u.shared).length;
    if (sharedCount > 0) {
      void (async () => {
        try {
          const plot = await prisma.plot.findUnique({
            where: { id },
            select: { shareToken: true, shareEnabled: true },
          });
          if (plot?.shareToken && plot.shareEnabled) {
            const { sendPushToPlotCustomers } = await import("@/lib/push");
            await sendPushToPlotCustomers(id, {
              title: "📸 New photos of your home",
              body:
                sharedCount === 1
                  ? "A new photo was just added to your build."
                  : `${sharedCount} new photos were added to your build.`,
              url: `/progress/${plot.shareToken}`,
              tag: "customer-photos",
            });
          }
        } catch (err) {
          console.warn("[customer-photos] push failed:", err);
        }
      })();
    }

    return NextResponse.json({ success: true, count: updates.length });
  } catch (err) {
    return apiError(err, "Failed to update photo share flags");
  }
}
