import { Resend } from "resend";

// Lazy-init so the build doesn't crash when the env var is empty
let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY is not set");
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM_ADDRESS =
  process.env.EMAIL_FROM || "Sight Manager <onboarding@resend.dev>";

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("Email send error:", error);
    throw new Error(error.message);
  }

  return data;
}

// ---------- Email Templates ----------

function baseTemplate(content: string) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;">Sight Manager</h1>
    </div>
    <div style="padding:32px;">
      ${content}
    </div>
    <div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">Sent from Sight Manager</p>
    </div>
  </div>
</body>
</html>`;
}

export function deliveryConfirmedEmail({
  contractorName,
  jobName,
  supplierName,
  siteName,
  plotName,
}: {
  contractorName: string;
  jobName: string;
  supplierName: string;
  siteName: string;
  plotName: string;
}) {
  return {
    subject: `Delivery Confirmed — ${jobName}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Delivery Confirmed</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Hi ${contractorName},
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        A delivery from <strong>${supplierName}</strong> has been confirmed for the following job:
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:0 0 24px;">
        <p style="margin:0 0 4px;color:#0f172a;font-size:15px;font-weight:600;">${jobName}</p>
        <p style="margin:0;color:#64748b;font-size:13px;">${siteName} &mdash; ${plotName}</p>
      </div>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
        Materials are now on site and ready for use.
      </p>
    `),
  };
}

export function snagRaisedEmail({
  contractorName,
  description,
  priority,
  location,
  plotName,
  siteName,
  photoUrls,
}: {
  contractorName: string;
  description: string;
  priority: string;
  location: string;
  plotName: string;
  siteName: string;
  photoUrls: string[];
}) {
  const priorityColors: Record<string, string> = {
    LOW: "#64748b",
    MEDIUM: "#d97706",
    HIGH: "#ea580c",
    CRITICAL: "#dc2626",
  };
  const color = priorityColors[priority] || "#d97706";

  const photosHtml =
    photoUrls.length > 0
      ? `<div style="margin:16px 0;">
          ${photoUrls
            .map(
              (url) =>
                `<img src="${url}" alt="Snag photo" style="max-width:200px;max-height:150px;border-radius:6px;margin:4px;border:1px solid #e2e8f0;" />`
            )
            .join("")}
        </div>`
      : "";

  return {
    subject: `Snag Raised — ${siteName}, ${plotName}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Snag Raised</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Hi ${contractorName},
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        A snag has been raised that requires your attention:
      </p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 8px;color:#0f172a;font-size:15px;font-weight:600;">${description}</p>
        <p style="margin:0 0 4px;color:#64748b;font-size:13px;">${siteName} &mdash; ${plotName}</p>
        ${location ? `<p style="margin:0 0 4px;color:#64748b;font-size:13px;">Location: ${location}</p>` : ""}
        <p style="margin:0;"><span style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;">${priority}</span></p>
      </div>
      ${photosHtml}
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
        Please review and address this issue at your earliest convenience.
      </p>
    `),
  };
}

export function nextStageReadyEmail({
  contractorName,
  completedJobName,
  nextJobName,
  siteName,
  plotName,
}: {
  contractorName: string;
  completedJobName: string;
  nextJobName: string;
  siteName: string;
  plotName: string;
}) {
  return {
    subject: `Next Stage Ready — ${nextJobName}`,
    html: baseTemplate(`
      <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Next Stage Ready</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Hi ${contractorName},
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        <strong>${completedJobName}</strong> has been completed and signed off. The next stage is now ready to begin:
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:0 0 24px;">
        <p style="margin:0 0 4px;color:#166534;font-size:15px;font-weight:600;">${nextJobName}</p>
        <p style="margin:0;color:#15803d;font-size:13px;">${siteName} &mdash; ${plotName}</p>
      </div>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
        Please review the job details and begin work at your earliest convenience.
      </p>
    `),
  };
}
