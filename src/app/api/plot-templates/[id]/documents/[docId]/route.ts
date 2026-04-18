import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// DELETE /api/plot-templates/[id]/documents/[docId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { docId } = await params;
  await prisma.templateDocument.delete({ where: { id: docId } });
  return NextResponse.json({ success: true });
}
