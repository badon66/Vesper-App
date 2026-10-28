import Link from "next/link";
import { KnockCard } from "@/components/knock/knock-card";
import { StatusBadge } from "@/components/leads/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionProfile } from "@/lib/auth/profile";
import { summariseToday } from "@/lib/home/today";
import {
  closeMyStaleKnockSessions,
  lastNeighbourhood,
  namesById,
  openKnockSession,
} from "@/lib/leads/queries";
import { leadName } from "@/lib/leads/status";
import { createClient } from "@/lib/supabase/server";
import { calgaryDayStart, calgaryToday, formatLongDay, formatTime } from "@/lib/time";

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// The owner's Home is the dashboard. For now it shows today across the team,
// Keenan's own knock session (he knocks too), and today's leads. M3 adds
// tonight's meetings at the top and M6 the sales dashboard below. Every
// number says what it counts: knock sessions started today and leads added
// today, in Calgary time.
export async function OwnerHome({ profile }: { profile: SessionProfile }) {
  const supabase = await createClient();
  const today = calgaryToday();
  const dayStart = calgaryDayStart(today);
  const [sessionsResult, leadsResult, mySession, myLast] = await Promise.all([
    supabase
      .from("knock_sessions")
      .select("user_id, neighbourhood, started_at, ended_at, doors_knocked, conversations")
      .gte("started_at", dayStart),
    supabase
      .from("leads")
      .select("id, first_name, last_name, address_line, neighbourhood, status, created_by, created_at")
      .gte("created_at", dayStart)
      .order("created_at", { ascending: false })
      .limit(200),
    openKnockSession(supabase, profile.id),
    lastNeighbourhood(supabase, profile.id),
    closeMyStaleKnockSessions(supabase),
  ]);
  if (sessionsResult.error || leadsResult.error) throw new Error("Today's numbers could not be loaded.");
  const sessions = sessionsResult.data;
  const leads = leadsResult.data;
  const names = await namesById(supabase, [
    ...sessions.map((session) => session.user_id),
    ...leads.map((lead) => lead.created_by),
  ]);
  const team = summariseToday(sessions, leads, names);
  const { totals } = team;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Today</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatLongDay(today)}, Calgary time. Doors and conversations come from knock sessions
          started today; leads are the ones added today.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>The team today</CardTitle>
          <CardDescription>
            {team.rows.length === 0
              ? "Nobody has knocked or added a lead yet today."
              : `${plural(totals.doors, "door", "doors")}, ${plural(totals.conversations, "conversation", "conversations")} and ${plural(totals.leads, "lead", "leads")} across the team. ${plural(totals.knockingNow, "person", "people")} knocking now.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {team.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              When someone starts a knock session or adds a lead, they show up here with their
              doors, conversations and leads for today.
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border" aria-label="The team today">
              {team.rows.map((row) => (
                <li key={row.userId} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{row.name}</span>
                    {row.knockingNow ? (
                      <span className="rounded-full border border-primary px-2.5 py-0.5 text-xs font-semibold">
                        Knocking now
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {row.neighbourhoods.length > 0 ? row.neighbourhoods.join(", ") : "No knock session today"}
                  </p>
                  <dl className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Doors", value: row.doors },
                      { label: "Conversations", value: row.conversations },
                      { label: "Leads", value: row.leads },
                    ].map((stat) => (
                      <div key={stat.label}>
                        <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                        <dd className="text-lg font-bold tabular-nums">{stat.value}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <KnockCard key={mySession?.id ?? "none"} session={mySession} lastNeighbourhood={myLast} />

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s leads</CardTitle>
          <CardDescription>
            {leads.length === 0 ? "No leads added yet today." : `${plural(leads.length, "lead", "leads")} added today, newest first.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {leads.length === 0 ? (
            <p className="text-sm text-muted-foreground">Leads show up here as the team adds them.</p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border" aria-label="Today's leads">
              {leads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/app/leads/${lead.id}`}
                    className="flex min-h-16 flex-col justify-center gap-0.5 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{leadName(lead)}</span>
                      <StatusBadge status={lead.status} />
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {lead.address_line}
                      {lead.neighbourhood ? `, ${lead.neighbourhood}` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      By {names.get(lead.created_by) ?? "someone"} at {formatTime(lead.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
