import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signContractorToken } from "@/lib/share-token";

export const dynamic = "force-dynamic";

// POST /api/sites/[id]/contractor-comms/share
// Body: { contactId: string, expiryDays?: number }
// Returns a shareable URL for that contractor's view of this site
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: siteId } = await params;
  const body = await req.json();
  const { contactId } = body;

  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, company: true },
  });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  // Permanent link — exp set to 10 years from now (effectively never expires)
  const exp = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
  const token = signContractorToken({ contactId, siteId, exp });

  const baseUrl = req.headers.get("origin") || process.env.NEXTAUTH_URL || "";
  const url = `${baseUrl}/contractor/${token}`;

  return NextResponse.json({
    token,
    url,
    contractor: { id: contact.id, name: contact.name, company: contact.company },
  });
}
