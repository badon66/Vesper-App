import { describe, expect, it } from "vitest";
import { summariseToday } from "@/lib/home/today";

const names = new Map([
  ["a", "Avery"],
  ["b", "Blake"],
  ["c", "Casey"],
]);

describe("summariseToday", () => {
  it("adds up each person's sessions and leads, open sessions first", () => {
    const team = summariseToday(
      [
        { user_id: "a", neighbourhood: "Evanston", started_at: "2026-10-28T22:00:00Z", ended_at: "2026-10-28T23:00:00Z", doors_knocked: 30, conversations: 8 },
        { user_id: "a", neighbourhood: "Sage Hill", started_at: "2026-10-28T23:10:00Z", ended_at: null, doors_knocked: 12, conversations: 3 },
        { user_id: "b", neighbourhood: "Evanston", started_at: "2026-10-28T21:00:00Z", ended_at: "2026-10-28T23:30:00Z", doors_knocked: 50, conversations: 10 },
        { user_id: "a", neighbourhood: "Evanston", started_at: "2026-10-28T20:00:00Z", ended_at: "2026-10-28T21:00:00Z", doors_knocked: 5, conversations: 1 },
      ],
      [
        { created_by: "a", created_at: "2026-10-28T22:30:00Z" },
        { created_by: "b", created_at: "2026-10-28T22:40:00Z" },
        { created_by: "c", created_at: "2026-10-28T19:00:00Z" },
        { created_by: "a", created_at: "2026-10-28T23:20:00Z" },
      ],
      names,
    );
    expect(team.rows).toEqual([
      { userId: "a", name: "Avery", knockingNow: true, neighbourhoods: ["Sage Hill", "Evanston"], doors: 47, conversations: 12, leads: 2 },
      { userId: "b", name: "Blake", knockingNow: false, neighbourhoods: ["Evanston"], doors: 50, conversations: 10, leads: 1 },
      { userId: "c", name: "Casey", knockingNow: false, neighbourhoods: [], doors: 0, conversations: 0, leads: 1 },
    ]);
    expect(team.totals).toEqual({ doors: 97, conversations: 22, leads: 4, knockingNow: 1 });
  });

  it("is empty with nothing today, and never invents a name", () => {
    expect(summariseToday([], [], names)).toEqual({
      rows: [],
      totals: { doors: 0, conversations: 0, leads: 0, knockingNow: 0 },
    });
    expect(summariseToday([], [{ created_by: "z", created_at: "2026-10-28T19:00:00Z" }], names).rows[0].name).toBe("Someone");
  });
});
