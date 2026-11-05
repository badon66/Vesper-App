import { describe, expect, it } from "vitest";
import { fixedStart, outToday, recentNeighbourhoods, timeOutLabel, type OutSession } from "@/lib/knock/session";
import { calgaryClock } from "@/lib/time";

const at = (iso: string) => new Date(iso).getTime();

describe("timeOutLabel", () => {
  it("reads in hours and minutes, and never goes negative", () => {
    expect(timeOutLabel("2026-11-05T22:00:00Z", at("2026-11-05T22:00:40Z"))).toBe("Under a minute");
    expect(timeOutLabel("2026-11-05T22:00:00Z", at("2026-11-05T22:12:59Z"))).toBe("12 min");
    expect(timeOutLabel("2026-11-05T22:00:00Z", at("2026-11-05T23:00:00Z"))).toBe("1 h");
    expect(timeOutLabel("2026-11-05T22:00:00Z", at("2026-11-05T23:12:00Z"))).toBe("1 h 12 min");
    expect(timeOutLabel("2026-11-05T22:00:00Z", at("2026-11-05T21:00:00Z"))).toBe("Under a minute");
  });
  it("counts whole minutes of the clock, so it matches the times shown", () => {
    // 4:32:50 to 7:10:10 shows as 4:32 to 7:10, which is 2 h 38 min.
    expect(timeOutLabel("2026-11-05T22:32:50Z", at("2026-11-06T01:10:10Z"))).toBe("2 h 38 min");
    expect(timeOutLabel("2026-11-05T22:32:59Z", at("2026-11-05T22:33:00Z"))).toBe("1 min");
  });
});

describe("recentNeighbourhoods", () => {
  it("keeps the newest spelling of each place, up to four", () => {
    const rows = ["Bridgeland ", "Renfrew", "bridgeland", "Crescent Heights", "", "Tuxedo Park", "Mount Pleasant"].map((neighbourhood) => ({ neighbourhood }));
    expect(recentNeighbourhoods(rows)).toEqual(["Bridgeland", "Renfrew", "Crescent Heights", "Tuxedo Park"]);
    expect(recentNeighbourhoods([])).toEqual([]);
  });
});

describe("outToday", () => {
  const session = (over: Partial<OutSession>): OutSession => ({
    user_id: "a",
    neighbourhood: "Bridgeland",
    started_at: "2026-11-05T22:00:00Z",
    ended_at: null,
    doors_knocked: 0,
    conversations: 0,
    ...over,
  });
  const names = new Map([
    ["a", "Zane S."],
    ["b", "Jaxon T."],
    ["c", "Keenan H."],
    ["me", "Me"],
  ]);

  it("leaves the viewer out, adds up the day, and puts the ones still out first", () => {
    const rows = outToday(
      [
        session({ user_id: "me", doors_knocked: 99 }),
        session({ user_id: "b", neighbourhood: "Renfrew", started_at: "2026-11-05T21:30:00Z", ended_at: "2026-11-05T23:05:00Z", doors_knocked: 30, conversations: 8 }),
        session({ user_id: "a", neighbourhood: "Renfrew", started_at: "2026-11-05T20:00:00Z", ended_at: "2026-11-05T21:00:00Z", doors_knocked: 10, conversations: 2 }),
        session({ user_id: "a", started_at: "2026-11-05T22:10:00Z", doors_knocked: 5, conversations: 1 }),
        session({ user_id: "c", neighbourhood: "Tuxedo Park", started_at: "2026-11-05T21:50:00Z", doors_knocked: 7 }),
      ],
      names,
      "me",
    );
    expect(rows.map((row) => row.name)).toEqual(["Keenan H.", "Zane S.", "Jaxon T."]);
    const zane = rows[1];
    expect(zane).toMatchObject({ out: true, from: "2026-11-05T22:10:00Z", until: null, doors: 15, conversations: 3, neighbourhoods: ["Bridgeland", "Renfrew"] });
    const jaxon = rows[2];
    expect(jaxon).toMatchObject({ out: false, from: "2026-11-05T21:30:00Z", until: "2026-11-05T23:05:00Z", doors: 30, conversations: 8 });
  });

  it("orders the finished by who finished last, and names an unknown person plainly", () => {
    const rows = outToday(
      [
        session({ user_id: "a", ended_at: "2026-11-05T23:00:00Z" }),
        session({ user_id: "x", ended_at: "2026-11-06T00:30:00Z" }),
      ],
      names,
      null,
    );
    expect(rows.map((row) => row.name)).toEqual(["Someone", "Zane S."]);
  });
});

describe("fixedStart", () => {
  const now = at("2026-11-05T23:30:00Z"); // 5:30 pm Calgary
  it("takes a time earlier today, in Calgary time", () => {
    const result = fixedStart("2026-11-05", "16:05", now);
    expect(result).toEqual({ ok: true, startsAt: "2026-11-05T22:05:00.000Z" });
    if (result.ok) expect(calgaryClock(result.startsAt)).toBe("16:05");
  });
  it("refuses a time that hasn't happened yet, or isn't a time", () => {
    expect(fixedStart("2026-11-05", "17:31", now).ok).toBe(false);
    expect(fixedStart("2026-11-05", "25:00", now).ok).toBe(false);
    expect(fixedStart("2026-11-05", "", now).ok).toBe(false);
    expect(fixedStart("2026-11-05", "4:05", now).ok).toBe(false);
  });
  it("allows any time from midnight", () => {
    expect(fixedStart("2026-11-05", "00:00", now).ok).toBe(true);
  });
  it("never goes back into a session that already ended today", () => {
    const ended = "2026-11-05T21:30:00Z"; // 3:30 p.m.
    const before = fixedStart("2026-11-05", "15:00", now, ended);
    expect(before.ok).toBe(false);
    if (!before.ok) expect(before.error).toContain("3:30");
    expect(fixedStart("2026-11-05", "15:30", now, ended).ok).toBe(true);
  });
});

describe("calgaryClock", () => {
  it("gives a 24-hour Calgary wall time on both sides of Alberta Time", () => {
    expect(calgaryClock("2026-11-05T22:05:00Z")).toBe("16:05");
    expect(calgaryClock("2026-11-06T06:00:00Z")).toBe("00:00");
    expect(calgaryClock("2026-10-15T22:05:00Z")).toBe("16:05");
  });
});
