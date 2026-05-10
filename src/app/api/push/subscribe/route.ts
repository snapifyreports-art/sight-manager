import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #75) Hard cap on subscriptions per user.
 *
 * A user can legitimately have multiple subscriptions (laptop + phone +
 * tablet, work + personal browsers). 10 is generous — average person has
 * 2-3. The cap exists so a buggy client looping subscribe/unsubscribe (or
 * a malicious one) can't pile thousands of dead endpoints under one user
 * and slow every fan-out send to a crawl.
 *
 * Eviction strategy: when at cap, delete the OLDEST subscription before
 * inserting the new one. Oldest is most likely the dead/abandoned device.
 */
const MAX_SUBSCRIPTIONS_PER_USER = 10;

// POST — save a new push subscription
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { endpoint, keys, userAgent } = body;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "endpoint and keys (p256dh, auth) are required" },
      { status: 400 }
    );
  }

  // Existing subscription with this endpoint? Treat as a re-subscribe and
  // skip the cap check — we're not adding a row, we're refreshing one.
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { id: true },
  });

  if (!existing) {
    // New subscription — enforce the per-user cap.
    const userSubs = await prisma.pushSubscription.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });

    if (userSubs.length >= MAX_SUBSCRIPTIONS_PER_USER) {
      // Drop the oldest entries until we're below the cap. We delete
      // (not skip) so a user who genuinely has 10 active devices still
      // gets to add an 11th — they just lose the oldest.
      const toDrop = userSubs.slice(0, userSubs.length - MAX_SUBSCRIPTIONS_PER_USER + 1);
      await prisma.pushSubscription.deleteMany({
        where: { id: { in: toDrop.map((s) => s.id) } },
      });
    }
  }

  // Upsert — if endpoint already exists, update it (same device re-subscribing)
  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
      userId: session.user.id,
    },
    create: {
      userId: session.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: userAgent || null,
    },
  });

  return NextResponse.json(subscription, { status: 201 });
}

// DELETE — remove a push subscription
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { endpoint } = body;

  if (!endpoint) {
    return NextResponse.json(
      { error: "endpoint is required" },
      { status: 400 }
    );
  }

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id },
  });

  return NextResponse.json({ success: true });
}
