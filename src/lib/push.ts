import webpush from "web-push";
import { prisma } from "./prisma";
import type { NotificationType } from "@prisma/client";

function configureWebPush() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );
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
  configureWebPush();
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
  configureWebPush();

  // 1. Site assignee
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { assignedToId: true },
  });

  // 2. Watchers
  const watchers = await prisma.watchedSite.findMany({
    where: { siteId },
    select: { userId: true },
  });

  // 3. CEO + DIRECTOR
  const execs = await prisma.user.findMany({
    where: { role: { in: ["CEO", "DIRECTOR"] } },
    select: { id: true },
  });

  const audience = Array.from(
    new Set(
      [
        site?.assignedToId,
        ...watchers.map((w) => w.userId),
        ...execs.map((e) => e.id),
      ].filter((id): id is string => !!id),
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
  return Promise.allSettled(
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
          await prisma.pushSubscription.delete({ where: { id: sub.id } });
        }
      }
    }),
  );
}

/**
 * Send a push notification to all users who have the notification type enabled.
 * Used by the daily cron job for grouped summaries.
 */
export async function sendPushToAll(
  type: NotificationType,
  payload: PushPayload
) {
  configureWebPush();
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
          await prisma.pushSubscription.delete({
            where: { id: sub.id },
          });
        }
      }
    })
  );

  return results;
}
