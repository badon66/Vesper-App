// Today across the team, for the owner's Home: one row per person who
// knocked or added a lead today in Calgary, with team totals. Every number
// counts knock sessions started today and leads added today.

export type TodaySession = {
  user_id: string;
  neighbourhood: string;
  started_at: string;
  ended_at: string | null;
  doors_knocked: number;
  conversations: number;
};

export type TodayLead = { created_by: string; created_at: string };

export type TeamRow = {
  userId: string;
  name: string;
  knockingNow: boolean;
  // Most recent first, each once.
  neighbourhoods: string[];
  doors: number;
  conversations: number;
  leads: number;
};

export type TeamToday = {
  rows: TeamRow[];
  totals: { doors: number; conversations: number; leads: number; knockingNow: number };
};

export function summariseToday(
  sessions: TodaySession[],
  leads: TodayLead[],
  names: Map<string, string>,
): TeamToday {
  const rows = new Map<string, TeamRow>();
  const rowFor = (userId: string) => {
    let row = rows.get(userId);
    if (!row) {
      row = {
        userId,
        name: names.get(userId) ?? "Someone",
        knockingNow: false,
        neighbourhoods: [],
        doors: 0,
        conversations: 0,
        leads: 0,
      };
      rows.set(userId, row);
    }
    return row;
  };

  const newestFirst = [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at));
  for (const session of newestFirst) {
    const row = rowFor(session.user_id);
    if (session.ended_at === null) row.knockingNow = true;
    if (!row.neighbourhoods.includes(session.neighbourhood)) row.neighbourhoods.push(session.neighbourhood);
    row.doors += session.doors_knocked;
    row.conversations += session.conversations;
  }
  for (const lead of leads) rowFor(lead.created_by).leads += 1;

  const sorted = [...rows.values()].sort(
    (a, b) =>
      Number(b.knockingNow) - Number(a.knockingNow) ||
      b.doors - a.doors ||
      b.leads - a.leads ||
      a.name.localeCompare(b.name),
  );
  return {
    rows: sorted,
    totals: {
      doors: sorted.reduce((sum, row) => sum + row.doors, 0),
      conversations: sorted.reduce((sum, row) => sum + row.conversations, 0),
      leads: sorted.reduce((sum, row) => sum + row.leads, 0),
      knockingNow: sorted.filter((row) => row.knockingNow).length,
    },
  };
}
