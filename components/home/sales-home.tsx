import Link from "next/link";
import { MeetingCard } from "@/components/schedule/meeting-card";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SessionProfile } from "@/lib/auth/profile";
import { followUpLabel } from "@/lib/leads/attention";
import { eveningLabel, eveningsOf, pickEvening } from "@/lib/schedule/board";
import { bookingSettings, fetchBoard, meetingsBetween } from "@/lib/schedule/queries";
import { followUpsDue, namesById } from "@/lib/leads/queries";
import { leadName } from "@/lib/leads/status";
import { createClient } from "@/lib/supabase/server";
import { addDays, calgaryDayStart, calgaryToday, requestTime } from "@/lib/time";
import { cn } from "@/lib/utils";

// A setter's Home, top to bottom: tonight's open times, their bookings (from
// last night on, so a result Keenan marks the next morning still shows) and
// follow-ups due. The knock session and Unfinished bookings are on Session
// (Keenan, 2026-11-05). Every query is scoped to this person, so View as
// shows exactly what they would see (CLAUDE.md, View as).
export async function SalesHome({
  profile,
  readOnly,
  realRole,
}: {
  profile: SessionProfile;
  readOnly: boolean;
  realRole: string;
}) {
  const supabase = await createClient();
  const today = calgaryToday();
  const settings = await bookingSettings(supabase);
  const [due, board, bookings] = await Promise.all([
    followUpsDue(supabase, profile.id, today),
    fetchBoard(supabase, profile, realRole),
    meetingsBetween(supabase, calgaryDayStart(addDays(today, -1)), calgaryDayStart(addDays(today, settings.windowDays + 1)), {
      setterId: profile.id,
      viewer: profile,
    }),
  ]);
  const firstName = profile.full_name.split(" ")[0] || profile.full_name;
  const opening = pickEvening(eveningsOf(board, today, settings.windowDays), today);
  const mine = bookings.filter((meeting) => meeting.status !== "moved" && meeting.status !== "cancelled");
  const names = await namesById(supabase, mine.flatMap((meeting) => [meeting.setter_id, meeting.booked_by]));
  const now = requestTime();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Hello, {firstName}</h1>

      <Card data-testid="tonight-times">
        <CardHeader>
          <CardTitle>{opening.tonightFull ? (opening.tonightHasTimes ? "Nothing left tonight" : "No meetings tonight") : "Tonight's open times"}</CardTitle>
          <CardDescription>
            {opening.tonightFull
              ? opening.day === today
                ? "No open times in the next two weeks right now."
                : `${eveningLabel(opening.day, today)} has the next open times. Tap one to start booking it.`
              : "Tap a time to start booking it. It's held for you while you book."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ScheduleView
            board={board}
            today={today}
            windowDays={settings.windowDays}
            asSales
            viewerId={readOnly ? profile.id : null}
            initialDay={opening.day}
            followDay={false}
            tonightOnly
          />
          <Link href="/app/schedule" className="inline-flex min-h-11 w-fit items-center text-sm font-semibold underline underline-offset-4">
            See every evening
          </Link>
        </CardContent>
      </Card>

      <section data-testid="my-bookings" aria-labelledby="my-bookings-heading" className="flex flex-col gap-3">
        <div>
          <h2 id="my-bookings-heading" className="text-lg font-bold">
            My bookings
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Last night, tonight and upcoming, with how each went once Keenan marks it.
          </p>
        </div>
        {mine.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No bookings yet. Tap an open time above, or book from a lead, and it shows here.
          </p>
        ) : (
          mine.map((meeting) => (
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
          ))
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Follow-ups due</CardTitle>
          <CardDescription>Your Follow up leads dated today or earlier, the oldest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {due.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              None due today. When you move a lead to Follow up, it shows here on the day you picked.
            </p>
          ) : (
            <ul className="flex flex-col divide-y border-y" aria-label="Follow-ups due">
              {due.map((lead) => {
                const label = lead.follow_up_on ? followUpLabel(lead.follow_up_on, today) : "Due today";
                return (
                  <li key={lead.id}>
                    <Link
                      href={`/app/leads/${lead.id}`}
                      className="flex min-h-16 flex-col justify-center gap-0.5 px-1 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <span className="font-semibold">{leadName(lead)}</span>
                      <span className="text-sm text-muted-foreground">
                        {lead.address_line}
                        {lead.neighbourhood ? `, ${lead.neighbourhood}` : ""}
                      </span>
                      <span
                        className={cn(
                          "text-sm text-foreground",
                          label.startsWith("Overdue") ? "font-bold" : "font-semibold",
                        )}
                      >
                        {label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
