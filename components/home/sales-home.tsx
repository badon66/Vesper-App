import Link from "next/link";
import { DaySwitch } from "@/components/home/day-switch";
import { SessionLink } from "@/components/home/session-link";
import { MeetingCard } from "@/components/schedule/meeting-card";
import type { SessionProfile } from "@/lib/auth/profile";
import { splitMine, teamRows, type TeamRow } from "@/lib/home/team";
import { followUpLabel } from "@/lib/leads/attention";
import { followUpsDue, namesById, openKnockSession } from "@/lib/leads/queries";
import { leadName } from "@/lib/leads/status";
import { formatMeetingTime, MEETING_STATUS_LABELS } from "@/lib/schedule/meetings";
import { bookingSettings, meetingsBetween, meetingsOnDay, type MeetingWithLead } from "@/lib/schedule/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays, calgaryDayStart, calgaryToday, formatTime, requestTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// How far back "How mine went" looks.
const PAST_DAYS = 7;

// A setter's Home (Keenan, 2026-11-05), top to bottom: Start knocking or the
// live session; the team's schedule for today, with a switch to tomorrow
// (every meeting's time, area and who booked it, never a customer's name,
// phone or email); How mine went (their own bookings, what's coming and how
// each meeting went); follow-ups due. Every query is scoped to this person
// or to the team, so View as shows exactly what they would see (CLAUDE.md,
// View as).
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
      <h1 className="text-2xl font-bold">Hello, {firstName}</h1>

      <SessionLink session={session} />

      <DaySwitch
        heading="Team schedule"
        headingId="team-heading"
        testId="team-schedule"
        days={[
          {
            label: "Today",
            count: todayRows.length,
            content: <TeamList rows={todayRows} empty="Nothing booked for today yet. Every meeting the team books shows here, in time order." />,
          },
          {
            label: "Tomorrow",
            count: tomorrowRows.length,
            content: <TeamList rows={tomorrowRows} empty="Nothing booked for tomorrow yet." />,
          },
        ]}
      />

      <section aria-labelledby="mine-heading" className="flex flex-col gap-3" data-testid="how-mine-went">
        <div>
          <h2 id="mine-heading" className="text-lg font-bold">
            How mine went
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Your bookings: what&apos;s coming up, then how each meeting went this past week, once Keenan marks it.
          </p>
        </div>
        {coming.length === 0 && past.length === 0 ? (
          <p className="text-sm text-pretty text-muted-foreground">
            No bookings yet. Book a time from Session or Schedule, and it shows here.
          </p>
        ) : null}
        {coming.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">Coming up</h3>
            {coming.map((meeting) => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                names={names}
                now={now}
                canChange
                isOwner={false}
                reasons={[]}
                showLead
                showDay
                viewerId={profile.id}
              />
            ))}
          </div>
        ) : null}
        {past.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">How they went</h3>
            <ul className="flex flex-col divide-y rounded-md border" aria-label="How they went">
              {past.map((meeting) => (
                <PastRow key={meeting.id} meeting={meeting} />
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
          <p className="text-sm text-muted-foreground">Your Follow up leads dated today or earlier, the oldest first.</p>
        </div>
        {due.length === 0 ? (
          <p className="text-sm text-muted-foreground">
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

// One evening of the team's meetings: when, where, and who booked it.
function TeamList({ rows, empty }: { rows: TeamRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-pretty text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {rows.map((row) => (
        <li key={row.id} className="flex items-baseline gap-4 px-4 py-3" data-testid="team-row">
          <span className="w-20 shrink-0 font-bold tabular-nums">{formatTime(row.startsAt)}</span>
          <span className="flex min-w-0 flex-col">
            <span className="font-semibold text-pretty">{row.area}</span>
            <span className="text-sm text-muted-foreground">{row.mine ? "Your booking" : `Booked by ${row.bookedBy}`}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// A booking that already happened: when, whose, and how it went.
function PastRow({ meeting }: { meeting: MeetingWithLead }) {
  const lead = meeting.lead;
  const outcome =
    meeting.status === "booked" || meeting.status === "confirmed" ? "Waiting for Keenan to mark it" : MEETING_STATUS_LABELS[meeting.status];
  return (
    <li>
      <Link
        href={`/app/leads/${lead.id}`}
        className="flex min-h-16 flex-col justify-center gap-0.5 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        data-testid="past-booking"
      >
        <span className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="font-semibold">{leadName(lead)}</span>
          <span className="text-sm font-semibold">{outcome}</span>
        </span>
        <span className="text-sm text-muted-foreground">
          {formatMeetingTime(meeting.starts_at)}
          {lead.neighbourhood ? `, ${lead.neighbourhood}` : ""}
        </span>
        {meeting.status === "not_qualified" && meeting.outcome_reason ? (
          <span className="text-sm text-muted-foreground">Reason: {meeting.outcome_reason}</span>
        ) : null}
      </Link>
    </li>
  );
}
