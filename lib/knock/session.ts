// The Session tab's own rules (Keenan, 2026-11-05): how long someone has been
// out, the neighbourhoods to offer, who else is out today, and when a fixed
// start time is allowed. Pure functions, unit tested.

import { calgaryDayStart, calgaryInstant, formatTime } from "@/lib/time";

const MINUTE = 60_000;

// "1 h 12 min", "12 min", or "Under a minute". Never negative. Counted in
// whole minutes of the clock, so it agrees with the times shown beside it
// ("4:32 to 7:10 p.m." is 2 h 38 min, whatever the seconds were).
export function timeOutLabel(startIso: string, endMs: number): string {
  const minutes = Math.max(0, Math.floor(endMs / MINUTE) - Math.floor(new Date(startIso).getTime() / MINUTE));
  if (minutes < 1) return "Under a minute";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// The person's most recent neighbourhoods, newest first, each once (spelled
// as last typed; "bridgeland" and "Bridgeland " are the same place).
export function recentNeighbourhoods(rows: { neighbourhood: string }[], max = 4): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const name = row.neighbourhood.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === max) break;
  }
  return out;
}

export type OutSession = {
  user_id: string;
  neighbourhood: string;
  started_at: string;
  ended_at: string | null;
  doors_knocked: number;
  conversations: number;
};

export type OutTodayRow = {
  userId: string;
  name: string;
  // The latest session's neighbourhood, then any earlier ones today.
  neighbourhoods: string[];
  // Still out: since the open session started. Finished: first start to
  // last end today.
  out: boolean;
  from: string;
  until: string | null;
  doors: number;
  conversations: number;
};

// Everyone else who started a session today: the ones still out first (who
// went out first, first), then the ones who finished (who finished last,
// first). Doors and conversations add up across today's sessions.
export function outToday(sessions: OutSession[], names: Map<string, string>, excludeId: string | null): OutTodayRow[] {
  const byPerson = new Map<string, OutSession[]>();
  for (const session of sessions) {
    if (session.user_id === excludeId) continue;
    const list = byPerson.get(session.user_id) ?? [];
    list.push(session);
    byPerson.set(session.user_id, list);
  }
  const rows: OutTodayRow[] = [];
  for (const [userId, list] of byPerson) {
    const newestFirst = [...list].sort((a, b) => b.started_at.localeCompare(a.started_at));
    const open = newestFirst.find((session) => session.ended_at === null) ?? null;
    const neighbourhoods = recentNeighbourhoods(newestFirst, 3);
    const firstStart = newestFirst[newestFirst.length - 1].started_at;
    const lastEnd = newestFirst.reduce<string | null>(
      (latest, session) => (session.ended_at && (!latest || session.ended_at > latest) ? session.ended_at : latest),
      null,
    );
    rows.push({
      userId,
      name: names.get(userId) ?? "Someone",
      neighbourhoods,
      out: open !== null,
      from: open ? open.started_at : firstStart,
      until: open ? null : lastEnd,
      doors: list.reduce((sum, session) => sum + session.doors_knocked, 0),
      conversations: list.reduce((sum, session) => sum + session.conversations, 0),
    });
  }
  return rows.sort((a, b) => {
    if (a.out !== b.out) return a.out ? -1 : 1;
    if (a.out) return a.from.localeCompare(b.from) || a.name.localeCompare(b.name);
    return (b.until ?? "").localeCompare(a.until ?? "") || a.name.localeCompare(b.name);
  });
}

// A fixed start time, from the time field ("16:05"), on the session's own
// Calgary day: any time earlier that day, never in the future. Returns the
// moment, or what to say instead.
// notBefore: when the person's last session today ended, so two sessions
// never overlap (and time out never counts twice).
export function fixedStart(
  day: string,
  hhmm: string,
  nowMs: number,
  notBefore: string | null = null,
): { ok: true; startsAt: string } | { ok: false; error: string } {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return { ok: false, error: "Pick the time you started." };
  const startsAt = calgaryInstant(day, hhmm);
  if (new Date(startsAt).getTime() > nowMs) return { ok: false, error: "That time hasn't happened yet. Pick a time earlier today." };
  if (startsAt < calgaryDayStart(day)) return { ok: false, error: "Pick a time earlier today." };
  // By the minute, as times are shown: the minute the last session ended is
  // allowed, as its message says.
  if (notBefore && Math.floor(new Date(startsAt).getTime() / 60_000) < Math.floor(new Date(notBefore).getTime() / 60_000)) {
    return { ok: false, error: `Your last session today ended at ${formatTime(notBefore)}. Pick that time or later.` };
  }
  return { ok: true, startsAt };
}
