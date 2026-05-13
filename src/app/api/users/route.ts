import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { sessionHasPermission, DEFAULT_PERMISSIONS } from "@/lib/permissions";
import type { UserRole } from "@prisma/client";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

// GET — list all users
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // (May 2026 audit B-5) sessionHasPermission understands the
  // SUPER_ADMIN / CEO / DIRECTOR role-based bypass. The bare
  // hasPermission(permissions, ...) form fails for execs whose
  // UserPermission rows haven't been seeded, locking them out of
  // user-management despite the role being designed to bypass.
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "MANAGE_USERS",
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // (May 2026 audit S-P0) Filter archived users out by default. Pass
  // `?include=archived` to see ex-staff (used by the Users UI's
  // "Show archived" toggle so admins can restore an account).
  const includeArchived = new URL(req.url).searchParams.get("include") === "archived";

  const users = await prisma.user.findMany({
    where: includeArchived ? {} : { archivedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      jobTitle: true,
      company: true,
      phone: true,
      archivedAt: true,
      createdAt: true,
    },
    orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
  });

  return NextResponse.json(users);
}

// POST — create a new user
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // (May 2026 audit B-5) sessionHasPermission understands the
  // SUPER_ADMIN / CEO / DIRECTOR role-based bypass. The bare
  // hasPermission(permissions, ...) form fails for execs whose
  // UserPermission rows haven't been seeded, locking them out of
  // user-management despite the role being designed to bypass.
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "MANAGE_USERS",
    )
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, email, password, role, jobTitle, company, phone } = body;

  if (!name || !email || !password || !role) {
    return NextResponse.json(
      { error: "name, email, password, and role are required" },
      { status: 400 }
    );
  }

  // Check for duplicate email
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "A user with that email already exists" },
      { status: 409 }
    );
  }

  const hashedPassword = await hash(password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        jobTitle: jobTitle || null,
        company: company || null,
        phone: phone || null,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        jobTitle: true,
        company: true,
        phone: true,
        createdAt: true,
      },
    });

    // Populate default permissions for this role
    const defaults = DEFAULT_PERMISSIONS[role as UserRole] || [];
    if (defaults.length > 0) {
      await prisma.userPermission.createMany({
        data: defaults.map((p) => ({ userId: user.id, permission: p })),
        skipDuplicates: true,
      });
    }

    // (May 2026 audit O-2) Fire an invite email so the new user has a
    // self-service path to set their own password. Pre-fix the admin
    // had to "verbally share" the password they just set — terrible UX
    // and a security risk (passwords shared via Slack/email/post-it).
    // Best-effort: failure here doesn't fail user creation. Uses the
    // same reset-token flow as forgot-password since the URL + token
    // semantics are identical (request-reset's own comment says so).
    try {
      const { signResetToken } = await import("@/lib/share-token");
      const { sendEmail } = await import("@/lib/email");
      const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days for invites
      const token = signResetToken({ userId: user.id, email: user.email, exp });
      const baseUrl =
        req.headers.get("origin") ??
        process.env.NEXTAUTH_URL ??
        "https://sight-manager.vercel.app";
      const inviteUrl = `${baseUrl}/reset-password/${token}`;
      await sendEmail({
        to: user.email,
        subject: "Welcome to Sight Manager — set your password",
        html: `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:540px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:18px;font-weight:700;">Sight Manager</h1>
      <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">Welcome</p>
    </div>
    <div style="padding:32px;">
      <p style="margin:0 0 16px;color:#0f172a;font-size:14px;">Hi ${user.name},</p>
      <p style="margin:0 0 16px;color:#475569;font-size:14px;line-height:1.55;">
        Your Sight Manager account has been created. Click the button below to set your password and sign in. The link is valid for 7 days.
      </p>
      <div style="margin:24px 0;text-align:center;">
        <a href="${inviteUrl}" style="background:#2563eb;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;">Set your password</a>
      </div>
      <p style="margin:16px 0 0;color:#64748b;font-size:12px;line-height:1.55;">
        If you weren't expecting this email, you can safely ignore it.
      </p>
    </div>
  </div>
</body>
</html>`,
      });
    } catch (emailErr) {
      // Don't block user creation on email failure — admin can resend later
      // via the "Resend invite" button.
      console.error("[users POST] welcome email failed:", emailErr);
    }

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    return apiError(err, "Failed to create user");
  }
}
