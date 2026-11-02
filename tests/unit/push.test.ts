import { beforeEach, describe, expect, it, vi } from "vitest";
import { endpointHash, readSubscription, seal, unseal } from "@/lib/push/seal";

// Push (2026-11-02): addresses are sealed so only the server can open them,
// and the sender talks standard web push. The network is mocked here; a
// real phone's push service can't be reached from the test environment.

const KEY = "test-private-key-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const subscription = {
  endpoint: "https://push.example.com/send/abc123",
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
};

describe("sealed push addresses", () => {
  it("open only with the key they were sealed with", () => {
    const sealed = seal(JSON.stringify(subscription), KEY);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("push.example.com");
    expect(JSON.parse(unseal(sealed, KEY)!)).toEqual(subscription);
    expect(unseal(sealed, `${KEY}x`)).toBeNull();
    expect(unseal(`${sealed.slice(0, -4)}AAAA`, KEY)).toBeNull();
    expect(unseal("v0.abc", KEY)).toBeNull();
  });

  it("seal the same address differently each time", () => {
    expect(seal("same", KEY)).not.toBe(seal("same", KEY));
  });

  it("store one device once, by its hashed address", () => {
    expect(endpointHash(subscription.endpoint)).toMatch(/^[0-9a-f]{64}$/);
    expect(endpointHash(subscription.endpoint)).toBe(endpointHash(subscription.endpoint));
  });

  it("take only a real https push address with its two keys", () => {
    expect(readSubscription(subscription)).toEqual(subscription);
    expect(readSubscription({ ...subscription, endpoint: "http://push.example.com/x" })).toBeNull();
    expect(readSubscription({ ...subscription, keys: { auth: "x" } })).toBeNull();
    expect(readSubscription("nope")).toBeNull();
  });
});

const sendNotification = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({ default: { sendNotification: (...args: unknown[]) => sendNotification(...args) } }));
const env = { VAPID_PUBLIC_KEY: "PUBLIC", VAPID_PRIVATE_KEY: KEY, VAPID_SUBJECT: undefined as string | undefined, QUOTE_BASE_URL: undefined };
vi.mock("@/lib/env", () => ({ getExtrasEnv: () => env }));

describe("sending", () => {
  beforeEach(() => {
    sendNotification.mockReset();
    env.VAPID_PUBLIC_KEY = "PUBLIC";
  });

  it("opens each address and sends the notice with the VAPID keys, never a price", async () => {
    const { sendPush } = await import("@/lib/push/send");
    sendNotification.mockResolvedValue({ statusCode: 201 });
    const notice = { title: "Todd Dean tapped Book my install", body: "Start smaller: Front, Garage", url: "/app/leads/l1#quote", tag: "book-l1" };
    const result = await sendPush([{ id: "d1", sealed: seal(JSON.stringify(subscription), KEY) }], notice);
    expect(result).toEqual({ configured: true, sent: ["d1"], gone: [], failed: [] });
    const [target, payload, options] = sendNotification.mock.calls[0];
    expect(target).toEqual(subscription);
    expect(JSON.parse(payload)).toEqual(notice);
    expect(options.vapidDetails).toEqual({ subject: "mailto:info@vesperlighting.ca", publicKey: "PUBLIC", privateKey: KEY });
    expect(options.urgency).toBe("high");
  });

  it("reports devices the push service says are gone, and other failures apart", async () => {
    const { sendPush } = await import("@/lib/push/send");
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    sendNotification.mockRejectedValueOnce(Object.assign(new Error("busy"), { statusCode: 503 }));
    const sealed = seal(JSON.stringify(subscription), KEY);
    const result = await sendPush(
      [
        { id: "gone", sealed },
        { id: "busy", sealed },
        { id: "other-keys", sealed: seal(JSON.stringify(subscription), "another key") },
      ],
      { title: "t", body: "b", url: "/app" },
    );
    expect(result.gone.sort()).toEqual(["gone", "other-keys"]);
    expect(result.failed).toEqual(["busy"]);
  });

  it("sends nothing, and says so, when the keys aren't set", async () => {
    const { sendPush } = await import("@/lib/push/send");
    env.VAPID_PUBLIC_KEY = undefined as unknown as string;
    const result = await sendPush([{ id: "d1", sealed: "x" }], { title: "t", body: "b", url: "/app" });
    expect(result).toEqual({ configured: false, sent: [], gone: [], failed: [] });
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
