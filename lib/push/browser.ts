// The browser's side of web push (2026-11-02; shared with the welcome from
// 2026-11-03): what this device can do, turning notifications on, and
// matching this browser's push address to the member's own devices. Only
// imported by client components.

export type PushSupport = "ready" | "needs_home_screen" | "unsupported";

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// iPhone and iPad (an iPad says it is a Mac, with a touch screen).
export function isAppleTouch(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// Opened from the icon on the home screen rather than in a browser tab.
export function isStandalone(): boolean {
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return legacy || window.matchMedia("(display-mode: standalone)").matches;
}

export function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android phone";
  return "Computer";
}

export function pushSupport(): PushSupport {
  const pushable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (pushable) return "ready";
  // iPhone and iPad take notifications only from the home screen app.
  return isAppleTouch() && !isStandalone() ? "needs_home_screen" : "unsupported";
}

// The same hash the server keeps for a device (SHA-256 of the push address,
// in hex), so the page can tell whether this browser is one of the
// member's own devices without sending the address anywhere.
export async function endpointHashOf(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

// Whether this browser has notifications on for this member: allowed, a
// push address, and that address among the member's devices.
export async function isOnForMe(myDeviceHashes: string[]): Promise<boolean> {
  if (pushSupport() !== "ready" || Notification.permission !== "granted") return false;
  const subscription = await currentSubscription();
  if (!subscription) return false;
  return myDeviceHashes.includes(await endpointHashOf(subscription.endpoint));
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true;
  const bytes = new Uint8Array(current);
  return bytes.length === key.length && bytes.every((byte, i) => byte === key[i]);
}

function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);
}

type SaveResult = { ok: true; message?: string } | { ok: false; message: string; taken?: boolean };
type Save = (subscription: unknown, label: string) => Promise<SaveResult>;

export type TurnOnResult = { ok: true } | { ok: false; blocked: boolean; message: string };

export const BLOCKED_MESSAGE = "Notifications are blocked for Vesper on this device.";

// Where to allow them again, for this kind of device (2026-11-03).
export function unblockSteps(): string {
  return isAppleTouch()
    ? "To allow them: open Settings, tap Notifications, then Vesper, and turn on Allow Notifications. Then come back and tap Check again."
    : "To allow them: in Chrome, tap the icon left of the address, then Permissions, and allow Notifications. Then tap Check again.";
}

// Asks once, then saves this device's push address for the member. A push
// address made with older keys, or one another Vesper account on this
// browser already uses, is replaced with a fresh one.
export async function turnOnPush(publicKey: string, save: Save): Promise<TurnOnResult> {
  const answer = await Notification.requestPermission();
  if (answer !== "granted") return { ok: false, blocked: true, message: BLOCKED_MESSAGE };
  const key = base64UrlToBytes(publicKey);
  const registration = await within(navigator.serviceWorker.ready, 10_000);
  const fresh = () => registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  let subscription = await registration.pushManager.getSubscription();
  if (subscription && !sameKey(subscription, key)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await fresh();
  let result = await save(subscription.toJSON(), deviceLabel());
  if (!result.ok && result.taken) {
    await subscription.unsubscribe();
    subscription = await fresh();
    result = await save(subscription.toJSON(), deviceLabel());
  }
  return result.ok ? { ok: true } : { ok: false, blocked: false, message: result.message };
}

export type PushState = { support: PushSupport; permission: NotificationPermission | null; on: boolean };

// What this browser says now, in one read: whether it can take
// notifications, what the person allowed, and whether it's on for them.
export async function readPushState(myDeviceHashes: string[]): Promise<PushState> {
  const support = pushSupport();
  if (support !== "ready") return { support, permission: null, on: false };
  const on = await isOnForMe(myDeviceHashes);
  return { support, permission: Notification.permission, on };
}
