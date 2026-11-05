import { Check, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { DaySwitch } from "@/components/home/day-switch";
import { RefreshOnReturn } from "@/components/home/refresh-on-return";
import { SessionLink } from "@/components/home/session-link";
import type { SessionProfile } from "@/lib/auth/profile";
import { pastTimeLabel, splitMine, teamRows, type TeamRow } from "@/lib/home/team";
import { followUpLabel } from "@/lib/leads/attention";
import { followUpsDue, namesById, openKnockSession } from "@/lib/leads/queries";
import { completenessLabel } from "@/lib/leads/questions";
import { leadName } from "@/lib/leads/status";
import { heldTimeLabel, MEETING_STATUS_LABELS } from "@/lib/schedule/meetings";
import { bookingSettings, meetingsBetween, meetingsOnDay, type MeetingWithLead } from "@/lib/schedule/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays, calgaryDayStart, calgaryToday, formatLongDay, formatTime, requestTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// How far back "How mine went" looks, and how many of those show before
// "Show all" (two evenings' worth), so Follow-ups due stays in reach.
const PAST_DAYS = 7;
const PAST_SHOWN = 4;

// A setter's Home (Keenan, 2026-11-05), top to bottom: Start knocking or the
// live session; the team's schedule for today, with a switch to tomorrow
// (every meeting's time, area and who booked it, never a customer's name,
// phone or email); How mine went (their own bookings: how each meeting in
// the last 7 days went, then what's coming up); follow-ups due. Every query
// is scoped to this person or to the team, so View as shows exactly what
// they would see (CLAUDE.md, View as).
export async function SalesHome({ profile }: { profile: SessionProfile }) {
  const supabase = await createClient();
  const today = calgaryToday();
  const tomorrow = addDays(today, 1);
  const settings = await bookingSettings(supabase);
  const [session, due, teamToday, teamTomorrow, mine] = await Promise.all([
    openKnockSession(supabase, profile.id),
    followUpsDue(supabase, profile.id, today),
    // No viewer: the team's list asks for no contact details at all.
    meetingsOnDay(supabase, today),
    meetingsOnDay(supabase, tomorrow),
    meetingsBetween(supabase, calgaryDayStart(addDays(today, -PAST_DAYS)), calgaryDayStart(addDays(today, settings.windowDays + 1)), {
      setterId: profile.id,
      viewer: profile,
    }),
  ]);
  const names = await namesById(
    supabase,
    [...teamToday, ...teamTomorrow, ...mine].flatMap((meeting) => [meeting.setter_id, meeting.booked_by, meeting.outcome_by]),
  );
  const now = requestTime();
  const { coming, past } = splitMine(mine, now);
  const todayRows = teamRows(teamToday, names, profile.id);
  const tomorrowRows = teamRows(teamTomorrow, names, profile.id);
  const firstName = profile.full_name.split(" ")[0] || profile.full_name;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatLongDay(today)}</p>
      </div>
      <RefreshOnReturn />

      <SessionLink session={session} />

      <DaySwitch
        headingId="team-heading"
        testId="team-schedule"
        days={[
          {
            label: "Today",
            title: "Team schedule today",
            count: todayRows.length,
            content: <TeamList rows={todayRows} empty="Nothing booked for today yet. Every meeting the team books shows here, in time order." />,
          },
          {
            label: "Tomorrow",
            title: "Team schedule tomorrow",
            count: tomorrowRows.length,
            content: <TeamList rows={tomorrowRows} empty="Nothing booked for tomorrow yet." />,
          },
        ]}
      />

      <section aria-labelledby="mine-heading" className="flex flex-col gap-3" data-testid="how-mine-went">
        <h2 id="mine-heading" className="text-lg font-bold">
          How mine went
        </h2>
        {coming.length === 0 && past.length === 0 ? (
          <p className="text-sm text-pretty text-muted-foreground">
            No bookings in the last 7 days or coming up. Book a time from Session or Schedule, and it shows here.
          </p>
        ) : null}
        {past.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-bold">Last 7 days</h3>
            <ul className="flex flex-col divide-y rounded-md border" aria-label="Last 7 days">
              {past.slice(0, PAST_SHOWN).map((meeting) => (
                <PastRow key={meeting.id} meeting={meeting} today={today} />
              ))}
            </ul>
            {past.length > PAST_SHOWN ? (
              <details className="group flex flex-col gap-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  <span className="group-open:hidden">Show all {past.length} from the last 7 days</span>
                  <span className="hidden group-open:inline">Show fewer</span>
                  <ChevronDown aria-hidden="true" className="size-4 group-open:rotate-180" />
                </summary>
                <ul className="flex flex-col divide-y rounded-md border" aria-label="Earlier in the last 7 days">
                  {past.slice(PAST_SHOWN).map((meeting) => (
                    <PastRow key={meeting.id} meeting={meeting} today={today} />
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
        {coming.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-base font-bold">Coming up</h3>
            <ul className="flex flex-col divide-y rounded-md border" aria-label="Coming up">
              {coming.map((meeting) => (
                <ComingRow key={meeting.id} meeting={meeting} />
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="due-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="due-heading" className="text-lg font-bold">
            Follow-ups due
          </h2>
          {due.length > 0 ? (
            <p className="text-sm text-pretty text-muted-foreground">Your Follow up leads dated today or earlier, the oldest first.</p>
          ) : null}
        </div>
        {due.length === 0 ? (
          <p className="text-sm text-pretty text-muted-foreground">
            None due today. When you move a lead to Follow up, it shows here on the day you picked.
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border" aria-label="Follow-ups due">
            {due.map((lead) => {
              const label = lead.follow_up_on ? followUpLabel(lead.follow_up_on, today) : "Due today";
              return (
                <li key={lead.id}>
                  <Link
                    href={`/app/leads/${lead.id}`}
                    className="flex min-h-16 flex-col justify-center gap-0.5 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <span className="font-semibold">{leadName(lead)}</span>
                    <span className="text-sm text-muted-foreground">
                      {lead.address_line}
                      {lead.neighbourhood ? `, ${lead.neighbourhood}` : ""}
                    </span>
                    <span className={cn("text-sm text-foreground", label.startsWith("Overdue") ? "font-bold" : "font-semibold")}>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// One evening of the team's meetings: when, where, and who booked it, two
// lines each so "who booked" always sits in the same place. The setter's
// own rows read in full strength and open their lead.
function TeamList({ rows, empty }: { rows: TeamRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-pretty text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {rows.map((row) => {
        const body = (
          <>
            <span className="min-w-[4.75rem] shrink-0 font-bold whitespace-nowrap tabular-nums">{formatTime(row.startsAt)}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold text-pretty">{row.area}</span>
              <span className={cn("text-sm", row.mine ? "font-semibold text-foreground" : "text-muted-foreground")}>{row.whose}</span>
            </span>
          </>
        );
        return (
          <li key={row.id} data-testid="team-row" data-mine={row.mine ? "true" : undefined}>
            {row.leadId ? (
              <Link
                href={`/app/leads/${row.leadId}`}
                className="flex min-h-14 items-center gap-3 px-4 py-2 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                {body}
                <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            ) : (
              <div className="flex min-h-14 items-center gap-3 px-4 py-2">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// A booking that already happened: whose, when, and how it went, the
// outcome in its own column so a week reads down one edge. Qualified, the
// one that earns, carries a tick (no colour: DESIGN.md).
function PastRow({ meeting, today }: { meeting: MeetingWithLead; today: string }) {
  const lead = meeting.lead;
  const waiting = meeting.status === "booked" || meeting.status === "confirmed";
  return (
    <li>
      <Link
        href={`/app/leads/${lead.id}`}
        className="flex min-h-16 items-center gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        data-testid="past-booking"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-semibold">{leadName(lead)}</span>
          <span className="text-sm text-muted-foreground">
            {pastTimeLabel(meeting.starts_at, today)}
            {lead.neighbourhood ? `, ${lead.neighbourhood}` : ""}
          </span>
          {meeting.status === "not_qualified" && meeting.outcome_reason ? (
            <span className="text-sm text-muted-foreground">Reason: {meeting.outcome_reason}</span>
          ) : null}
        </span>
        <span
          className={cn(
            "flex max-w-[45%] shrink-0 items-center gap-1 text-right text-sm",
            waiting ? "text-muted-foreground" : "font-semibold",
            meeting.status === "qualified" && "font-bold",
          )}
          data-testid="past-outcome"
        >
          {meeting.status === "qualified" ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
          {waiting ? "Not marked yet" : MEETING_STATUS_LABELS[meeting.status]}
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}

// A booking still ahead: when, who, where and how complete the lead is. It
// opens the lead, where Move and Cancel are (as on Schedule).
function ComingRow({ meeting }: { meeting: MeetingWithLead }) {
  const lead = meeting.lead;
  return (
    <li>
      <Link
        href={`/app/leads/${lead.id}`}
        className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        data-testid="coming-booking"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-bold tabular-nums">{heldTimeLabel(meeting.starts_at)}</span>
          <span className="font-semibold">{leadName(lead)}</span>
          <span className="text-sm text-muted-foreground">
            {lead.neighbourhood || lead.address_line}
            <span aria-hidden="true"> · </span>
            <span className="whitespace-nowrap" data-testid="completeness">
              {completenessLabel(lead)}
            </span>
          </span>
        </span>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      </Link>
    </li>
  );
}
