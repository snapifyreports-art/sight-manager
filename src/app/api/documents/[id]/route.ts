import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";
import { canAccessSite } from "@/lib/site-access";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// DELETE /api/documents/[id] — delete a document
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const doc = await prisma.siteDocument.findUnique({ where: { id } });
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Access check:
  //   - Site-scoped docs: caller must have access to the site
  //   - Contact-scoped docs (RAMS — siteId null, contactId set): any
  //     authenticated user (no site to scope against). Admins + managers
  //     both reach the Contractor Comms view where delete is triggered.
  if (doc.siteId) {
    if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, doc.siteId))) {
      return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
    }
  }

  try {
    // Delete from Supabase Storage
    const urlParts = doc.url.split(`${PHOTOS_BUCKET}/`);
    if (urlParts.length > 1) {
      await getSupabase().storage.from(PHOTOS_BUCKET).remove([urlParts[1]]);
    }

    // (#36) Auto-uncheck any HandoverChecklist row that referenced this
    // document — schema is `documentId SetNull on delete`, but the
    // checklist would otherwise keep its `checkedAt` / `checkedById`
    // tick even though the cert is gone, making a plot look ready
    // for handover when it isn't.
    await prisma.handoverChecklist.updateMany({
      where: { documentId: id },
      data: { documentId: null, checkedAt: null, checkedById: null },
    });

    await prisma.siteDocument.delete({ where: { id } });

    await prisma.eventLog.create({
      data: {
        type: "USER_ACTION",
        description: `Document "${doc.name}" deleted`,
        siteId: doc.siteId,
        plotId: doc.plotId,
        jobId: doc.jobId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete document");
  }
}
