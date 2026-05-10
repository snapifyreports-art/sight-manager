import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionHasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #56) White-label settings — GET / PUT singleton.
 * GET is unauthenticated (so the login page can theme itself) but
 * returns no internal fields. PUT is gated to MANAGE_USERS.
 */

export async function GET() {
  const settings = await prisma.appSettings.findUnique({
    where: { id: "default" },
  });
  if (!settings) {
    return NextResponse.json({
      brandName: "Sight Manager",
      logoUrl: null,
      primaryColor: "#2563eb",
    });
  }
  return NextResponse.json({
    brandName: settings.brandName,
    logoUrl: settings.logoUrl,
    primaryColor: settings.primaryColor,
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!sessionHasPermission(session.user, "MANAGE_USERS")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("brandName" in body && typeof body.brandName === "string") {
    data.brandName = body.brandName.trim() || "Sight Manager";
  }
  if ("logoUrl" in body) data.logoUrl = body.logoUrl || null;
  if ("primaryColor" in body && typeof body.primaryColor === "string") {
    // Light validation — must be a hex colour.
    if (!/^#[0-9A-Fa-f]{6}$/.test(body.primaryColor)) {
      return NextResponse.json(
        { error: "primaryColor must be a hex colour (e.g. #2563eb)" },
        { status: 400 },
      );
    }
    data.primaryColor = body.primaryColor;
  }
  if ("supportEmail" in body) data.supportEmail = body.supportEmail || null;

  try {
    const updated = await prisma.appSettings.upsert({
      where: { id: "default" },
      update: data,
      create: {
        id: "default",
        brandName: typeof data.brandName === "string" ? data.brandName : "Sight Manager",
        logoUrl: typeof data.logoUrl === "string" ? data.logoUrl : null,
        primaryColor: typeof data.primaryColor === "string" ? data.primaryColor : "#2563eb",
        supportEmail: typeof data.supportEmail === "string" ? data.supportEmail : null,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update branding");
  }
}
