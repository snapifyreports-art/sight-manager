import webpush from "web-push";
import { prisma } from "./prisma";
import type { NotificationType } from "@prisma/client";

// (May 2026 audit O-4) VAPID env vars used to be non-null-asserted —
// any missing var would throw inside `setVapidDetails` and 500 the
// route that triggered the push. Now we check + log + return false
// so callers can degrade gracefully (fan-out is best-effort).
function configureWebPush(): boolean {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    console.warn(
      "[push] VAPID env vars missing — push disabled. " +
        `Have: subject=${!!subject} public=${!!publicKey} private=${!!privateKey}`,
    );
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    return true;
  } catch (err) {
    console.error("[push] setVapidDetails failed:", err);
    return false;
  }
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  renotify?: boolean;
}

/**
 * Send a push notification to a specific user.
 * Checks their notification preferences first.
 * Cleans up expired subscriptions automatically.
 */
export async function sendPushToUser(
  userId: string,
  type: NotificationType,
  payload: PushPayload
) {
  if (!configureWebPush()) return;
  // Check if user has this notification type enabled
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId_type: { userId, type } },
  });

  // If preference row exists and is disabled, skip.
  // If no preference row exists, default to enabled.
  if (pref && !pref.enabled) return;

  // Get all push subscriptions for this user (multiple devices)
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) return;

  const pushPayload = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        // 410 Gone or 404 means subscription expired — clean up
        if (statusCode === 410 || statusCode === 404) {
          await prisma.pushSubscription.delete({
            where: { id: sub.id },
          });
        }
        throw err;
      }
    })
  );

  return results;
}

/**
 * (May 2026 audit #152 follow-up) Send a push notification to the
 * "audience" for a site — anyone who would reasonably want to know
 * about an event on that site. Composes three sources:
 *
 *   1. The site's assigned manager (Site.assignedToId)
 *   2. Anyone watching the site (WatchedSite — opt-in)
 *   3. Anyone who is CEO or DIRECTOR (always wants to know,
 *      regardless of explicit watch state)
 *
 * Each recipient's notification preferences still apply — a user
 * who has disabled this NotificationType won't get the push.
 *
 * Use this for per-site events (delivery arrived, milestone hit,
 * snag raised). The existing sendPushToAll stays for tenant-wide
 * grouped summaries that aren't tied to one site.
 */
export async function sendPushToSiteAudience(
  siteId: string,
  type: NotificationType,
  payload: PushPayload,
) {
  if (!configureWebPush()) return;

  // (#183) Default-include every user with access to the site.
  // Previously this required users to explicitly "Watch" a site to
  // receive any notifications — opt-in. Result: notifications
  // silently never reached anyone who hadn't toggled Watch on. Now
  // the WatchedSite row means MUTED instead of subscribed: presence
  // of a row excludes that user; absence means subscribed.
  //
  // (May 2026 audit P-P1) Parallelise the four lookups — they're
  // independent, so awaiting them sequentially wasted ~3× round-trip
  // latency on every push. Notable when the notifications cron loops
  // over every active site and the latency compounds.
  const [site, accessRows, execs, muted] = await Promise.all([
    // 1. Site assignee
    prisma.site.findUnique({
      where: { id: siteId },
      select: { assignedToId: true },
    }),
    // 2. Every user with access to this site (UserSite join). This is
    //    the new default audience — everyone with access gets pushed.
    prisma.userSite.findMany({
      where: { siteId },
      select: { userId: true },
    }),
    // 3. CEO + DIRECTOR — always included regardless of access table
    //    membership, matching the legacy behaviour.
    prisma.user.findMany({
      where: { role: { in: ["CEO", "DIRECTOR"] }, archivedAt: null },
      select: { id: true },
    }),
    // 4. Mutes — users who have explicitly opted OUT of this site's
    //    notifications. Excluded below.
    prisma.watchedSite.findMany({
      where: { siteId },
      select: { userId: true },
    }),
  ]);
  const mutedIds = new Set(muted.map((m) => m.userId));

  const audience = Array.from(
    new Set(
      [
        site?.assignedToId,
        ...accessRows.map((a) => a.userId),
        ...execs.map((e) => e.id),
      ].filter((id): id is string => !!id && !mutedIds.has(id)),
    ),
  );
  if (audience.length === 0) return;

  // Drop anyone who has explicitly disabled this notification type.
  const disabledPrefs = await prisma.notificationPreference.findMany({
    where: { type, enabled: false, userId: { in: audience } },
    select: { userId: true },
  });
  const disabled = new Set(disabledPrefs.map((p) => p.userId));
  const recipientIds = audience.filter((id) => !disabled.has(id));
  if (recipientIds.length === 0) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: recipientIds } },
  });
  if (subscriptions.length === 0) return;

  const pushPayload = JSON.stringify(payload);
  // (May 2026 audit P-P1) Collect stale subscription IDs and delete
  // them in one bulk query at the end rather than firing a serial
  // DELETE per bounced endpoint. Matters when a chunk of devices have
  // rotated keys / been wiped — we'd otherwise hammer the DB inside
  // every push round.
  const staleIds: string[] = [];
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload,
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          staleIds.push(sub.id);
        }
      }
    }),
  );
  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
  }
}

/**
 * (May 2026 audit #196) Send a push to every customer subscription
 * registered against a plot. Used when a sharedWithCustomer photo
 * is added or a journal entry is posted — the buyer's browser pings
 * with "your home has a new update" linking to /progress/<token>.
 *
 * No NotificationPreference gating — customers don't have a user
 * record so there's no preference grid to consult. Customers who
 * don't want pushes simply don't subscribe in the first place.
 */
export async function sendPushToPlotCustomers(
  plotId: string,
  payload: PushPayload,
) {
  if (!configureWebPush()) return;
  const subs = await prisma.customerPushSubscription.findMany({
    where: { plotId },
  });
  if (subs.length === 0) return;
  const pushPayload = JSON.stringify(payload);
  // (May 2026 audit P-P1) Bulk-delete stale subs at the end (see
  // sendPushToSiteAudience for rationale).
  const staleIds: string[] = [];
  await Promise.allSettled(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload,
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          staleIds.push(sub.id);
        }
      }
    }),
  );
  if (staleIds.length > 0) {
    await prisma.customerPushSubscription.deleteMany({ where: { id: { in: staleIds } } });
  }
}

/**
 * Send a push notification to all users who have the notification type enabled.
 * Used by the daily cron job for grouped summaries.
 */
export async function sendPushToAll(
  type: NotificationType,
  payload: PushPayload
) {
  if (!configureWebPush()) return;
  // Get user IDs that have explicitly disabled this notification type
  const disabledPrefs = await prisma.notificationPreference.findMany({
    where: { type, enabled: false },
    select: { userId: true },
  });

  const disabledUserIds = disabledPrefs.map((p) => p.userId);

  // Get all subscriptions except those belonging to users who disabled this type
  const subscriptions = await prisma.pushSubscription.findMany({
    where:
      disabledUserIds.length > 0
        ? { userId: { notIn: disabledUserIds } }
        : undefined,
  });

  if (subscriptions.length === 0) return;

  const pushPayload = JSON.stringify(payload);

  // (May 2026 audit P-P1) Bulk-delete stale subs at the end (see
  // sendPushToSiteAudience for rationale).
  const staleIds: string[] = [];
  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          staleIds.push(sub.id);
        }
      }
    })
  );
  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
  }

  return results;
}
