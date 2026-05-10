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

// (May 2026 audit #9) Allow only emails of contacts or suppliers
// already in the tenant. Case-insensitive match.
async function isKnownRecipient(email: string): Promise<boolean> {
  const normalised = email.trim().toLowerCase();
  if (!normalised) return false;
  const [contact, supplier] = await Promise.all([
    prisma.contact.findFirst({
      where: { email: { equals: normalised, mode: "insensitive" } },
      select: { id: true },
    }),
    prisma.supplier.findFirst({
      where: { contactEmail: { equals: normalised, mode: "insensitive" } },
      select: { id: true },
    }),
  ]);
  return !!(contact || supplier);
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
  const isKnown = await isKnownRecipient(to);
  if (!isKnown) {
    return NextResponse.json(
      { error: "Recipient must be an existing contact or supplier email" },
      { status: 403 },
    );
  }

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
    await sendEmail({ to, subject, html });

    // Log the notification event
    await prisma.eventLog.create({
      data: {
        type: "NOTIFICATION",
        description: `Email sent to ${recipientName} (${to}): ${subject}`,
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
