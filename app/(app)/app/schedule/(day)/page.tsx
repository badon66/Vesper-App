import type { Metadata } from "next";
import { NotForYourRole } from "@/components/not-for-your-role";
import { BlockControls } from "@/components/schedule/block-controls";
import { MeetingCard } from "@/components/schedule/meeting-card";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { getViewer } from "@/lib/auth/profile";
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

// The Schedule tab for setters and Keenan (Keenan, 2026-11-01). Everyone
// sees the time picker: open, held and booked times, tonight and the next
// evenings. Keenan also sees the evening's bookings in full, marks outcomes
// and blocks times.
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
  const day =
    dayParam && DAY.test(dayParam) && dayParam >= today && dayParam <= lastDay ? dayParam : pickEvening(evenings, today).day;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Schedule</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tap an open time to start booking it. While you book, it is held for you and nobody else can pick it.
        </p>
      </div>
      <ScheduleView
        board={board}
        today={today}
        windowDays={settings.windowDays}
        asSales={!isOwner}
        viewerId={real.id !== me.id ? me.id : null}
        initialDay={day}
        followDay={isOwner}
      />
      {isOwner ? <OwnerEvening day={day} today={today} board={board} /> : null}
    </div>
  );
}

async function OwnerEvening({
  day,
  today,
  board,
}: {
  day: string;
  today: string;
  board: Awaited<ReturnType<typeof fetchBoard>>;
}) {
  const supabase = await createClient();
  const [meetings, { data: settingsRow }, { data: blocks }] = await Promise.all([
    meetingsOnDay(supabase, day),
    supabase.from("settings").select("not_qualified_reasons").eq("id", 1).maybeSingle(),
    supabase
      .from("time_blocks")
      .select("id, starts_at, ends_at, reason")
      .is("removed_at", null)
      .gte("starts_at", calgaryDayStart(day))
      .lt("starts_at", calgaryDayStart(addDays(day, 1)))
      .order("starts_at"),
  ]);
  const names = await namesById(
    supabase,
    meetings.flatMap((meeting) => [meeting.setter_id, meeting.booked_by, meeting.outcome_by]),
  );
  const photos = day === today ? await slotPhotoLinks(supabase, meetings.map((meeting) => meeting.lead_id)) : new Map();
  const held = meetings.filter((meeting) => meeting.status !== "moved" && meeting.status !== "cancelled");
  const distances = legs(held.map((meeting) => ({ startsAt: meeting.starts_at, lat: meeting.lead.lat, lng: meeting.lead.lng, neighbourhood: meeting.lead.neighbourhood })));
  const legById = new Map(held.map((meeting, index) => [meeting.id, { km: distances[index], previous: held[index - 1]?.starts_at ?? null }]));
  const daySlots = board.filter((slot) => slot.day === day);
  const evening =
    daySlots.length > 0 ? { startsAt: daySlots[0].startsAt, endsAt: daySlots[daySlots.length - 1].endsAt } : null;
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
      <BlockControls
        evening={evening}
        openTimes={daySlots.filter((slot) => slot.state === "open").map((slot) => ({ startsAt: slot.startsAt, endsAt: slot.endsAt }))}
        blocks={blocks ?? []}
      />
    </section>
  );
}
