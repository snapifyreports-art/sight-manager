import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/api-errors";
import { sessionHasPermission } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// PUT — set or clear a variant's per-job durationDays override.
// Body: { templateJobId: string, durationDays: number | null }
//   - durationDays = null  → remove the override (variant inherits base)
//   - durationDays = number → upsert the override
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> },
) {
  const session = await auth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    !sessionHasPermission(
      session.user as { role?: string; permissions?: string[] },
      "EDIT_PROGRAMME",
    )
  ) {
    return NextResponse.json(
      { error: "You do not have permission to manage templates" },
      { status: 403 },
    );
  }

  const { variantId } = await params;
  const body = await req.json();
  const { templateJobId, durationDays } = body;

  if (typeof templateJobId !== "string") {
    return NextResponse.json(
      { error: "templateJobId is required" },
      { status: 400 },
    );
  }

  try {
    if (durationDays == null) {
      // Clear
      await prisma.templateVariantJobOverride.deleteMany({
        where: { variantId, templateJobId },
      });
      return NextResponse.json({ success: true });
    }

    if (typeof durationDays !== "number" || durationDays < 1) {
      return NextResponse.json(
        { error: "durationDays must be a positive number or null" },
        { status: 400 },
      );
    }

    const result = await prisma.templateVariantJobOverride.upsert({
      where: {
        variantId_templateJobId: { variantId, templateJobId },
      },
      create: { variantId, templateJobId, durationDays },
      update: { durationDays },
    });
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err, "Failed to set variant override");
  }
}
