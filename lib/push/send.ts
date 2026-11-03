import "server-only";
import webpush from "web-push";
import { getExtrasEnv } from "@/lib/env";
import { readSubscription, unseal } from "@/lib/push/seal";

// Web push from the server (2026-11-02): standard web push with the VAPID
// keys in environment variables. Built for any notice: Book my install
// first, the backlog's booking alerts later, the same way. The targets
// arrive sealed (from the database or the member's own rows) and are
// opened here, the only place that holds the key.

import type { PushNotice } from "@/lib/push/send-types";

export type { PushNotice };

export type PushTarget = { id: string; sealed: string };

export type PushResult = {
  configured: boolean;
  sent: string[];
  // Devices the push service says are gone for good (unsubscribed or reset).
  gone: string[];
  failed: string[];
};

export const DEFAULT_SUBJECT = "mailto:info@vesperlighting.ca";

export function pushKeys(): { publicKey: string; privateKey: string; subject: string } | null {
  const env = getExtrasEnv();
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || DEFAULT_SUBJECT };
}

export async function sendPush(targets: PushTarget[], notice: PushNotice): Promise<PushResult> {
  const keys = pushKeys();
  const result: PushResult = { configured: keys !== null, sent: [], gone: [], failed: [] };
  if (!keys) return result;

  const payload = JSON.stringify(notice);
  await Promise.all(
    targets.map(async (target) => {
      const opened = unseal(target.sealed, keys.privateKey);
      const subscription = opened ? readSubscription(safeJson(opened)) : null;
      if (!subscription) {
        // Sealed with other keys: the device has to turn notifications on again.
        result.gone.push(target.id);
        return;
      }
      try {
        await webpush.sendNotification(subscription, payload, {
          vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 6 * 3600,
          urgency: "high",
          topic: notice.tag?.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
          timeout: 8000,
        });
        result.sent.push(target.id);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) result.gone.push(target.id);
        else result.failed.push(target.id);
      }
    }),
  );
  return result;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
