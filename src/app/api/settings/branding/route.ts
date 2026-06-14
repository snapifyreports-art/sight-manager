import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sessionHasPermission } from "@/lib/permissions";
import { apiError } from "@/lib/api-errors";
import { PLATFORM, PLATFORM_PRIMARY } from "@/lib/platform";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #56 / Jun 2026 white-label) Business-profile + branding
 * singleton — GET / PUT on AppSettings(id="default").
 *
 * GET is unauthenticated (so the login page + external pages can theme
 * themselves). It returns the RAW stored values (nullable) — consumers fall
 * back to the PLATFORM constant when brandName is null, so an unbranded
 * tenant shows "Sight Manager", and the settings form shows empty fields.
 * PUT is gated to MANAGE_USERS.
 */

export async function GET() {
  const s = await prisma.appSettings.findUnique({ where: { id: "default" } });
  return NextResponse.json({
    // Identity + visual
    brandName: s?.brandName ?? null,
    logoUrl: s?.logoUrl ?? null,
    darkLogoUrl: s?.darkLogoUrl ?? null,
    faviconUrl: s?.faviconUrl ?? null,
    primaryColor: s?.primaryColor ?? PLATFORM_PRIMARY,
    secondaryColor: s?.secondaryColor ?? null,
    supportEmail: s?.supportEmail ?? null,
    // Legal identity (public record; used on handover certs / formal docs)
    legalName: s?.legalName ?? null,
    tradingName: s?.tradingName ?? null,
    companyRegistrationNo: s?.companyRegistrationNo ?? null,
    vatNumber: s?.vatNumber ?? null,
    // Platform co-brand so clients can render the fixed "powered by" line
    platformName: PLATFORM.name,
    poweredBy: PLATFORM.poweredBy,
  });
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

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

  // (Jun 2026 white-label) brandName is now nullable — an empty string means
  // "unbranded → fall back to the platform name", NOT "literally Sight Manager".
  if ("brandName" in body) {
    data.brandName =
      typeof body.brandName === "string" && body.brandName.trim()
        ? body.brandName.trim()
        : null;
  }
  if ("logoUrl" in body) data.logoUrl = body.logoUrl || null;
  if ("darkLogoUrl" in body) data.darkLogoUrl = body.darkLogoUrl || null;
  if ("faviconUrl" in body) data.faviconUrl = body.faviconUrl || null;
  if ("supportEmail" in body) data.supportEmail = body.supportEmail || null;

  for (const [key] of [["primaryColor"], ["secondaryColor"]] as const) {
    if (key in body) {
      const v = body[key];
      if (key === "secondaryColor" && (!v || v === "")) {
        data[key] = null;
      } else if (typeof v === "string" && HEX.test(v)) {
        data[key] = v;
      } else {
        return NextResponse.json(
          { error: `${key} must be a hex colour (e.g. #2563eb)` },
          { status: 400 },
        );
      }
    }
  }

  // Legal-identity strings — trim, empty → null.
  for (const key of [
    "legalName",
    "tradingName",
    "companyRegistrationNo",
    "vatNumber",
  ] as const) {
    if (key in body) {
      data[key] =
        typeof body[key] === "string" && body[key].trim()
          ? body[key].trim()
          : null;
    }
  }

  try {
    const updated = await prisma.appSettings.upsert({
      where: { id: "default" },
      update: data as Prisma.AppSettingsUncheckedUpdateInput,
      create: {
        id: "default",
        primaryColor: PLATFORM_PRIMARY,
        ...data,
      } as Prisma.AppSettingsUncheckedCreateInput,
    });
    return NextResponse.json(updated);
  } catch (err) {
    return apiError(err, "Failed to update branding");
  }
}
