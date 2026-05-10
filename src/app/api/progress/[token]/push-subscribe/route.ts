import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * (May 2026 audit #196) Public endpoint — no auth, share-token is
 * the identity. Subscribes a customer's browser to push notifications
 * for their plot. Used by a "Get progress notifications" prompt on
 * /progress/[token].
 *
 * Body: { endpoint, keys: { p256dh, auth }, userAgent? }
 *
 * Re-subscribes for the same endpoint are an upsert — no duplicate
 * rows from a buyer who toggles permission off+on.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const plot = await prisma.plot.findUnique({
    where: { shareToken: token },
    select: { id: true, shareEnabled: true },
  });
  if (!plot || !plot.shareEnabled) {
    return NextResponse.json({ error: "Link not active" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  const userAgent = body?.userAgent ?? null;
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "endpoint and keys are required" },
      { status: 400 },
    );
  }

  await prisma.customerPushSubscription.upsert({
    where: { endpoint },
    update: { plotId: plot.id, p256dh, auth, userAgent },
    create: { plotId: plot.id, endpoint, p256dh, auth, userAgent },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await req.json().catch(() => null);
  const endpoint = body?.endpoint;
  if (!token || !endpoint) {
    return NextResponse.json({ error: "Missing token or endpoint" }, { status: 400 });
  }
  // Trust the endpoint as the identifier — the browser only knows
  // its own push endpoint, and finding it requires having it.
  await prisma.customerPushSubscription.deleteMany({ where: { endpoint } });
  return NextResponse.json({ ok: true });
}
