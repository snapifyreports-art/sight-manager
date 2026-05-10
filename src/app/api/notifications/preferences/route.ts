import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NotificationType } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET — return all notification preferences for the current user
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const preferences = await prisma.notificationPreference.findMany({
    where: { userId: session.user.id },
  });

  // Build a complete map: every NotificationType with its enabled status
  // Default to true if no row exists
  // Explicit list so adding new enum values doesn't require client regeneration
  const allTypes: string[] = [
    ...Object.values(NotificationType),
    // New types added after last client generation:
    ...[
      "WEATHER_ALERT",
      // (May 2026 audit follow-up to #152) Per-site event types.
      "SNAG_RAISED",
      "DELIVERY_CONFIRMED",
      "JOB_MILESTONE",
    ].filter((t) => !Object.values(NotificationType).includes(t as NotificationType)),
  ];
  const prefMap = new Map(preferences.map((p) => [p.type, p.enabled]));

  const result = allTypes.map((type) => ({
    type,
    enabled: prefMap.get(type as NotificationType) ?? true,
  }));

  return NextResponse.json(result);
}

// PUT — update notification preferences
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { preferences } = body as {
    preferences: Array<{ type: NotificationType; enabled: boolean }>;
  };

  if (!Array.isArray(preferences)) {
    return NextResponse.json(
      { error: "preferences array is required" },
      { status: 400 }
    );
  }

  // Upsert each preference
  await Promise.all(
    preferences.map((pref) =>
      prisma.notificationPreference.upsert({
        where: {
          userId_type: { userId: session.user.id, type: pref.type },
        },
        update: { enabled: pref.enabled },
        create: {
          userId: session.user.id,
          type: pref.type,
          enabled: pref.enabled,
        },
      })
    )
  );

  return NextResponse.json({ success: true });
}
