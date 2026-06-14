import { Resend } from "resend";
import { getBranding, PLATFORM } from "@/lib/branding";

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

// (Jun 2026 white-label) The resolved branding the email layer needs. A small
// projection of CustomerBranding + the platform powered-by line, so callers
// don't pull the whole getBranding() shape into their HTML templates.
export interface EmailBranding {
  brandName: string;
  logoUrl: string | null;
  darkLogoUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  poweredBy: string;
}

/**
 * (Jun 2026 white-label) Resolve the branding the email templates render.
 * Wraps getBranding() (which reads the AppSettings singleton) and projects it
 * down to the handful of fields the HTML needs. Never throws — getBranding()
 * swallows DB errors and falls back to the platform defaults.
 */
export async function getEmailBranding(): Promise<EmailBranding> {
  const { customer, platform } = await getBranding();
  return {
    brandName: customer.brandName,
    logoUrl: customer.logoUrl,
    darkLogoUrl: customer.darkLogoUrl,
    primaryColor: customer.primaryColor,
    supportEmail: customer.supportEmail,
    poweredBy: platform.poweredBy,
  };
}

// (Jun 2026 white-label) Compose the FROM display name from the resolved
// brand while KEEPING the verified sending domain. We only swap the display
// name in front of the verified <local@domain> from EMAIL_FROM — the address
// itself (the part Resend has verified) is never touched, or deliverability
// breaks. Falls back to the platform name when unbranded.
function fromAddressFor(brandName: string): string {
  const configured = process.env.EMAIL_FROM || `${PLATFORM.name} <onboarding@resend.dev>`;
  // Pull the bare <local@domain> out of "Display Name <local@domain>" (or use
  // the whole string when it's already a bare address with no display name).
  const angle = configured.match(/<([^>]+)>/);
  const addr = angle ? angle[1].trim() : configured.trim();
  return `${brandName} <${addr}>`;
}

// (May 2026 audit B-P2-14) Escape user-controlled strings before
// interpolation into HTML template bodies. Snag descriptions, plot
// names, contractor names — any of these could in theory contain
// `<`, `"`, `&`, etc. and break or be exploited via the rendered
// HTML in the recipient's mail client (Resend delivers the body
// as-is). Modern clients strip <script> but `<img src=x
// onerror=...>` and CSS-based attacks vary by client. Cheaper to
// escape on output than to trust every consumer is sanitising
// at input.
// (Jun 2026 audit) Exported so the cron routes that build their email
// HTML locally (daily-email, daily-wrap, weekly-digest) follow the
// same policy instead of interpolating site/user names raw.
export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
  // (Jun 2026 white-label) Resolve branding once per send so the FROM
  // display name leads with the customer brand (verified domain kept).
  const branding = await getEmailBranding();
  const { data, error } = await resend.emails.send({
    from: fromAddressFor(branding.brandName),
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

/**
 * (Jun 2026 white-label) Render the branded email header — the customer's
 * logo if they've uploaded one, else their brand name as text. The header bg
 * is a dark gradient tinted with the brand primaryColor, so we prefer the
 * darkLogoUrl (light-on-dark artwork) when present.
 *
 * `subtitle` is an optional small line under the brand (e.g. "Password reset").
 * Exported so the cron / auth routes that build their own HTML share the exact
 * same chrome instead of hand-rolling a divergent header.
 */
export function emailHeader(branding: EmailBranding, subtitle?: string): string {
  const headerLogo = branding.darkLogoUrl || branding.logoUrl;
  const brandBlock = headerLogo
    ? `<img src="${escapeHtml(headerLogo)}" alt="${escapeHtml(branding.brandName)}" style="max-height:36px;max-width:220px;display:block;" />`
    : `<h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;">${escapeHtml(branding.brandName)}</h1>`;
  const subtitleBlock = subtitle
    ? `<p style="margin:4px 0 0;color:rgba(255,255,255,0.82);font-size:13px;">${escapeHtml(subtitle)}</p>`
    : "";
  const accent = branding.primaryColor;
  return `<div style="background:linear-gradient(135deg,${accent},${accent}cc);padding:24px 32px;">
      ${brandBlock}
      ${subtitleBlock}
    </div>`;
}

/**
 * (Jun 2026 white-label) Render the branded footer — a small "Powered by
 * Sight Manager" co-brand plus a "Questions? {supportEmail}" line when the
 * customer has set a support address. `extra` lets a template append a
 * context line (e.g. "daily brief for Friday 13 June").
 */
export function emailFooter(branding: EmailBranding, extra?: string): string {
  const supportLine = branding.supportEmail
    ? `<p style="margin:0 0 4px;color:#64748b;font-size:12px;">Questions? <a href="mailto:${escapeHtml(branding.supportEmail)}" style="color:#64748b;">${escapeHtml(branding.supportEmail)}</a></p>`
    : "";
  const extraLine = extra
    ? `<p style="margin:0 0 4px;color:#94a3b8;font-size:12px;">${escapeHtml(extra)}</p>`
    : "";
  return `<div style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
      ${extraLine}
      ${supportLine}
      <p style="margin:0;color:#cbd5e1;font-size:11px;">${escapeHtml(branding.poweredBy)}</p>
    </div>`;
}

function baseTemplate(content: string, branding: EmailBranding) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    ${emailHeader(branding)}
    <div style="padding:32px;">
      ${content}
    </div>
    ${emailFooter(branding)}
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
  branding,
}: {
  contractorName: string;
  jobName: string;
  supplierName: string;
  siteName: string;
  plotName: string;
  branding: EmailBranding;
}) {
  // Escape user-controlled strings before interpolating into the
  // HTML body — see escapeHtml() comment.
  const safeContractorName = escapeHtml(contractorName);
  const safeJobName = escapeHtml(jobName);
  const safeSupplierName = escapeHtml(supplierName);
  const safeSiteName = escapeHtml(siteName);
  const safePlotName = escapeHtml(plotName);
  return {
    subject: `Delivery Confirmed — ${jobName}`,
    html: baseTemplate(
      `
      <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Delivery Confirmed</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Hi ${safeContractorName},
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        A delivery from <strong>${safeSupplierName}</strong> has been confirmed for the following job:
      </p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:0 0 24px;">
        <p style="margin:0 0 4px;color:#0f172a;font-size:15px;font-weight:600;">${safeJobName}</p>
        <p style="margin:0;color:#64748b;font-size:13px;">${safeSiteName} &mdash; ${safePlotName}</p>
      </div>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
        Materials are now on site and ready for use.
      </p>
    `,
      branding,
    ),
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
  branding,
}: {
  contractorName: string;
  description: string;
  priority: string;
  location: string;
  plotName: string;
  siteName: string;
  photoUrls: string[];
  branding: EmailBranding;
}) {
  const priorityColors: Record<string, string> = {
    LOW: "#64748b",
    MEDIUM: "#d97706",
    HIGH: "#ea580c",
    CRITICAL: "#dc2626",
  };
  const color = priorityColors[priority] || "#d97706";

  // Escape user-controlled content. Photo URLs come from our own
  // Supabase signed-URL flow so they're trusted, but everything else
  // could in principle contain HTML.
  const safeContractor = escapeHtml(contractorName);
  const safeDescription = escapeHtml(description);
  const safeLocation = escapeHtml(location);
  const safeSiteName = escapeHtml(siteName);
  const safePlotName = escapeHtml(plotName);
  const safePriority = escapeHtml(priority);

  const photosHtml =
    photoUrls.length > 0
      ? `<div style="margin:16px 0;">
          ${photoUrls
            .map(
              (url) =>
                `<img src="${escapeHtml(url)}" alt="Snag photo" style="max-width:200px;max-height:150px;border-radius:6px;margin:4px;border:1px solid #e2e8f0;" />`
            )
            .join("")}
        </div>`
      : "";

  return {
    subject: `Snag Raised — ${siteName}, ${plotName}`,
    html: baseTemplate(
      `
      <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Snag Raised</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Hi ${safeContractor},
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        A snag has been raised that requires your attention:
      </p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 8px;color:#0f172a;font-size:15px;font-weight:600;">${safeDescription}</p>
        <p style="margin:0 0 4px;color:#64748b;font-size:13px;">${safeSiteName} &mdash; ${safePlotName}</p>
        ${location ? `<p style="margin:0 0 4px;color:#64748b;font-size:13px;">Location: ${safeLocation}</p>` : ""}
        <p style="margin:0;"><span style="display:inline-block;background:${color};color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;">${safePriority}</span></p>
      </div>
      ${photosHtml}
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
        Please review and address this issue at your earliest convenience.
      </p>
    `,
      branding,
    ),
  };
}

// (May 2026 Keith request) Toolbox-talk request email. Sent when a
// manager requests a talk (vs logging one already delivered) so the
// linked contractors get a heads-up with the topic, reason, due date,
// and any attached briefing docs/photos. Attachments are linked, not
// inlined — large RAMS PDFs would otherwise bloat the message.
export function toolboxTalkRequestedEmail({
  contractorName,
  topic,
  reason,
  requesterName,
  siteName,
  dueBy,
  attachments,
  branding,
}: {
  contractorName: string;
  topic: string;
  reason: string | null;
  requesterName: string;
  siteName: string;
  dueBy: string | null;
  attachments: Array<{ url: string; fileName: string }>;
  branding: EmailBranding;
}) {
  const safeContractor = escapeHtml(contractorName);
  const safeTopic = escapeHtml(topic);
  const safeReason = escapeHtml(reason ?? "");
  const safeRequester = escapeHtml(requesterName);
  const safeSite = escapeHtml(siteName);
  const safeDueBy = escapeHtml(dueBy ?? "");

  const reasonHtml = reason
    ? `<p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">${safeReason}</p>`
    : "";

  const dueHtml = dueBy
    ? `<p style="margin:0 0 4px;color:#92400e;font-size:13px;"><strong>Please complete by:</strong> ${safeDueBy}</p>`
    : "";

  const attachmentsHtml =
    attachments.length > 0
      ? `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:0 0 24px;">
          <p style="margin:0 0 8px;color:#0f172a;font-size:13px;font-weight:600;">Attachments</p>
          ${attachments
            .map(
              (a) =>
                `<p style="margin:0 0 4px;font-size:13px;"><a href="${escapeHtml(a.url)}" style="color:${branding.primaryColor};text-decoration:underline;">${escapeHtml(a.fileName)}</a></p>`,
            )
            .join("")}
        </div>`
      : "";

  return {
    subject: `Toolbox talk requested — ${topic}`,
    html: baseTemplate(
      `
      <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Toolbox Talk Requested</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Hi ${safeContractor},
      </p>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        <strong>${safeRequester}</strong> has requested a toolbox talk on
        <strong>${safeSite}</strong>:
      </p>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:0 0 16px;">
        <p style="margin:0 0 8px;color:#0f172a;font-size:15px;font-weight:600;">${safeTopic}</p>
        ${reasonHtml}
        ${dueHtml}
      </div>
      ${attachmentsHtml}
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
        Please review the topic, run the talk with your team, and confirm
        with the site manager once it's done.
      </p>
    `,
      branding,
    ),
  };
}

export function nextStageReadyEmail({
  contractorName,
  completedJobName,
  nextJobName,
  siteName,
  plotName,
  branding,
}: {
  contractorName: string;
  completedJobName: string;
  nextJobName: string;
  siteName: string;
  plotName: string;
  branding: EmailBranding;
}) {
  const safeContractor = escapeHtml(contractorName);
  const safeCompleted = escapeHtml(completedJobName);
  const safeNext = escapeHtml(nextJobName);
  const safeSite = escapeHtml(siteName);
  const safePlot = escapeHtml(plotName);
  return {
    subject: `Next Stage Ready — ${nextJobName}`,
    html: baseTemplate(
      `
      <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Next Stage Ready</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.6;">
        Hi ${safeContractor},
      </p>
      <p style="margin:0 0 24px;color:#475569;font-size:14px;line-height:1.6;">
        <strong>${safeCompleted}</strong> has been completed and signed off. The next stage is now ready to begin:
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:0 0 24px;">
        <p style="margin:0 0 4px;color:#166534;font-size:15px;font-weight:600;">${safeNext}</p>
        <p style="margin:0;color:#15803d;font-size:13px;">${safeSite} &mdash; ${safePlot}</p>
      </div>
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">
        Please review the job details and begin work at your earliest convenience.
      </p>
    `,
      branding,
    ),
  };
}
