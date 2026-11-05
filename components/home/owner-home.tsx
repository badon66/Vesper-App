import Link from "next/link";
import { DaySwitch } from "@/components/home/day-switch";
import { SessionLink } from "@/components/home/session-link";
import { MeetingCard } from "@/components/schedule/meeting-card";
import { OutToday } from "@/components/session/out-today";
import type { SessionProfile } from "@/lib/auth/profile";
import { outTodayFor } from "@/lib/knock/queries";
import { namesById, openKnockSession } from "@/lib/leads/queries";
import { legs } from "@/lib/schedule/distance";
import { meetingsOnDay, slotPhotoLinks, type MeetingWithLead } from "@/lib/schedule/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays, calgaryToday, formatLongDay, requestTime } from "@/lib/time";

const GONE = new Set(["moved", "cancelled"]);

// Keenan's Home (Keenan, 2026-11-05), top to bottom: Start knocking or his
// live session; today's meetings with a switch to tomorrow, each with what
// it still needs (the Meetings page's flags: no mockup, no track colour),
// how complete the lead is and, after the slot, how it went; who's out
// knocking right now. Owner only: View as never shows it.
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
  const leadIds = Array.from(new Set(all.map((meeting) => meeting.lead_id)));
  const [names, photos, colourRows, mockupRows] = await Promise.all([
    namesById(
      supabase,
      all.flatMap((meeting) => [meeting.setter_id, meeting.booked_by, meeting.outcome_by]),
    ),
    slotPhotoLinks(supabase, leadIds),
    leadIds.length > 0
      ? supabase.from("leads").select("id, track_colour_id, track_ral_code").in("id", leadIds).then(({ data }) => data ?? [])
      : Promise.resolve([]),
    leadIds.length > 0
      ? supabase.from("lead_photos").select("lead_id").eq("slot", "mockup").in("lead_id", leadIds).then(({ data }) => data ?? [])
      : Promise.resolve([]),
  ]);
  const hasColour = new Set(colourRows.filter((row) => row.track_colour_id || row.track_ral_code).map((row) => row.id));
  const hasMockup = new Set(mockupRows.map((row) => row.lead_id));
  const reasons = settingsResult.data?.not_qualified_reasons ?? [];
  const now = requestTime();

  // One evening's cards, in time order, with the straight-line distance
  // from the meeting before.
  const cards = (meetings: MeetingWithLead[], empty: string) => {
    if (meetings.length === 0) {
      return (
        <div className="flex flex-col items-start gap-1">
          <p className="text-sm text-pretty text-muted-foreground">{empty}</p>
          <Link href="/app/schedule" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
            Open the schedule
          </Link>
        </div>
      );
    }
    const held = meetings.filter((meeting) => !GONE.has(meeting.status));
    const distances = legs(
      held.map((meeting) => ({ startsAt: meeting.starts_at, lat: meeting.lead.lat, lng: meeting.lead.lng, neighbourhood: meeting.lead.neighbourhood })),
    );
    const legById = new Map(held.map((meeting, index) => [meeting.id, { km: distances[index], previous: held[index - 1]?.starts_at ?? null }]));
    return (
      <div className="flex flex-col gap-3">
        {meetings.map((meeting) => (
          <MeetingCard
            key={meeting.id}
            meeting={meeting}
            names={names}
            now={now}
            canChange
            isOwner
            reasons={reasons}
            photos={photos.get(meeting.lead_id) ?? []}
            legKm={legById.get(meeting.id)?.km ?? null}
            previousTime={legById.get(meeting.id)?.previous ?? null}
            showDetails
            prep={{ missingMockup: !hasMockup.has(meeting.lead_id), missingColour: !hasColour.has(meeting.lead_id) }}
          />
        ))}
      </div>
    );
  };
  const count = (meetings: MeetingWithLead[]) => meetings.filter((meeting) => !GONE.has(meeting.status)).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Today</h1>
        <p className="mt-1 text-sm text-muted-foreground">{formatLongDay(today)}, Calgary time.</p>
      </div>

      <SessionLink session={session} />

      <DaySwitch
        heading="Meetings"
        headingId="meetings-heading"
        testId="home-meetings"
        days={[
          {
            label: "Today",
            count: count(todayMeetings),
            content: cards(todayMeetings, "No meetings today. When a setter books one, it shows here in time order."),
          },
          {
            label: "Tomorrow",
            count: count(tomorrowMeetings),
            content: cards(tomorrowMeetings, "Nothing booked for tomorrow yet."),
          },
        ]}
      />

      <OutToday rows={out} nowOnly />
    </div>
  );
}
