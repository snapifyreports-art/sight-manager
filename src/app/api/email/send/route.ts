import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  sendEmail,
  deliveryConfirmedEmail,
  nextStageReadyEmail,
} from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { type, to, recipientName, data } = body as {
    type: "delivery_confirmed" | "next_stage_ready";
    to: string;
    recipientName: string;
    data: Record<string, string>;
  };

  if (!type || !to || !recipientName || !data) {
    return NextResponse.json(
      { error: "type, to, recipientName, and data are required" },
      { status: 400 }
    );
  }

  let subject: string;
  let html: string;

  if (type === "delivery_confirmed") {
    const template = deliveryConfirmedEmail({
      contractorName: recipientName,
      jobName: data.jobName || "",
      supplierName: data.supplierName || "",
      siteName: data.siteName || "",
      plotName: data.plotName || "",
    });
    subject = template.subject;
    html = template.html;
  } else if (type === "next_stage_ready") {
    const template = nextStageReadyEmail({
      contractorName: recipientName,
      completedJobName: data.completedJobName || "",
      nextJobName: data.nextJobName || "",
      siteName: data.siteName || "",
      plotName: data.plotName || "",
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
