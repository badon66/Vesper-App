import Link from "next/link";
import { DaySwitch } from "@/components/home/day-switch";
import { RefreshOnReturn } from "@/components/home/refresh-on-return";
import { SessionLink } from "@/components/home/session-link";
import { MeetingCard } from "@/components/schedule/meeting-card";
import { OutToday } from "@/components/session/out-today";
import type { SessionProfile } from "@/lib/auth/profile";
import { outTodayFor } from "@/lib/knock/queries";
import { namesById, openKnockSession } from "@/lib/leads/queries";
import { legs } from "@/lib/schedule/distance";
import { isLive } from "@/lib/schedule/meetings";
import { prepFor } from "@/lib/meetings/prep-queries";
import { meetingsOnDay, type MeetingWithLead } from "@/lib/schedule/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays, calgaryToday, formatLongDay, requestTime } from "@/lib/time";

const GONE = new Set(["moved", "cancelled"]);

// Keenan's Home (Keenan, 2026-11-05), top to bottom: Start knocking or his
// live session; today's meetings with a switch to tomorrow, each with what
// it still needs (round 7: Ready, or what's left on the prep list),
// how complete the lead is and, after the slot, how it went; who's out
// knocking right now. Owner only: View as never shows it. A glance, not a
// workbench: moved and cancelled bookings stay on Schedule, and the cards
// are compact (Meeting mode, Navigate, Call), so the evening fits a phone.
export async function OwnerHome({ profile }: { profile: SessionProfile }) {
  const supabase = await createClient();
  const today = calgaryToday();
  const tomorrow = addDays(today, 1);
  const [session, todayMeetings, tomorrowMeetings, settingsResult, out] = await Promise.all([
    openKnockSession(supabase, profile.id),
    meetingsOnDay(supabase, today, { viewer: profile }),
    meetingsOnDay(supabase, tomorrow, { viewer: profile }),
    supabase.from("settings").select("not_qualified_reasons").eq("id", 1).maybeSingle(),
    outTodayFor(supabase, profile.id),
  ]);
  const all = [...todayMeetings, ...tomorrowMeetings];
  // Round 7: each meeting's prep list, as on the Meetings page.
  const meetingByLead = new Map(all.filter((meeting) => isLive(meeting.status)).map((meeting) => [meeting.lead_id, meeting]));
  const [names, prep] = await Promise.all([
    namesById(
      supabase,
      all.flatMap((meeting) => [meeting.setter_id, meeting.booked_by, meeting.outcome_by]),
    ),
    prepFor(
      supabase,
      all.map((meeting) => meeting.lead),
      (leadId) => meetingByLead.get(leadId) ?? null,
    ),
  ]);
  const reasons = settingsResult.data?.not_qualified_reasons ?? [];
  const now = requestTime();

  // One evening's cards, in time order, with the straight-line distance
  // from the meeting before.
  // His next meeting that hasn't started, across today and tomorrow.
  const nextId = [...todayMeetings, ...tomorrowMeetings].find(
    (meeting) => isLive(meeting.status) && new Date(meeting.starts_at).getTime() > now,
  )?.id;
  const needsPrep = (meeting: MeetingWithLead) => prep.get(meeting.lead_id)?.ready === false;
  const glance = (meeting: MeetingWithLead) => {
    const summary = prep.get(meeting.lead_id);
    return summary ? { ready: summary.ready, left: summary.left, line: summary.line } : null;
  };

  const cards = (all: MeetingWithLead[], empty: string) => {
    const held = all.filter((meeting) => !GONE.has(meeting.status));
    if (held.length === 0) {
      return (
        <div className="flex flex-col items-start gap-1">
          <p className="text-sm text-pretty text-muted-foreground">{empty}</p>
          <Link href="/app/schedule" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
            Open the schedule
          </Link>
        </div>
      );
    }
    const distances = legs(
      held.map((meeting) => ({ startsAt: meeting.starts_at, lat: meeting.lead.lat, lng: meeting.lead.lng, neighbourhood: meeting.lead.neighbourhood })),
    );
    // Prep is for meetings still ahead; once a slot starts it's past fixing.
    const ahead = held.filter((meeting) => isLive(meeting.status) && new Date(meeting.starts_at).getTime() > now);
    const toPrep = ahead.filter(needsPrep).length;
    const upcoming = ahead.length;
    return (
      <div className="flex flex-col gap-3">
        {toPrep > 0 ? (
          // The evening's prep in one line, so he needn't add up the cards.
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-pretty" data-testid="prep-summary">
            <span>
              {toPrep} of {upcoming} still to prepare.
            </span>
            <Link href="/app/meetings" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
              Open Meetings
            </Link>
          </p>
        ) : null}
        {held.map((meeting, index) => (
          <MeetingCard
            key={meeting.id}
            meeting={meeting}
            names={names}
            now={now}
            canChange
            isOwner
            reasons={reasons}
            legKm={distances[index] ?? null}
            previousTime={held[index - 1]?.starts_at ?? null}
            showDetails
            compact
            next={meeting.id === nextId}
            prep={glance(meeting)}
          />
        ))}
      </div>
    );
  };
  const count = (meetings: MeetingWithLead[]) => meetings.filter((meeting) => !GONE.has(meeting.status)).length;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">{formatLongDay(today)}</h1>
      <RefreshOnReturn />

      <SessionLink session={session} />

      <DaySwitch
        headingId="meetings-heading"
        testId="home-meetings"
        days={[
          {
            label: "Today",
            title: "Meetings today",
            count: count(todayMeetings),
            content: cards(todayMeetings, "No meetings today. When a setter books one, it shows here in time order."),
          },
          {
            label: "Tomorrow",
            title: "Meetings tomorrow",
            count: count(tomorrowMeetings),
            content: cards(tomorrowMeetings, "Nothing booked for tomorrow yet."),
          },
        ]}
      />

      <OutToday rows={out} nowOnly />
    </div>
  );
}
