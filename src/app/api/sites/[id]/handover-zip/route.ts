import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessSite } from "@/lib/site-access";
import { buildHandoverArchive } from "@/lib/handover-zip";
import { logEvent } from "@/lib/event-log";

export const dynamic = "force-dynamic";

// Vercel/Lambda streaming-friendly. We return the Node Readable stream
// from the archiver as the response body so the ZIP is delivered as
// it's assembled — no full-buffer in memory.
export const maxDuration = 300; // 5 minutes — big sites with hundreds of photos

/**
 * POST /api/sites/[id]/handover-zip
 *
 * Streams the Site Handover ZIP. Triggered by the Site Manager from
 * the Site Closure tab when the site is ready to hand over internally.
 *
 * Auth: any user with site access can generate. The download itself
 * is the action — there's no separate "this was generated" record
 * (EventLog gets a row so we know who triggered it and when).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const site = await prisma.site.findUnique({
    where: { id },
    select: { id: true, name: true, status: true },
  });
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

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

  const triggeredByUserName =
    (session.user as { name?: string }).name ?? "Unknown user";

  // Audit: log the generation BEFORE we start streaming so the event
  // is captured even if the download is cancelled mid-flight.
  await logEvent(prisma, {
    type: "USER_ACTION",
    siteId: id,
    userId: session.user.id,
    description: `Generated handover ZIP for "${site.name}" (status: ${site.status})`,
    detail: { action: "handover-zip-generated", siteStatus: site.status },
  }).catch((err) => {
    console.warn("[handover-zip] failed to write audit event:", err);
  });

  const archive = await buildHandoverArchive({
    prisma,
    siteId: id,
    triggeredByUserName,
  });

  // archiver implements Readable. Bridge to a web ReadableStream so we
  // can hand it to NextResponse — Next 16 supports streamed bodies.
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => {
        controller.enqueue(new Uint8Array(chunk));
      });
      archive.on("end", () => controller.close());
      archive.on("error", (err) => controller.error(err));
      archive.finalize().catch((err) => controller.error(err));
    },
  });

  const filename = `SiteHandover_${site.name.replace(/\s+/g, "_")}_${
    new Date().toISOString().slice(0, 10)
  }.zip`;

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
