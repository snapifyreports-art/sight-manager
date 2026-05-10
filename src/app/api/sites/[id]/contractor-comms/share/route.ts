import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { signContractorToken } from "@/lib/share-token";
import { canAccessSite } from "@/lib/site-access";

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

  if (!(await canAccessSite(session.user.id, (session.user as { role: string }).role, siteId))) {
    return NextResponse.json({ error: "You do not have access to this site" }, { status: 403 });
  }
  const body = await req.json();
  const { contactId, expiryDays } = body as { contactId?: string; expiryDays?: number };

  if (!contactId) return NextResponse.json({ error: "contactId is required" }, { status: 400 });

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, company: true },
  });
  if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });

  // (May 2026 audit #10 + #30 + #144) Caller can choose expiry.
  // Default 10 years preserves the pre-fix "permanent link" feel for
  // existing UI flows that don't pass a value, but the verifier now
  // honours exp so any new caller can request a 30-day, 90-day, etc.
  // window. Hard cap at 10 years to stop a typo creating a forever
  // token.
  const TEN_YEARS_DAYS = 10 * 365;
  const days = (() => {
    if (typeof expiryDays !== "number" || !Number.isFinite(expiryDays)) {
      return TEN_YEARS_DAYS;
    }
    if (expiryDays < 1) return 1;
    if (expiryDays > TEN_YEARS_DAYS) return TEN_YEARS_DAYS;
    return Math.floor(expiryDays);
  })();
  const exp = Date.now() + days * 24 * 60 * 60 * 1000;
  const token = signContractorToken({ contactId, siteId, exp });

  const baseUrl = req.headers.get("origin") || process.env.NEXTAUTH_URL || "";
  const url = `${baseUrl}/contractor/${token}`;

  return NextResponse.json({
    token,
    url,
    expiresAt: new Date(exp).toISOString(),
    contractor: { id: contact.id, name: contact.name, company: contact.company },
  });
}
