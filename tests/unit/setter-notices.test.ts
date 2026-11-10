import { beforeEach, describe, expect, it, vi } from "vitest";
import { cancelledNotice, movedNotice, outcomeNotice, streetOf } from "@/lib/push/notices";

// A setter's notices (Keenan, 2026-11-03). They show on a lock screen, so
// they name the street only: never a house number, a customer's name, a
// phone number, a note typed by hand or another setter's details.

describe("the street, without the house", () => {
  it("drops the house number and anything after a comma", () => {
    expect(streetOf("123 Aspen Crescent SW")).toBe("Aspen Crescent SW");
    expect(streetOf("123A Aspen Crescent SW")).toBe("Aspen Crescent SW");
    expect(streetOf("123 A Aspen Crescent SW")).toBe("Aspen Crescent SW");
    expect(streetOf("448 Strathcona Drive SW, Calgary, AB T3H 1M3")).toBe("Strathcona Drive SW");
  });

  it("drops unit numbers wherever they are written", () => {
    expect(streetOf("5-123 Main Street NW")).toBe("Main Street NW");
    expect(streetOf("5 - 123 Main Street NW")).toBe("Main Street NW");
    expect(streetOf("Unit 5, 123 Main Street NW")).toBe("Main Street NW");
    expect(streetOf("Unit 5 123 Main Street NW")).toBe("Main Street NW");
    expect(streetOf("#5 123 Main Street NW")).toBe("Main Street NW");
    expect(streetOf("123 Main Street NW #5")).toBe("Main Street NW");
    expect(streetOf("123 Main Street NW Unit 5B")).toBe("Main Street NW");
  });

  it("keeps a numbered road's own number", () => {
    expect(streetOf("1234 17 Avenue SW")).toBe("17 Avenue SW");
    expect(streetOf("17 Avenue SW")).toBe("17 Avenue SW");
    expect(streetOf("4 Street NW")).toBe("4 Street NW");
  });

  it("gives nothing rather than a number", () => {
    expect(streetOf("")).toBe("");
    expect(streetOf("123")).toBe("");
    expect(streetOf("Unit 5")).toBe("");
  });
});

describe("what a notice says", () => {
  const url = "/app/leads/l1";

  it("says qualified, with the fee only when it was added", () => {
    expect(outcomeNotice("12 Critique Way SW", { kind: "qualified", feeAdded: 20 }, url)).toEqual({
      title: "Booking qualified",
      body: "Your booking on Critique Way SW was qualified. $20 added to My pay.",
      url,
      tag: "booking-/app/leads/l1",
    });
    expect(outcomeNotice("12 Critique Way SW", { kind: "qualified", feeAdded: null }, url).body).toBe(
      "Your booking on Critique Way SW was qualified.",
    );
  });

  it("names a listed reason, and only points to the lead for anything else", () => {
    expect(outcomeNotice("12 Critique Way SW", { kind: "not_qualified", reason: "Not the decision maker", listed: true }, url).body).toBe(
      "Your booking on Critique Way SW wasn't qualified: Not the decision maker.",
    );
    expect(outcomeNotice("12 Critique Way SW", { kind: "not_qualified", reason: "Renting.", listed: true }, url).body).toBe(
      "Your booking on Critique Way SW wasn't qualified: Renting.",
    );
    expect(outcomeNotice("12 Critique Way SW", { kind: "not_qualified", reason: "Typed by hand", listed: false }, url).body).toBe(
      "Your booking on Critique Way SW wasn't qualified. The reason is on the lead.",
    );
  });

  it("says no-show and cancelled plainly, and that the lead can be booked again", () => {
    expect(outcomeNotice("12 Critique Way SW", { kind: "no_show" }, url)).toMatchObject({
      title: "Booking was a no-show",
      body: "Nobody was home for your booking on Critique Way SW. The lead can be booked again.",
    });
    expect(outcomeNotice("12 Critique Way SW", { kind: "cancelled_outcome" }, url).body).toBe(
      "Your booking on Critique Way SW was marked cancelled. The lead can be booked again.",
    );
  });

  it("says when Keenan moved or cancelled it, ending the sentence once", () => {
    expect(movedNotice("12 Critique Way SW", "Wed, Nov 4 at 6:45 p.m.", url).body).toBe(
      "Keenan moved your booking on Critique Way SW to Wed, Nov 4 at 6:45 p.m.",
    );
    expect(cancelledNotice("12 Critique Way SW", url).body).toBe(
      "Keenan cancelled your booking on Critique Way SW. The lead is back in Follow up for tomorrow.",
    );
  });

  it("still reads well with no street", () => {
    expect(outcomeNotice("", { kind: "qualified", feeAdded: 20 }, url).body).toBe("Your booking was qualified. $20 added to My pay.");
    expect(cancelledNotice("12", url).body).toBe("Keenan cancelled your booking. The lead is back in Follow up for tomorrow.");
  });

  it("never uses an em or en dash", () => {
    const all = [
      outcomeNotice("12 A St", { kind: "qualified", feeAdded: 20 }, url),
      outcomeNotice("12 A St", { kind: "not_qualified", reason: "x", listed: false }, url),
      outcomeNotice("12 A St", { kind: "no_show" }, url),
      outcomeNotice("12 A St", { kind: "cancelled_outcome" }, url),
      movedNotice("12 A St", "Wed, Nov 4 at 6:45 p.m.", url),
      cancelledNotice("12 A St", url),
    ];
    for (const notice of all) expect(`${notice.title} ${notice.body}`).not.toMatch(/[–—]/);
  });
});

// ---------------------------------------------------------------- who gets it

const sendPush = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/push/send", () => ({ sendPush: (...args: unknown[]) => sendPush(...args) }));

type Rows = {
  meeting?: { lead_id: string; setter_id: string | null; leads: { address_line: string } | null } | null;
  setter?: { role: string; active: boolean } | null;
  fee?: { amount: number } | null;
  reasons?: string[];
  targets?: { id: string; sealed: string }[];
};

// Just enough of the Supabase client: one row per table, and the owner-only
// function that hands over the setter's sealed addresses.
function fakeClient(rows: Rows) {
  const rpc = vi.fn(async () => ({ data: rows.targets ?? [{ id: "d1", sealed: "v1.sealed" }], error: null }));
  const from = (table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => {
        if (table === "meetings") return { data: rows.meeting ?? null, error: null };
        if (table === "profiles") return { data: rows.setter ?? null, error: null };
        if (table === "earnings") return { data: rows.fee ?? null, error: null };
        if (table === "settings") return { data: { not_qualified_reasons: rows.reasons ?? [] }, error: null };
        return { data: null, error: null };
      },
    };
    return query;
  };
  return { client: { from, rpc } as never, rpc };
}

const meeting = { lead_id: "lead-1", setter_id: "setter-1", leads: { address_line: "12 Critique Way SW" } };
const setter = { role: "sales", active: true };

describe("who gets a notice", () => {
  beforeEach(() => sendPush.mockReset().mockResolvedValue({ configured: true, sent: ["d1"], gone: [], failed: [] }));

  it("goes to the booking's setter, through the owner-only function, linking to the lead", async () => {
    const { notifyOutcome } = await import("@/lib/push/setter-notices");
    const { client, rpc } = fakeClient({ meeting, setter, fee: { amount: 20 } });
    await notifyOutcome(client, "m1", "keenan", "qualified", { text: null, listed: false });
    expect(rpc).toHaveBeenCalledWith("push_targets_for_member", { p_profile_id: "setter-1" });
    const [targets, notice] = sendPush.mock.calls[0];
    expect(targets).toEqual([{ id: "d1", sealed: "v1.sealed" }]);
    expect(notice).toMatchObject({ body: "Your booking on Critique Way SW was qualified. $20 added to My pay.", url: "/app/leads/lead-1" });
  });

  it("leaves the fee out when this booking didn't add one", async () => {
    const { notifyOutcome } = await import("@/lib/push/setter-notices");
    const { client } = fakeClient({ meeting, setter, fee: null });
    await notifyOutcome(client, "m1", "keenan", "qualified", { text: null, listed: false });
    expect(sendPush.mock.calls[0][1].body).toBe("Your booking on Critique Way SW was qualified.");
  });

  it("names the reason only when it is in Settings' list, word for word", async () => {
    const { notifyOutcome } = await import("@/lib/push/setter-notices");
    const reasons = ["Renter", "Not the decision maker", "Other"];
    await notifyOutcome(fakeClient({ meeting, setter, reasons }).client, "m1", "keenan", "not_qualified", { text: "Renter", listed: true });
    await notifyOutcome(fakeClient({ meeting, setter, reasons }).client, "m1", "keenan", "not_qualified", {
      text: "Dev Patel said no at 12",
      listed: true,
    });
    await notifyOutcome(fakeClient({ meeting, setter, reasons }).client, "m1", "keenan", "not_qualified", { text: "Other", listed: true });
    expect(sendPush.mock.calls.map((call) => call[1].body)).toEqual([
      "Your booking on Critique Way SW wasn't qualified: Renter.",
      "Your booking on Critique Way SW wasn't qualified. The reason is on the lead.",
      "Your booking on Critique Way SW wasn't qualified. The reason is on the lead.",
    ]);
  });

  it("sends nothing for a setter's own change, the owner's own leads, or someone deactivated", async () => {
    const { notifyCancelled, notifyMoved } = await import("@/lib/push/setter-notices");
    await notifyCancelled(fakeClient({ meeting, setter }).client, "m1", "setter-1");
    await notifyCancelled(fakeClient({ meeting, setter: { role: "owner", active: true } }).client, "m1", "keenan");
    await notifyCancelled(fakeClient({ meeting, setter: { role: "sales", active: false } }).client, "m1", "keenan");
    await notifyMoved(fakeClient({ meeting: { ...meeting, setter_id: null }, setter }).client, "m1", "keenan", "2026-11-05T00:45:00Z");
    await notifyCancelled(fakeClient({ meeting: null }).client, "m1", "keenan");
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("sends nothing when the setter has no device on", async () => {
    const { notifyCancelled } = await import("@/lib/push/setter-notices");
    await notifyCancelled(fakeClient({ meeting, setter, targets: [] }).client, "m1", "keenan");
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("says when Keenan moved it, in Calgary time, naming the street only", async () => {
    const { notifyMoved } = await import("@/lib/push/setter-notices");
    await notifyMoved(fakeClient({ meeting, setter }).client, "m1", "keenan", "2026-11-05T00:45:00Z");
    const notice = sendPush.mock.calls[0][1];
    expect(notice.body).toBe("Keenan moved your booking on Critique Way SW to Wed, Nov 4 at 6:45 p.m.");
    expect(notice.body).not.toMatch(/\b12\b/);
  });
});
