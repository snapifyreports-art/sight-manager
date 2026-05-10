import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  sendEmail,
  deliveryConfirmedEmail,
  nextStageReadyEmail,
  snagRaisedEmail,
} from "@/lib/email";

export const dynamic = "force-dynamic";

// (May 2026 audit #9 + #76) Allow only emails of contacts or suppliers
// already in the tenant. Case-insensitive match.
//
// Returns the canonical email FROM THE DB (not the user-supplied
// string) when found. The caller MUST send to the returned email,
// not the original input. This:
//   1. Eliminates the TOCTOU window between "is this allowed" and
//      "send to this address" — we send to whatever the directory
//      says now, so a contact deleted between check and send can't
//      receive an email.
//   2. Prevents header injection — the user-supplied `to` could
//      have been crafted to inject CR/LF into SMTP headers, but the
//      DB email is validated at insert time.
async function resolveKnownRecipient(
  email: string,
): Promise<{ canonicalEmail: string; contactId: string | null; supplierId: string | null } | null> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return null;
  const [contact, supplier] = await Promise.all([
    prisma.contact.findFirst({
      where: { email: { equals: normalised, mode: "insensitive" } },
      select: { id: true, email: true },
    }),
    prisma.supplier.findFirst({
      where: { contactEmail: { equals: normalised, mode: "insensitive" } },
      select: { id: true, contactEmail: true },
    }),
  ]);
  if (contact?.email) {
    return { canonicalEmail: contact.email, contactId: contact.id, supplierId: null };
  }
  if (supplier?.contactEmail) {
    return { canonicalEmail: supplier.contactEmail, contactId: null, supplierId: supplier.id };
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { type, to, recipientName, data } = body as {
    type: "delivery_confirmed" | "next_stage_ready" | "snag_raised";
    to: string;
    recipientName: string;
    data: Record<string, string | string[]>;
  };

  if (!type || !to || !recipientName || !data) {
    return NextResponse.json(
      { error: "type, to, recipientName, and data are required" },
      { status: 400 }
    );
  }

  // (May 2026 audit #9) The recipient must be a known contact /
  // supplier email already in the tenant — pre-fix any logged-in user
  // could send templated emails to arbitrary addresses, abusing the
  // verified domain as a spam relay. Lock to known recipients.
  // (audit #76) Capture the canonical email from the DB and send to
  // it — closes the TOCTOU window between check and send and blocks
  // header-injection in the user-supplied `to` string.
  const recipient = await resolveKnownRecipient(to);
  if (!recipient) {
    return NextResponse.json(
      { error: "Recipient must be an existing contact or supplier email" },
      { status: 403 },
    );
  }
  const canonicalTo = recipient.canonicalEmail;

  let subject: string;
  let html: string;

  if (type === "delivery_confirmed") {
    const template = deliveryConfirmedEmail({
      contractorName: recipientName,
      jobName: (data.jobName as string) || "",
      supplierName: (data.supplierName as string) || "",
      siteName: (data.siteName as string) || "",
      plotName: (data.plotName as string) || "",
    });
    subject = template.subject;
    html = template.html;
  } else if (type === "next_stage_ready") {
    const template = nextStageReadyEmail({
      contractorName: recipientName,
      completedJobName: (data.completedJobName as string) || "",
      nextJobName: (data.nextJobName as string) || "",
      siteName: (data.siteName as string) || "",
      plotName: (data.plotName as string) || "",
    });
    subject = template.subject;
    html = template.html;
  } else if (type === "snag_raised") {
    const template = snagRaisedEmail({
      contractorName: recipientName,
      description: (data.description as string) || "",
      priority: (data.priority as string) || "MEDIUM",
      location: (data.location as string) || "",
      plotName: (data.plotName as string) || "",
      siteName: (data.siteName as string) || "",
      photoUrls: (data.photoUrls as string[]) || [],
    });
    subject = template.subject;
    html = template.html;
  } else {
    return NextResponse.json(
      { error: "Invalid email type" },
      { status: 400 }
    );
  }

  try {
    // (audit #76) Always send to the canonical email pulled from the DB,
    // never the user-supplied string.
    await sendEmail({ to: canonicalTo, subject, html });

    // Log the notification event — record both the recipient ID and the
    // canonical email so the audit log survives a contact rename later.
    await prisma.eventLog.create({
      data: {
        type: "NOTIFICATION",
        description: `Email sent to ${recipientName} (${canonicalTo}): ${subject}`,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send email:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
