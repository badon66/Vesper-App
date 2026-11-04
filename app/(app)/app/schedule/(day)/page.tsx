import type { Metadata } from "next";
import { NotForYourRole } from "@/components/not-for-your-role";
import { MeetingCard } from "@/components/schedule/meeting-card";
import { ScheduleBoard, type OwnerEveningTools } from "@/components/schedule/schedule-board";
import { getViewer } from "@/lib/auth/profile";
import type { ContactViewer } from "@/lib/leads/contact-rules";
import { namesById } from "@/lib/leads/queries";
import { eveningsOf, pickEvening } from "@/lib/schedule/board";
import { legs } from "@/lib/schedule/distance";
import { bookingSettings, fetchBoard, meetingsOnDay, slotPhotoLinks } from "@/lib/schedule/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays, calgaryDayStart, calgaryToday, formatLongDay, requestTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Schedule",
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// The Schedule tab for setters and Keenan (Keenan, 2026-11-01 and
// 2026-11-02). Everyone sees the board: open, held, booked and blocked
// times, tonight and the next evenings; tapping an open time opens the
// booking sheet. Keenan also sees the evening's bookings in full, marks
// outcomes, blocks times and changes an evening's times from the header.
// His Schedule opens on tonight whenever tonight has meetings.
export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const { profile: me, real } = await getViewer();
  if (me.role !== "owner" && me.role !== "sales") return <NotForYourRole />;
  const isOwner = me.role === "owner";
  const supabase = await createClient();
  const today = calgaryToday();
  const [settings, board] = await Promise.all([bookingSettings(supabase), fetchBoard(supabase, me, real.role)]);
  const evenings = eveningsOf(board, today, settings.windowDays);
  const { day: dayParam } = await searchParams;
  const lastDay = addDays(today, settings.windowDays);
  const tonightHasMeetings = board.some((slot) => slot.day === today);
  const day =
    dayParam && DAY.test(dayParam) && dayParam >= today && dayParam <= lastDay
      ? dayParam
      : isOwner && tonightHasMeetings
        ? today
        : pickEvening(evenings, today).day;
  const tools = isOwner ? await ownerTools(day) : null;

  return (
    <ScheduleBoard
      board={board}
      today={today}
      windowDays={settings.windowDays}
      asSales={!isOwner}
      viewerId={real.id !== me.id ? me.id : null}
      initialDay={day}
      owner={tools}
    >
      {isOwner ? <OwnerEvening day={day} today={today} viewer={me} /> : null}
    </ScheduleBoard>
  );
}

// What Keenan's header tools need for the evening on screen: its blocks and
// its times, its own schedule's or the usual template's.
async function ownerTools(day: string): Promise<OwnerEveningTools> {
  const supabase = await createClient();
  const [{ data: settingsRow }, { data: blocks }, { data: owners }] = await Promise.all([
    supabase
      .from("settings")
      .select("meeting_days, meeting_start, meeting_slot_minutes, meeting_slot_count, meeting_host_id")
      .eq("id", 1)
      .maybeSingle(),
    supabase
      .from("time_blocks")
      .select("id, starts_at, ends_at, reason")
      .is("removed_at", null)
      .lt("starts_at", calgaryDayStart(addDays(day, 1)))
      .gt("ends_at", calgaryDayStart(day))
      .order("starts_at"),
    supabase.from("profiles").select("id").eq("role", "owner").limit(1),
  ]);
  const host = settingsRow?.meeting_host_id ?? owners?.[0]?.id ?? null;
  const { data: own } = host
    ? await supabase
        .from("day_schedules")
        .select("meeting_start, meeting_slot_minutes, meeting_slot_count")
        .eq("host_id", host)
        .eq("day", day)
        .is("removed_at", null)
        .maybeSingle()
    : { data: null };
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const usual = {
    start: (settingsRow?.meeting_start ?? "18:00").slice(0, 5),
    minutes: settingsRow?.meeting_slot_minutes ?? 45,
    count: settingsRow?.meeting_slot_count ?? 4,
  };
  return {
    day,
    blocks: (blocks ?? []).map((block) => ({ id: block.id, startsAt: block.starts_at, endsAt: block.ends_at, reason: block.reason })),
    template: {
      start: own ? own.meeting_start.slice(0, 5) : usual.start,
      minutes: own?.meeting_slot_minutes ?? usual.minutes,
      count: own?.meeting_slot_count ?? usual.count,
      own: Boolean(own),
      usualDay: (settingsRow?.meeting_days ?? []).includes(weekday),
      usual,
    },
  };
}

async function OwnerEvening({ day, today, viewer }: { day: string; today: string; viewer: ContactViewer }) {
  const supabase = await createClient();
  const [meetings, { data: settingsRow }] = await Promise.all([
    meetingsOnDay(supabase, day, { viewer }),
    supabase.from("settings").select("not_qualified_reasons").eq("id", 1).maybeSingle(),
  ]);
  const names = await namesById(
    supabase,
    meetings.flatMap((meeting) => [meeting.setter_id, meeting.booked_by, meeting.outcome_by]),
  );
  const photos = day === today ? await slotPhotoLinks(supabase, meetings.map((meeting) => meeting.lead_id)) : new Map();
  const held = meetings.filter((meeting) => meeting.status !== "moved" && meeting.status !== "cancelled");
  const distances = legs(held.map((meeting) => ({ startsAt: meeting.starts_at, lat: meeting.lead.lat, lng: meeting.lead.lng, neighbourhood: meeting.lead.neighbourhood })));
  const legById = new Map(held.map((meeting, index) => [meeting.id, { km: distances[index], previous: held[index - 1]?.starts_at ?? null }]));
  const now = requestTime();

  return (
    <section className="flex flex-col gap-4" aria-labelledby="evening-heading">
      <h2 id="evening-heading" className="text-lg font-bold">
        {day === today ? "Tonight's bookings" : `Bookings, ${formatLongDay(day)}`}
      </h2>
      {meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bookings this evening yet. Setters book from their phones; bookings show here as they come in.</p>
      ) : (
        meetings.map((meeting) => (
          <MeetingCard
            key={meeting.id}
            meeting={meeting}
            names={names}
            now={now}
            canChange
            isOwner
            reasons={settingsRow?.not_qualified_reasons ?? []}
            photos={photos.get(meeting.lead_id) ?? []}
            legKm={legById.get(meeting.id)?.km ?? null}
            previousTime={legById.get(meeting.id)?.previous ?? null}
            showDetails
          />
        ))
      )}
    </section>
  );
}
