import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

// Sealed push addresses (2026-11-02). A device's push address and keys are
// stored sealed (AES-256-GCM) with a key derived from the server's VAPID
// private key, so the database can hand them to the server inside a
// customer's request (Book my install) without anything readable leaving
// it, and without the secret Supabase key. New VAPID keys mean new
// subscriptions anyway, so the seal key changes with them.
// Pure: the key is passed in, so it is unit tested without the environment.

export type PushSubscriptionJSON = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const VERSION = "v1";

function sealKey(vapidPrivateKey: string): Buffer {
  return Buffer.from(
    hkdfSync("sha256", Buffer.from(vapidPrivateKey, "utf8"), Buffer.from("vesper"), Buffer.from("push-subscription-v1"), 32),
  );
}

export function seal(value: string, vapidPrivateKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", sealKey(vapidPrivateKey), iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

// Null when it wasn't sealed with this key, or was changed.
export function unseal(sealed: string, vapidPrivateKey: string): string | null {
  const [version, payload] = sealed.split(".", 2);
  if (version !== VERSION || !payload) return null;
  try {
    const raw = Buffer.from(payload, "base64url");
    if (raw.length < 29) return null;
    const decipher = createDecipheriv("aes-256-gcm", sealKey(vapidPrivateKey), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// One device is stored once: the push address, hashed.
export function endpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

// A browser's subscription, checked: an https push address and its two keys.
export function readSubscription(value: unknown): PushSubscriptionJSON | null {
  if (!value || typeof value !== "object") return null;
  const { endpoint, keys } = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== "string" || !/^https:\/\/[^\s]+$/.test(endpoint) || endpoint.length > 2000) return null;
  if (!keys || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") return null;
  if (!/^[A-Za-z0-9_-]{20,200}={0,2}$/.test(keys.p256dh) || !/^[A-Za-z0-9_-]{8,100}={0,2}$/.test(keys.auth)) return null;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}
