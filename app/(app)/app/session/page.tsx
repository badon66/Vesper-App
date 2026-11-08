import type { Metadata } from "next";
import { z } from "zod";
import { UnfinishedBookings } from "@/components/home/unfinished-bookings";
import { ClearLeadDraft } from "@/components/leads/clear-lead-draft";
import { NotForYourRole } from "@/components/not-for-your-role";
import { ScheduleView } from "@/components/schedule/schedule-view";
import { OutToday } from "@/components/session/out-today";
import { SessionScreen } from "@/components/session/session-screen";
import { getViewer } from "@/lib/auth/profile";
import {
  lastSessionSummary,
  outTodayFor,
  recentNeighbourhoodsOf,
  sessionTally,
  teamNeighbourhoodsAll,
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
import { calgaryToday, requestTime } from "@/lib/time";

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
  const [settings, session, last, recent, team, board, out, addedResult] =
    await Promise.all([
      bookingSettings(supabase),
      openKnockSession(supabase, profile.id),
      lastNeighbourhood(supabase, profile.id),
      recentNeighbourhoodsOf(supabase, profile.id),
      teamNeighbourhoodsAll(supabase),
      fetchBoard(supabase, profile, real.role),
      outTodayFor(supabase, profile.id),
      addedId
        ? supabase
            .from("leads")
            .select("id, first_name, last_name, save_key")
            .eq("id", addedId)
            .eq("created_by", profile.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  const [soFar, lastEnded] = await Promise.all([
    session
      ? sessionTally(supabase, session.id)
      : Promise.resolve({ leads: 0, bookings: 0 }),
    session ? Promise.resolve(null) : lastSessionSummary(supabase, profile.id),
  ]);
  const addedLead = addedResult.data;
  // The open times, tonight first (round 5, Keenan, 2026-11-06): a row of
  // days, Tonight then the rest of the booking window, so a setter books any
  // evening without leaving Session. It opens on tonight, or on the next
  // evening with an opening when tonight has nothing left.
  const opening = pickEvening(
    eveningsOf(board, today, settings.windowDays),
    today,
  );
  return (
    <>
      {addedLead && !viewingAs ? <ClearLeadDraft userId={profile.id} saveKey={addedLead.save_key ?? null} /> : null}
      <SessionScreen
        session={session}
        lastEnded={lastEnded}
        lastNeighbourhood={last}
        recent={recent}
        team={team}
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
            {/* The row of days says what these are (Tonight, 6 open), so
                the heading is for screen readers only (round 6), keeping the
                knocking view one screen at 390 wide. */}
            <h2 id="session-times-heading" className="sr-only">
              Open times
            </h2>
            {/* The day picked stays picked when the times refresh. */}
            <ScheduleView
              board={board}
              today={today}
              windowDays={settings.windowDays}
              asSales={profile.role !== "owner"}
              viewerId={viewingAs ? profile.id : null}
              initialDay={opening.day}
              followDay={false}
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
