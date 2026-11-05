import { describe, expect, it } from "vitest";
import { pastTimeLabel, splitMine, teamRows, type TeamMeeting } from "@/lib/home/team";

const meeting = (over: Partial<TeamMeeting>): TeamMeeting => ({
  id: "m",
  starts_at: "2026-11-06T01:00:00Z",
  status: "booked",
  booked_by: "a",
  setter_id: "a",
  lead: { neighbourhood: "Bridgeland", address_line: "123 Aspen Crescent SW" },
  ...over,
});

describe("teamRows", () => {
  it("lists every meeting still on, in time order, with the area and who booked it", () => {
    const rows = teamRows(
      [
        meeting({ id: "2", starts_at: "2026-11-06T01:45:00Z", booked_by: "b", setter_id: "b" }),
        meeting({ id: "1", booked_by: "me", setter_id: "me", lead: { neighbourhood: null, address_line: "12 Mount Pleasant Way NW" } }),
        meeting({ id: "x", status: "cancelled" }),
        meeting({ id: "y", status: "moved" }),
        meeting({ id: "3", starts_at: "2026-11-06T02:30:00Z", booked_by: "ghost", setter_id: "ghost", lead: { neighbourhood: "  ", address_line: "" } }),
        meeting({ id: "4", starts_at: "2026-11-06T03:15:00Z", status: "qualified", booked_by: "owner", setter_id: "me" }),
      ],
      new Map([
        ["b", "Jaxon T."],
        ["owner", "Keenan H."],
      ]),
      "me",
    );
    expect(rows.map((row) => row.id)).toEqual(["1", "2", "3", "4"]);
    expect(rows[0]).toMatchObject({ area: "Mount Pleasant Way NW", whose: "Your booking", mine: true });
    expect(rows[1]).toMatchObject({ area: "Bridgeland", whose: "Booked by Jaxon T.", mine: false });
    expect(rows[2]).toMatchObject({ area: "Area not set", whose: "Booked by someone" });
    // Keenan picked the time for this setter's lead: still theirs, as on How mine went.
    expect(rows[3]).toMatchObject({ whose: "Your lead, booked by Keenan H.", mine: true });
  });

  it("carries nothing about the customer", () => {
    const [row] = teamRows([meeting({})], new Map(), "me");
    expect(Object.keys(row).sort()).toEqual(["area", "id", "mine", "startsAt", "whose"]);
  });
});

describe("splitMine", () => {
  it("puts what's coming soonest first and what happened newest first, leaving moves out", () => {
    const now = Date.parse("2026-11-06T01:30:00Z");
    const { coming, past } = splitMine(
      [
        { id: "late", starts_at: "2026-11-07T01:00:00Z", status: "booked" },
        { id: "soon", starts_at: "2026-11-06T02:15:00Z", status: "booked" },
        { id: "moved", starts_at: "2026-11-06T03:00:00Z", status: "moved" },
        { id: "old", starts_at: "2026-11-01T01:00:00Z", status: "qualified" },
        { id: "recent", starts_at: "2026-11-06T01:00:00Z", status: "no_show" },
      ],
      now,
    );
    expect(coming.map((m) => m.id)).toEqual(["soon", "late"]);
    expect(past.map((m) => m.id)).toEqual(["recent", "old"]);
  });
});

describe("splitMine and cancellations", () => {
  it("never lists a cancelled booking as coming up, and shows it as past once its time has gone", () => {
    const now = Date.parse("2026-11-06T01:30:00Z");
    const { coming, past } = splitMine(
      [
        { id: "cancelled-ahead", starts_at: "2026-11-07T01:30:00Z", status: "cancelled" },
        { id: "rebooked", starts_at: "2026-11-08T01:30:00Z", status: "booked" },
        { id: "confirmed", starts_at: "2026-11-06T02:15:00Z", status: "confirmed" },
        { id: "cancelled-gone", starts_at: "2026-11-05T01:00:00Z", status: "cancelled" },
      ],
      now,
    );
    expect(coming.map((m) => m.id)).toEqual(["confirmed", "rebooked"]);
    expect(past.map((m) => m.id)).toEqual(["cancelled-gone"]);
  });
});

describe("pastTimeLabel", () => {
  // 6:00 p.m. in Calgary (UTC-6) is midnight UTC the next day.
  it("says tonight, last night, or the day", () => {
    expect(pastTimeLabel("2026-11-06T00:00:00Z", "2026-11-05")).toBe("Tonight, 6:00 p.m.");
    expect(pastTimeLabel("2026-11-05T00:00:00Z", "2026-11-05")).toBe("Last night, 6:00 p.m.");
    expect(pastTimeLabel("2026-11-04T00:00:00Z", "2026-11-05")).toMatch(/^Tue, Nov 3, 6:00 p\.m\.$/);
  });
});
