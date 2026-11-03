// The held time's countdown (round 2, Keenan, 2026-11-03). The database
// says when the hold runs out and what time it is there; the phone counts
// down from that, so a phone clock that is off by a minute still shows the
// right time left. Kept pure so it is unit tested.

export type HoldClock = {
  // When the hold runs out, in the server's time.
  expiresAt: number;
  // The server's clock minus the phone's, when the answer arrived.
  offset: number;
};

export const UNDER_A_MINUTE_MS = 60_000;

export function clockFrom(reply: unknown, phoneNow: number): HoldClock | null {
  const value = reply as { expires_at?: unknown; now?: unknown } | null;
  const expiresAt = typeof value?.expires_at === "string" ? Date.parse(value.expires_at) : NaN;
  if (!Number.isFinite(expiresAt)) return null;
  const serverNow = typeof value?.now === "string" ? Date.parse(value.now) : NaN;
  return { expiresAt, offset: Number.isFinite(serverNow) ? serverNow - phoneNow : 0 };
}

export function remainingMs(clock: HoldClock, phoneNow: number): number {
  return Math.max(0, clock.expiresAt - (phoneNow + clock.offset));
}

// "4:32", "0:09", "0:00".
export function formatCountdown(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export type HoldPhase = "plenty" | "under_a_minute" | "run_out";

export function holdPhase(ms: number): HoldPhase {
  if (ms <= 0) return "run_out";
  return ms < UNDER_A_MINUTE_MS ? "under_a_minute" : "plenty";
}

// What a screen reader hears, once per change of phase.
export function phaseAnnouncement(phase: HoldPhase): string {
  if (phase === "under_a_minute") return "Under a minute left on this time.";
  if (phase === "run_out") return "Your hold ran out.";
  return "";
}
