import Link from "next/link";
import { MeetingCard } from "@/components/schedule/meeting-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ContactViewer } from "@/lib/leads/contact-rules";
import { namesById } from "@/lib/leads/queries";
import { legs } from "@/lib/schedule/distance";
import { meetingsOnDay, slotPhotoLinks } from "@/lib/schedule/queries";
import { createClient } from "@/lib/supabase/server";
import { calgaryToday, requestTime } from "@/lib/time";

// Tonight, at the top of Keenan's Home (Keenan, 2026-11-01): the evening's
// meetings in order, with the straight-line distance from the one before,
// call and Navigate, notes, photos, any photo skip and how the map position
// was set. Moved and cancelled bookings stay listed, muted. After each slot
// he marks how it went.
export async function TonightMeetings({ viewer }: { viewer: ContactViewer }) {
  const supabase = await createClient();
  const today = calgaryToday();
  const [meetings, { data: settingsRow }] = await Promise.all([
    meetingsOnDay(supabase, today, { viewer }),
    supabase.from("settings").select("not_qualified_reasons").eq("id", 1).maybeSingle(),
  ]);
  const [names, photos] = await Promise.all([
    namesById(
      supabase,
      meetings.flatMap((meeting) => [meeting.setter_id, meeting.booked_by, meeting.outcome_by]),
    ),
    slotPhotoLinks(supabase, meetings.map((meeting) => meeting.lead_id)),
  ]);
  const held = meetings.filter((meeting) => meeting.status !== "moved" && meeting.status !== "cancelled");
  const distances = legs(
    held.map((meeting) => ({ startsAt: meeting.starts_at, lat: meeting.lead.lat, lng: meeting.lead.lng, neighbourhood: meeting.lead.neighbourhood })),
  );
  const legById = new Map(held.map((meeting, index) => [meeting.id, { km: distances[index], previous: held[index - 1]?.starts_at ?? null }]));
  const now = requestTime();

  return (
    <Card data-testid="tonight">
      <CardHeader>
        <CardTitle>Tonight</CardTitle>
        <CardDescription>
          {held.length === 0
            ? "No meetings tonight."
            : `${held.length} ${held.length === 1 ? "meeting" : "meetings"} tonight, in order. Distances are in a straight line.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {meetings.length === 0 ? (
          <div className="flex flex-col items-start gap-1">
            <p className="text-sm text-pretty text-muted-foreground">When a setter books a meeting for tonight, it shows here in time order.</p>
            <Link href="/app/schedule" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
              Open the schedule
            </Link>
          </div>
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
      </CardContent>
    </Card>
  );
}
