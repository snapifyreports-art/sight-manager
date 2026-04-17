import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSupabase, PHOTOS_BUCKET } from "@/lib/supabase";

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

  // Delete from Supabase Storage
  const urlParts = doc.url.split(`${PHOTOS_BUCKET}/`);
  if (urlParts.length > 1) {
    await getSupabase().storage.from(PHOTOS_BUCKET).remove([urlParts[1]]);
  }

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
}
