import { describe, expect, it } from "vitest";
import { splitMine, teamRows, type TeamMeeting } from "@/lib/home/team";

const meeting = (over: Partial<TeamMeeting>): TeamMeeting => ({
  id: "m",
  starts_at: "2026-11-06T01:00:00Z",
  status: "booked",
  booked_by: "a",
  lead: { neighbourhood: "Bridgeland", address_line: "123 Aspen Crescent SW" },
  ...over,
});

describe("teamRows", () => {
  it("lists every meeting still on, in time order, with the area and who booked it", () => {
    const rows = teamRows(
      [
        meeting({ id: "2", starts_at: "2026-11-06T01:45:00Z", booked_by: "b" }),
        meeting({ id: "1", booked_by: "me", lead: { neighbourhood: null, address_line: "12 Mount Pleasant Way NW" } }),
        meeting({ id: "x", status: "cancelled" }),
        meeting({ id: "y", status: "moved" }),
        meeting({ id: "3", starts_at: "2026-11-06T02:30:00Z", booked_by: "ghost", lead: { neighbourhood: "  ", address_line: "" } }),
        meeting({ id: "4", starts_at: "2026-11-06T03:15:00Z", status: "qualified", booked_by: "b" }),
      ],
      new Map([["b", "Jaxon T."]]),
      "me",
    );
    expect(rows.map((row) => row.id)).toEqual(["1", "2", "3", "4"]);
    expect(rows[0]).toMatchObject({ area: "Mount Pleasant Way NW", bookedBy: "You", mine: true });
    expect(rows[1]).toMatchObject({ area: "Bridgeland", bookedBy: "Jaxon T.", mine: false });
    expect(rows[2]).toMatchObject({ area: "Area not set", bookedBy: "Someone" });
  });

  it("carries nothing about the customer", () => {
    const [row] = teamRows([meeting({})], new Map(), "me");
    expect(Object.keys(row).sort()).toEqual(["area", "bookedBy", "id", "mine", "startsAt"]);
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
