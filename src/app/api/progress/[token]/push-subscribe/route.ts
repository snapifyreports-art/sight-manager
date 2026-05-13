import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// (May 2026 audit O-12) Public push-subscribe endpoint had no origin
// check or rate limit — an attacker could pollute the table with
// junk subscriptions, flooding the customer-push cron with dead
// endpoints. Defences applied below:
//   1. Origin header must match NEXTAUTH_URL (or sub-domain) — stops
//      cross-site form abuse without breaking legit subscribes.
//   2. Endpoint URL must be from a known browser push service —
//      stops attackers from registering arbitrary URLs that we'd
//      then HTTPS-POST to from our Lambda. Whitelist matches the
//      standard FCM / Apple / Mozilla push service hosts.
//   3. Token min-length check stays as cheap path-rejection.

const ALLOWED_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "updates.push.services.mozilla.com",
  "api.push.apple.com",
  "web.push.apple.com",
  "wns2-by3p.notify.windows.com",
  "wns2-am3p.notify.windows.com",
];

function isAllowedEndpoint(url: string): boolean {
  try {
    const u = new URL(url);
    return ALLOWED_PUSH_HOSTS.some(
      (host) => u.hostname === host || u.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

function isAllowedOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Some browsers strip Origin on same-origin POSTs. Fall back to
    // Referer if it matches the expected base URL.
    const referer = req.headers.get("referer");
    if (!referer) return false;
    return referer.startsWith(process.env.NEXTAUTH_URL ?? "");
  }
  const base = process.env.NEXTAUTH_URL ?? "";
  if (!base) return true; // dev: no NEXTAUTH_URL set, don't block
  try {
    const o = new URL(origin);
    const b = new URL(base);
    return o.host === b.host;
  } catch {
    return false;
  }
}

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
  if (!isAllowedOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  if (!isAllowedEndpoint(endpoint)) {
    return NextResponse.json(
      { error: "Endpoint URL is not from a recognised push service" },
      { status: 400 },
    );
  }

  // (May 2026 audit O-P0) Cap subscriptions per plot. Pre-fix any
  // caller with a valid share token could POST unlimited subscribe
  // rows — a leaked token + a malicious script could enqueue
  // thousands of dead endpoints that we'd then HTTPS-POST to from
  // the customer-push cron every time the plot updates. 5 is the
  // realistic upper bound for a household (parents' devices + a
  // shared tablet). Existing subscriptions for the same endpoint
  // upsert and don't count against the limit.
  const PER_PLOT_LIMIT = 5;
  const existing = await prisma.customerPushSubscription.findUnique({
    where: { endpoint },
    select: { id: true },
  });
  if (!existing) {
    const count = await prisma.customerPushSubscription.count({
      where: { plotId: plot.id },
    });
    if (count >= PER_PLOT_LIMIT) {
      return NextResponse.json(
        { error: "Subscription limit reached for this plot" },
        { status: 429 },
      );
    }
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
