import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signResetToken } from "@/lib/share-token";
import { sendEmail } from "@/lib/email";
import { logEvent } from "@/lib/event-log";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #132 + #133) Request a password-reset / invite link.
 *
 * Public endpoint — no auth needed. Accepts an email; if a user exists,
 * signs a reset token (24-hour expiry) and emails them a link. ALWAYS
 * returns the same generic 200 response regardless of whether the
 * email matched, so an attacker can't enumerate accounts by probing.
 *
 * Doubles as an admin-triggered "resend invite" — the only difference
 * is who initiated the request. The token + URL + email are identical.
 *
 * Rate-limit at the edge / Vercel layer (no in-process counter here);
 * abuse would be expensive (Resend bills per email) but functionally
 * harmless because the recipient's session isn't affected.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

  // Always respond the same way to prevent account enumeration.
  const generic = NextResponse.json({
    ok: true,
    message: "If that email is registered, a reset link is on its way.",
  });

  if (!email || !email.includes("@")) {
    return generic;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });
  if (!user) {
    return generic;
  }

  const exp = Date.now() + ONE_DAY_MS;
  const token = signResetToken({ userId: user.id, email: user.email, exp });

  const baseUrl =
    req.headers.get("origin") ??
    process.env.NEXTAUTH_URL ??
    "https://sight-manager.vercel.app";
  const url = `${baseUrl}/reset-password/${token}`;

  try {
    await sendEmail({
      to: user.email,
      subject: "Reset your Sight Manager password",
      html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:540px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;">Sight Manager</h1>
      <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">Password reset</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;color:#0f172a;font-size:14px;">Hi ${user.name},</p>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.55;">Click the button below to set a new password. The link expires in 24 hours.</p>
      <div style="margin:24px 0;text-align:center;">
        <a href="${url}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Set new password</a>
      </div>
      <p style="margin:16px 0 0;color:#64748b;font-size:12px;line-height:1.55;">If you didn't request this, you can safely ignore this email — your current password isn't changing.</p>
    </div>
  </div>
</body>
</html>`,
    });
  } catch (err) {
    console.error("[request-reset] sendEmail failed:", err);
    // (May 2026 audit B-P1-16) Persist the failure to EventLog so a
    // monitoring scan can alert. Pre-fix the only signal was a
    // console.error in Lambda logs — operators had no visible trail
    // when Resend rate-limited / domain wasn't verified / API key
    // was missing. Same pattern as the daily-email cron's failure
    // logging.
    const msg = err instanceof Error ? err.message : String(err);
    await logEvent(prisma, {
      type: "NOTIFICATION",
      description: `Password reset / invite email FAILED for ${user.email}: ${msg.slice(0, 200)}`,
      userId: user.id,
    }).catch(() => {
      /* don't compound the failure */
    });
    // Still return generic — don't leak whether the send succeeded.
  }

  return generic;
}
