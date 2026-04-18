import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// DELETE /api/plot-templates/[id]/documents/[docId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { docId } = await params;
  try {
    await prisma.templateDocument.delete({ where: { id: docId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return apiError(err, "Failed to delete template document");
  }
}
