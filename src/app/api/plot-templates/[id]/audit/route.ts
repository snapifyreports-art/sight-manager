import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/plot-templates/[id]/audit — list recent change-log events for a
// template. Newest first. Limit to 200 events to keep payload small;
// older history is still in the table if we ever need to surface a
// "show all" view.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const events = await prisma.templateAuditEvent.findMany({
    where: { templateId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(events);
}
