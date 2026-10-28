import { describe, expect, it } from "vitest";
import { addDays, calgaryDayStart, calgaryToday, formatDay, formatLongDay } from "@/lib/time";

describe("Calgary dates", () => {
  it("knows the Calgary date, not the server's", () => {
    expect(calgaryToday(new Date("2026-10-28T05:59:00Z"))).toBe("2026-10-27");
    expect(calgaryToday(new Date("2026-10-28T06:00:00Z"))).toBe("2026-10-28");
    expect(calgaryToday(new Date("2026-12-01T06:59:00Z"))).toBe("2026-11-30");
  });

  it("finds the start of a Calgary day on both sides of daylight saving", () => {
    expect(calgaryDayStart("2026-10-28")).toBe("2026-10-28T06:00:00.000Z");
    expect(calgaryDayStart("2026-11-01")).toBe("2026-11-01T06:00:00.000Z");
    expect(calgaryDayStart("2026-11-02")).toBe("2026-11-02T07:00:00.000Z");
    expect(calgaryDayStart("2026-03-08")).toBe("2026-03-08T07:00:00.000Z");
    expect(calgaryDayStart("2026-03-09")).toBe("2026-03-09T06:00:00.000Z");
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
