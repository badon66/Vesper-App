import { describe, expect, it } from "vitest";
import {
  canChange,
  canPick,
  changeUntil,
  dayLine,
  daySummary,
  earliestDay,
  monthDays,
  monthLabel,
  monthOf,
  monthWeeks,
  pickDays,
  pickWeeks,
  shiftMonth,
} from "@/lib/installs/calendar";

// Round 23 (Keenan, 2026-11-17): Keenan's install calendar and the open days
// a customer picks from.

describe("Keenan's month", () => {
  it("lays a month out in weeks, Sunday first", () => {
    const weeks = monthWeeks("2026-12");
    expect(weeks[0]).toEqual([null, null, "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05"]);
    expect(weeks.at(-1)?.slice(0, 5)).toEqual(["2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31"]);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(monthLabel("2026-12")).toBe("December 2026");
  });

  it("moves between months and reads a month from a link", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(monthOf("2027-02", "2026-11-25")).toBe("2027-02");
    expect(monthOf("nonsense", "2026-11-25")).toBe("2026-11");
    expect(monthOf(undefined, "2026-11-25")).toBe("2026-11");
  });

  it("says for each day whether it's open, its own number, who's booked and the spots left", () => {
    const rows = [
      { day: "2026-12-01", open: true, job_limit: null },
      { day: "2026-12-02", open: true, job_limit: 2 },
      { day: "2026-12-03", open: false, job_limit: null },
    ];
    const booked = [
      { id: "a", name: "Zed Smith", day: "2026-12-01" },
      { id: "b", name: "Amy Jones", day: "2026-12-02" },
      { id: "c", name: "Bea Lee", day: "2026-12-03" },
    ];
    const days = monthDays("2026-12", rows, booked, 1, "2026-12-02");
    expect(days.get("2026-12-01")).toMatchObject({ open: true, limit: 1, ownLimit: null, left: 0, past: true });
    expect(dayLine(days.get("2026-12-01")!)).toBe("Full");
    expect(days.get("2026-12-02")).toMatchObject({ open: true, limit: 2, ownLimit: 2, left: 1, past: false });
    expect(dayLine(days.get("2026-12-02")!)).toBe("1 spot left");
    expect(daySummary(days.get("2026-12-02")!)).toBe("Open for 2 jobs. 1 spot left.");
    expect(dayLine(days.get("2026-12-03")!)).toBe("Closed, 1 job booked");
    expect(daySummary(days.get("2026-12-03")!)).toBe("Closed for installs, with 1 job still booked on it.");
    expect(dayLine(days.get("2026-12-04")!)).toBe("Closed");
    expect(days.size).toBe(31);
  });

  it("never counts spots left below zero on a day over its number", () => {
    const days = monthDays("2026-12", [{ day: "2026-12-10", open: true, job_limit: null }], [
      { id: "a", name: "A", day: "2026-12-10" },
      { id: "b", name: "B", day: "2026-12-10" },
    ], 1, "2026-12-01");
    expect(days.get("2026-12-10")?.left).toBe(0);
  });
});

describe("what the customer picks from", () => {
  const days = [
    { day: "2026-12-02", full: false },
    { day: "2026-12-04", full: true },
    { day: "2026-12-09", full: false },
  ];

  it("lays the open days out as whole weeks, with the days between closed and full days marked", () => {
    const weeks = pickWeeks(days);
    expect(weeks).toHaveLength(2);
    expect(weeks[0][0]).toEqual({ day: "2026-11-29", kind: "closed" });
    expect(weeks[0][3]).toEqual({ day: "2026-12-02", kind: "open" });
    expect(weeks[0][5]).toEqual({ day: "2026-12-04", kind: "full" });
    expect(weeks[1][3]).toEqual({ day: "2026-12-09", kind: "open" });
    expect(pickWeeks([])).toEqual([]);
  });

  it("their own day is never full to them, and shows even when it's no longer listed", () => {
    expect(pickWeeks(days, "2026-12-04")[0][5]).toEqual({ day: "2026-12-04", kind: "open" });
    const weeks = pickWeeks(days, "2026-12-16");
    expect(weeks.flat().find((cell) => cell?.day === "2026-12-16")).toEqual({ day: "2026-12-16", kind: "open" });
  });

  it("only an open day with room, on or after the earliest, can be picked", () => {
    expect(canPick(days, "2026-12-02", "2026-12-01")).toBe(true);
    expect(canPick(days, "2026-12-04", "2026-12-01")).toBe(false);
    expect(canPick(days, "2026-12-03", "2026-12-01")).toBe(false);
    expect(canPick(days, "2026-12-02", "2026-12-03")).toBe(false);
  });

  it("the earliest day is 3 days out for white track and 7 for a colour-matched one", () => {
    const leadDays = { white: 3, colour: 7 };
    expect(earliestDay("2026-11-28", "white", leadDays)).toBe("2026-12-01");
    expect(earliestDay("2026-11-28", "colour", leadDays)).toBe("2026-12-05");
  });

  it("they can change it until 2 days before it", () => {
    expect(changeUntil("2026-12-10")).toBe("2026-12-08");
    expect(canChange("2026-12-10", "2026-12-08")).toBe(true);
    expect(canChange("2026-12-10", "2026-12-09")).toBe(false);
    expect(canChange(null, "2026-12-09")).toBe(true);
  });

  it("works out the same list as the link for the meeting, leaving the lead's own day out of the count", () => {
    const rows = [
      { day: "2026-11-30", open: true, job_limit: null },
      { day: "2026-12-02", open: true, job_limit: null },
      { day: "2026-12-03", open: false, job_limit: null },
      { day: "2026-12-04", open: true, job_limit: 2 },
    ];
    const booked = [
      { id: "mine", name: "Mine", day: "2026-12-02" },
      { id: "other", name: "Other", day: "2026-12-04" },
    ];
    expect(pickDays(rows, booked, 1, "2026-12-01", "mine")).toEqual([
      { day: "2026-12-02", full: false },
      { day: "2026-12-04", full: false },
    ]);
    expect(pickDays(rows, booked, 1, "2026-12-01", null)).toEqual([
      { day: "2026-12-02", full: true },
      { day: "2026-12-04", full: false },
    ]);
  });
});
