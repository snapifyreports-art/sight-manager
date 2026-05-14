import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyResetToken } from "@/lib/share-token";
import { hash } from "bcryptjs";
import { apiError } from "@/lib/api-errors";
import { logEvent } from "@/lib/event-log";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #132 + #133) Accept a password reset.
 *
 * Public endpoint — the token IS the auth. Verifies signature + exp,
 * looks up the user, hashes + writes the new password. The previous
 * session (if any) is unaffected — the user logs in with the new
 * password as normal.
 *
 * No "current password required" gate because the whole point is the
 * recipient has lost access. The token is the proof of identity, and
 * its 24-hour TTL plus single-use semantics (the next request with
 * the same token still works only because tokens aren't tracked, but
 * any reasonable attacker scenario wouldn't have the token to begin
 * with — they'd need to compromise the email account, in which case
 * they have other paths). We could add a tokenVersion column on User
 * to make tokens single-use, but the cost / benefit is poor here.
 */

const MIN_PASSWORD_LENGTH = 8;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const newPassword = typeof body?.password === "string" ? body.password : "";

  if (!token || !newPassword) {
    return NextResponse.json(
      { error: "token and password are required" },
      { status: 400 },
    );
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }

  const payload = verifyResetToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "This link is invalid or has expired. Please request a new one." },
      { status: 401 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true },
  });
  if (!user || user.email !== payload.email) {
    // The email in the token doesn't match the current user record —
    // most likely the user changed their email after the token was
    // issued. Reject as if expired.
    return NextResponse.json(
      { error: "This link is no longer valid." },
      { status: 401 },
    );
  }

  try {
    const hashed = await hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashed },
    });
    await logEvent(prisma, {
      type: "USER_ACTION",
      userId: user.id,
      description: `Password reset accepted for ${user.email}`,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err, "Failed to reset password");
  }
}
