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
