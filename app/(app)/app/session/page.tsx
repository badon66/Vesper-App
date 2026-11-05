import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { UnfinishedBookings } from "@/components/home/unfinished-bookings";
import { ClearLeadDraft } from "@/components/leads/clear-lead-draft";
import { NotForYourRole } from "@/components/not-for-your-role";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { OutToday } from "@/components/session/out-today";
import { SessionScreen } from "@/components/session/session-screen";
import { getViewer } from "@/lib/auth/profile";
import {
  lastEndedToday,
  outTodayFor,
  recentNeighbourhoodsOf,
  sessionTally,
} from "@/lib/knock/queries";
import {
  closeMyStaleKnockSessions,
  lastNeighbourhood,
  openKnockSession,
} from "@/lib/leads/queries";
import { leadName } from "@/lib/leads/status";
import { eveningsOf, pickEvening } from "@/lib/schedule/board";
import { bookingSettings, fetchBoard } from "@/lib/schedule/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays, calgaryToday, formatDay, requestTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Session",
};

// The Session tab (Keenan, 2026-11-05), the gold button for setters and
// Keenan: the evening runs from here. Every query is scoped to the person
// the screen is for, so View as shows exactly what they would see, and
// nothing is written while viewing (CLAUDE.md, View as).
export default async function SessionPage({
  searchParams,
}: {
  searchParams: Promise<{ added?: string | string[] }>;
}) {
  const { profile, real, viewingAs } = await getViewer();
  if (profile.role !== "owner" && profile.role !== "sales")
    return <NotForYourRole />;
  const supabase = await createClient();
  const today = calgaryToday();
  const { added } = await searchParams;
  const addedId =
    typeof added === "string" && z.uuid().safeParse(added).success
      ? added
      : null;
  if (!viewingAs) await closeMyStaleKnockSessions(supabase);
  const [settings, session, last, recent, board, out, addedResult] =
    await Promise.all([
      bookingSettings(supabase),
      openKnockSession(supabase, profile.id),
      lastNeighbourhood(supabase, profile.id),
      recentNeighbourhoodsOf(supabase, profile.id),
      fetchBoard(supabase, profile, real.role),
      outTodayFor(supabase, profile.id),
      addedId
        ? supabase
            .from("leads")
            .select("id, first_name, last_name")
            .eq("id", addedId)
            .eq("created_by", profile.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  const [soFar, lastEnded] = await Promise.all([
    session
      ? sessionTally(supabase, session.id)
      : Promise.resolve({ leads: 0, bookings: 0 }),
    session ? Promise.resolve(null) : lastEndedToday(supabase, profile.id),
  ]);
  const addedLead = addedResult.data;
  // Tonight's open times; when tonight has nothing left, the heading names
  // the evening the times are for.
  const opening = pickEvening(
    eveningsOf(board, today, settings.windowDays),
    today,
  );
  const timesHeading = !opening.tonightFull
    ? "Tonight's open times"
    : opening.day === today
      ? "No open times"
      : opening.day === addDays(today, 1)
        ? "Open times tomorrow"
        : `Open times on ${formatDay(opening.day)}`;
  const timesNote = !opening.tonightFull
    ? null
    : opening.day === today
      ? "Nothing open in the next two weeks right now."
      : `${opening.tonightHasTimes ? "Nothing left tonight." : "No meetings tonight."} Tap a time to hold it while you book.`;

  return (
    <>
      {addedLead && !viewingAs ? <ClearLeadDraft userId={profile.id} /> : null}
      <SessionScreen
        session={session}
        lastEnded={lastEnded}
        lastNeighbourhood={last}
        recent={recent}
        soFar={soFar}
        renderedAt={requestTime()}
        savedLead={
          addedLead ? { id: addedLead.id, name: leadName(addedLead) } : null
        }
        times={
          <section
            aria-labelledby="session-times-heading"
            className="flex flex-col gap-2"
            data-testid="session-times"
          >
            <div>
              <div className="flex items-center justify-between gap-3">
                <h2 id="session-times-heading" className="text-base font-bold">
                  {timesHeading}
                </h2>
                <Link
                  href="/app/schedule"
                  className="-my-2.5 inline-flex min-h-11 shrink-0 items-center text-sm font-semibold underline underline-offset-4"
                >
                  All evenings
                </Link>
              </div>
              {timesNote ? (
                <p className="-mt-1 text-sm text-pretty text-muted-foreground">
                  {timesNote}
                </p>
              ) : null}
            </div>
            <ScheduleView
              board={board}
              today={today}
              windowDays={settings.windowDays}
              asSales={profile.role !== "owner"}
              viewerId={viewingAs ? profile.id : null}
              initialDay={opening.day}
              followDay={false}
              tonightOnly
              hideDayHeading
            />
          </section>
        }
        unfinished={<UnfinishedBookings userId={profile.id} compact />}
        outToday={<OutToday rows={out} />}
      />
    </>
  );
}
