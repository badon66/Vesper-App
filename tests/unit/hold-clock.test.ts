import { describe, expect, it } from "vitest";
import { clockFrom, formatCountdown, holdPhase, phaseAnnouncement, remainingMs } from "@/lib/booking/hold-clock";

// The held time's countdown (round 2): the database says when a hold runs
// out and what time it is there; the phone counts down from that.

describe("The hold countdown", () => {
  it("counts from the database's clock, even when the phone's clock is off", () => {
    const serverNow = Date.parse("2026-11-14T02:00:00Z");
    const phoneNow = serverNow - 90_000; // the phone runs 90 seconds slow
    const clock = clockFrom({ expires_at: "2026-11-14T02:05:00Z", now: "2026-11-14T02:00:00Z" }, phoneNow);
    expect(clock).not.toBeNull();
    expect(remainingMs(clock!, phoneNow)).toBe(5 * 60_000);
    expect(remainingMs(clock!, phoneNow + 60_000)).toBe(4 * 60_000);
    expect(remainingMs(clock!, phoneNow + 6 * 60_000)).toBe(0);
  });

  it("refuses an answer with no end time, and trusts the phone when the server's time is missing", () => {
    expect(clockFrom(null, 0)).toBeNull();
    expect(clockFrom({ now: "2026-11-14T02:00:00Z" }, 0)).toBeNull();
    const clock = clockFrom({ expires_at: "2026-11-14T02:05:00Z" }, Date.parse("2026-11-14T02:00:00Z"));
    expect(clock?.offset).toBe(0);
  });

  it("shows minutes and seconds, rounding up so 0:00 means it has run out", () => {
    expect(formatCountdown(5 * 60_000)).toBe("5:00");
    expect(formatCountdown(272_000)).toBe("4:32");
    expect(formatCountdown(8_200)).toBe("0:09");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-500)).toBe("0:00");
  });

  it("says when there is under a minute left, and when it has run out, once each", () => {
    expect(holdPhase(61_000)).toBe("plenty");
    expect(holdPhase(60_000)).toBe("plenty");
    expect(holdPhase(59_999)).toBe("under_a_minute");
    expect(holdPhase(1)).toBe("under_a_minute");
    expect(holdPhase(0)).toBe("run_out");
    expect(phaseAnnouncement("under_a_minute")).toBe("Under a minute left on this time.");
    expect(phaseAnnouncement("run_out")).toBe("Your hold ran out.");
    expect(phaseAnnouncement("plenty")).toBe("");
  });
});
