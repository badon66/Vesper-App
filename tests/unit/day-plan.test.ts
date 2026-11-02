import { describe, expect, it } from "vitest";
import { dayPlan, openRuns } from "@/lib/schedule/day-plan";
import { calgaryInstant } from "@/lib/time";

const day = "2026-11-14";
const at = (hhmm: string) => calgaryInstant(day, hhmm);
const times = (start: string, minutes: number, count: number) => {
  const [h, m] = start.split(":").map(Number);
  return Array.from({ length: count }, (_, k) => {
    const total = h * 60 + m + k * minutes;
    return at(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
  });
};

describe("What an evening would look like with new times", () => {
  it("keeps every booking, offers only times clear of them, and says why the rest are left off", () => {
    // The critique's case: bookings at 5:00 and 5:35 (35-minute meetings),
    // then 45-minute meetings. 5:00 still lines up; 5:35 doesn't.
    const bookings = [
      { startsAt: at("17:00"), endsAt: at("17:35"), label: "Evanston" },
      { startsAt: at("17:35"), endsAt: at("18:10"), label: "Sage Hill" },
    ];
    const rows = dayPlan(times("17:00", 45, 4), 45, bookings, []);
    expect(rows.map((row) => [row.kind, row.startsAt])).toEqual([
      ["booked", at("17:00")],
      ["booked", at("17:35")],
      ["left-off", at("17:45")],
      ["open", at("18:30")],
      ["open", at("19:15")],
    ]);
    expect(rows[0]).toMatchObject({ aligned: true, label: "Evanston" });
    expect(rows[1]).toMatchObject({ aligned: false });
    expect(rows[2]).toMatchObject({ because: at("17:35") });
  });

  it("marks new times inside a block as blocked", () => {
    const rows = dayPlan(times("18:00", 45, 3), 45, [], [{ startsAt: at("18:45"), endsAt: at("19:30") }]);
    expect(rows.map((row) => row.kind)).toEqual(["open", "blocked", "open"]);
  });

  it("is the evening as it is when nothing changes", () => {
    const bookings = [{ startsAt: at("18:45"), endsAt: at("19:30"), label: null }];
    const rows = dayPlan(times("18:00", 45, 4), 45, bookings, []);
    expect(rows.map((row) => row.kind)).toEqual(["open", "booked", "open", "open"]);
    expect(rows[1]).toMatchObject({ aligned: true });
  });
});

describe("Blocking the whole evening", () => {
  const slot = (hhmm: string, end: string, state: string) => ({ startsAt: at(hhmm), endsAt: at(end), state });

  it("blocks every open time as back-to-back runs, and never a booked or held one", () => {
    const runs = openRuns([
      slot("17:00", "17:35", "booked"),
      slot("17:35", "18:10", "open"),
      slot("18:10", "18:45", "open"),
      slot("18:45", "19:20", "held"),
      slot("19:20", "19:55", "open"),
      slot("19:55", "20:30", "closed"),
    ]);
    expect(runs).toEqual([
      { startsAt: at("17:35"), endsAt: at("18:45"), count: 2 },
      { startsAt: at("19:20"), endsAt: at("19:55"), count: 1 },
    ]);
  });

  it("is one block for an evening with nothing booked, and nothing for one with nothing open", () => {
    expect(openRuns([slot("18:00", "18:45", "open"), slot("18:45", "19:30", "open")])).toEqual([{ startsAt: at("18:00"), endsAt: at("19:30"), count: 2 }]);
    expect(openRuns([slot("18:00", "18:45", "booked"), slot("18:45", "19:30", "blocked")])).toEqual([]);
  });
});
