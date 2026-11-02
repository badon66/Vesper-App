"use client";

import { BellOff, BellRing, Copy, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";
import { saveThisDevice, sendTestNotification, switchOffDevice, switchOffThisDevice } from "./push-actions";

// Notifications (Keenan, 2026-11-02): a push to his phone and iPad when a
// customer taps Book my install, with their name and the option they
// picked. Standard web push from the installed app: on iPhone and iPad it
// works from the Vesper icon on the home screen (iOS 16.4 or later), and
// each device turns it on once, from a tap here.

export type DeviceRow = { id: string; label: string; createdAt: string; lastSentAt: string | null };

type Support = "checking" | "ready" | "needs_home_screen" | "unsupported";

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/Android/.test(ua)) return "Android phone";
  return "Computer";
}

export function Notifications({ publicKey, devices }: { publicKey: string | null; devices: DeviceRow[] }) {
  return (
    <Card id="notifications" className="scroll-mt-24" data-testid="notifications">
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          A notification on your phone and iPad when a customer taps Book my install on their quote link, with their
          name and the option they picked.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 text-sm">
        {publicKey ? <DeviceControls publicKey={publicKey} devices={devices} /> : <KeySetup />}
      </CardContent>
    </Card>
  );
}

function DeviceControls({ publicKey, devices }: { publicKey: string; devices: DeviceRow[] }) {
  const [support, setSupport] = useState<Support>("checking");
  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const pushable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!pushable) {
        const apple = /iPhone|iPad|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
        if (!cancelled) setSupport(apple ? "needs_home_screen" : "unsupported");
        return;
      }
      setPermission(Notification.permission);
      const registration = await navigator.serviceWorker.getRegistration();
      const existing = registration ? await registration.pushManager.getSubscription() : null;
      if (cancelled) return;
      setSubscribed(Boolean(existing) && Notification.permission === "granted");
      setSupport("ready");
    }
    void check().catch(() => !cancelled && setSupport("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const answer = await Notification.requestPermission();
      setPermission(answer);
      if (answer !== "granted") {
        setMessage({ text: "Notifications are blocked for Vesper on this device. Allow them in the device's Settings, then try again.", error: true });
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }));
      const result = await saveThisDevice(subscription.toJSON(), deviceLabel());
      if (!result.ok) {
        setMessage({ text: result.message, error: true });
        return;
      }
      setSubscribed(true);
      setMessage({ text: "Notifications are on for this device. Send a test to see one arrive.", error: false });
    } catch {
      setMessage({ text: "Notifications couldn't be turned on here. Check your signal and try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) {
        await switchOffThisDevice(subscription.toJSON());
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage({ text: "Notifications are off for this device.", error: false });
    } catch {
      setMessage({ text: "That didn't work. Check your signal and try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendTestNotification();
      setMessage(result.ok ? { text: result.message ?? "Sent.", error: false } : { text: result.message, error: true });
    } catch {
      setMessage({ text: "The test didn't go out. Check your signal and try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setMessage(null);
    try {
      const result = await switchOffDevice(id);
      if (!result.ok) setMessage({ text: result.message, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3" data-testid="this-device">
        <p className="font-semibold">This device</p>
        {support === "checking" ? (
          <p className="text-muted-foreground">Checking this device.</p>
        ) : support === "needs_home_screen" ? (
          <p className="text-pretty">
            On iPhone and iPad, notifications work from the Vesper app on your home screen. Open Vesper from its icon on
            the home screen, come back to Settings, and turn them on there.
          </p>
        ) : support === "unsupported" ? (
          <p className="text-pretty">This browser can&apos;t take notifications. Use the Vesper app on your phone or iPad.</p>
        ) : subscribed ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 font-semibold">
              <BellRing aria-hidden="true" className="size-4" />
              On for this device
            </p>
            <Button type="button" variant="ghost" onClick={() => void turnOff()} disabled={busy}>
              <BellOff aria-hidden="true" />
              Switch off here
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button type="button" className="self-start" onClick={() => void turnOn()} disabled={busy}>
              <BellRing aria-hidden="true" />
              Turn on notifications here
            </Button>
            {permission === "denied" ? (
              <p className="text-pretty text-muted-foreground">
                Notifications are blocked for Vesper on this device. Allow them in the device&apos;s Settings first.
              </p>
            ) : (
              <p className="text-pretty text-muted-foreground">The device asks once whether Vesper may send notifications.</p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t pt-4">
        <p className="font-semibold">Devices with notifications on</p>
        {devices.length === 0 ? (
          <p className="text-muted-foreground" data-testid="no-devices">
            None yet. Turn them on from your phone and from your iPad, and both get every notice.
          </p>
        ) : (
          <ul className="flex flex-col divide-y" data-testid="devices">
            {devices.map((device) => (
              <li key={device.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-semibold">{device.label}</span>
                  <span className="block text-muted-foreground">
                    Added {formatDateTime(device.createdAt)}
                    {device.lastSentAt ? `. Last notice ${formatDateTime(device.lastSentAt)}` : ""}.
                  </span>
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => void remove(device.id)} disabled={busy}>
                  Switch off
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="outline" className="self-start" onClick={() => void test()} disabled={busy || devices.length === 0}>
          Send a test notification
        </Button>
      </div>

      {message ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "font-semibold text-destructive" : "font-semibold"}>
          {message.text}
        </p>
      ) : null}
    </>
  );
}

// Before the keys are in Vercel: make the pair on this device, then paste
// both into Vercel. Nothing here is sent anywhere.
function KeySetup() {
  const [keys, setKeys] = useState<{ publicKey: string; privateKey: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function make() {
    setError(null);
    try {
      const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
      const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
      const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
      if (!jwk.d) throw new Error("no private key");
      setKeys({ publicKey: bytesToBase64Url(raw), privateKey: jwk.d });
      setCopied(null);
    } catch {
      setError("This browser couldn't make the keys. Try Safari or Chrome on a computer.");
    }
  }

  async function copy(name: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(name);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="push-key-setup">
      <p className="text-pretty">
        Notifications need two keys in Vercel first. Make them here, on this device; they aren&apos;t sent anywhere.
      </p>
      <Button type="button" variant="outline" className="self-start" onClick={() => void make()}>
        <KeyRound aria-hidden="true" />
        {keys ? "Make new keys" : "Make the keys"}
      </Button>
      {error ? (
        <p role="alert" className="font-semibold text-destructive">
          {error}
        </p>
      ) : null}
      {keys ? (
        <div className="flex flex-col gap-4">
          {[
            ["VAPID_PUBLIC_KEY", keys.publicKey],
            ["VAPID_PRIVATE_KEY", keys.privateKey],
          ].map(([name, value]) => (
            <div key={name} className="flex flex-col gap-1.5">
              <p className="font-mono text-xs font-semibold">{name}</p>
              <p className="rounded-md border bg-muted px-3 py-2 font-mono text-xs break-all" data-testid={`key-${name}`}>
                {value}
              </p>
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => void copy(name, value)}>
                <Copy aria-hidden="true" />
                {copied === name ? "Copied" : `Copy ${name}`}
              </Button>
            </div>
          ))}
          <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-pretty">
            <li>In Vercel, open the vesper-app project, then Settings, then Environment Variables.</li>
            <li>Add VAPID_PUBLIC_KEY with the first value and VAPID_PRIVATE_KEY with the second, for Production and Preview.</li>
            <li>Redeploy (Deployments, the newest one, Redeploy), then come back here and turn notifications on.</li>
          </ol>
          <p className="font-semibold text-pretty">Keep the private key to yourself: paste it only into Vercel.</p>
        </div>
      ) : null}
    </div>
  );
}
