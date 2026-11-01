import { describe, expect, it } from "vitest";
import {
  addDays,
  calgaryDateOf,
  calgaryDayStart,
  calgaryInstant,
  calgaryToday,
  formatDateTime,
  formatDay,
  formatLongDay,
  formatTime,
} from "@/lib/time";

describe("Calgary dates", () => {
  it("knows the Calgary date, not the server's", () => {
    expect(calgaryToday(new Date("2026-10-28T05:59:00Z"))).toBe("2026-10-27");
    expect(calgaryToday(new Date("2026-10-28T06:00:00Z"))).toBe("2026-10-28");
    // Alberta Time: UTC-6 all year from November 1, 2026.
    expect(calgaryToday(new Date("2026-12-01T05:59:00Z"))).toBe("2026-11-30");
    expect(calgaryToday(new Date("2026-12-01T06:00:00Z"))).toBe("2026-12-01");
    // Before the change, winter was UTC-7.
    expect(calgaryToday(new Date("2025-12-01T06:59:00Z"))).toBe("2025-11-30");
  });

  it("finds the start of a Calgary day before and after Alberta stopped changing clocks", () => {
    expect(calgaryDayStart("2026-10-28")).toBe("2026-10-28T06:00:00.000Z");
    expect(calgaryDayStart("2026-11-01")).toBe("2026-11-01T06:00:00.000Z");
    expect(calgaryDayStart("2026-11-02")).toBe("2026-11-02T06:00:00.000Z");
    expect(calgaryDayStart("2027-01-15")).toBe("2027-01-15T06:00:00.000Z");
    expect(calgaryDayStart("2027-03-15")).toBe("2027-03-15T06:00:00.000Z");
    expect(calgaryDayStart("2026-03-08")).toBe("2026-03-08T07:00:00.000Z");
    expect(calgaryDayStart("2026-03-09")).toBe("2026-03-09T06:00:00.000Z");
  });

  it("turns a Calgary wall time into the moment it happens, the way the database does", () => {
    // Summer time before the change, UTC-6.
    expect(calgaryInstant("2026-10-31", "17:00")).toBe("2026-10-31T23:00:00.000Z");
    // No fall-back on November 1, 2026: still UTC-6, and for good.
    expect(calgaryInstant("2026-11-02", "17:00")).toBe("2026-11-02T23:00:00.000Z");
    expect(calgaryInstant("2026-12-15", "18:45")).toBe("2026-12-16T00:45:00.000Z");
    expect(calgaryInstant("2027-03-13", "17:00")).toBe("2027-03-13T23:00:00.000Z");
    // Winter before the change was UTC-7.
    expect(calgaryInstant("2026-03-07", "18:00")).toBe("2026-03-08T01:00:00.000Z");
    expect(calgaryInstant("2025-12-15", "17:00")).toBe("2025-12-16T00:00:00.000Z");
  });

  it("shows times in Calgary time whatever the device's own time zone data says", () => {
    expect(formatTime("2026-11-02T23:00:00Z")).toBe("5:00 p.m.");
    expect(formatTime("2026-10-31T23:00:00Z")).toBe("5:00 p.m.");
    expect(formatTime("2025-12-16T00:00:00Z")).toBe("5:00 p.m.");
    expect(formatDateTime("2026-12-16T00:45:00Z")).toBe("Dec 15, 6:45 p.m.");
    expect(calgaryDateOf("2026-11-03T05:30:00Z")).toBe("2026-11-02");
  });

  it("adds days on the calendar", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 7)).toBe("2027-01-07");
    expect(addDays("2026-10-28", -3)).toBe("2026-10-25");
  });

  it("formats a date with no time zone shift", () => {
    expect(formatDay("2026-10-30")).toBe("Fri, Oct 30");
    expect(formatLongDay("2026-10-28")).toBe("Wednesday, October 28");
  });
});
