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
import { outTodayFor, recentNeighbourhoodsOf, sessionTally } from "@/lib/knock/queries";
import { closeMyStaleKnockSessions, lastNeighbourhood, openKnockSession } from "@/lib/leads/queries";
import { leadName } from "@/lib/leads/status";
import { eveningLabel, eveningsOf, pickEvening } from "@/lib/schedule/board";
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
export default async function SessionPage({ searchParams }: { searchParams: Promise<{ added?: string | string[] }> }) {
  const { profile, real, viewingAs } = await getViewer();
  if (profile.role !== "owner" && profile.role !== "sales") return <NotForYourRole />;
  const supabase = await createClient();
  const today = calgaryToday();
  const { added } = await searchParams;
  const addedId = typeof added === "string" && z.uuid().safeParse(added).success ? added : null;
  if (!viewingAs) await closeMyStaleKnockSessions(supabase);
  const [settings, session, last, recent, board, out, addedResult] = await Promise.all([
    bookingSettings(supabase),
    openKnockSession(supabase, profile.id),
    lastNeighbourhood(supabase, profile.id),
    recentNeighbourhoodsOf(supabase, profile.id),
    fetchBoard(supabase, profile, real.role),
    outTodayFor(supabase, profile.id),
    addedId
      ? supabase.from("leads").select("id, first_name, last_name").eq("id", addedId).eq("created_by", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const soFar = session ? await sessionTally(supabase, session.id) : { leads: 0, bookings: 0 };
  const addedLead = addedResult.data;
  const opening = pickEvening(eveningsOf(board, today, settings.windowDays), today);
  const timesHeading = opening.tonightFull
    ? opening.tonightHasTimes
      ? "Nothing left tonight"
      : "No meetings tonight"
    : "Tonight's open times";
  const timesNote = opening.tonightFull
    ? opening.day === today
      ? "No open times in the next two weeks right now."
      : `${eveningLabel(opening.day, today)} has the next open times. Tap one to hold it while you book.`
    : null;

  return (
    <SessionScreen
      session={session}
      lastNeighbourhood={last}
      recent={recent}
      soFar={soFar}
      renderedAt={requestTime()}
      saved={
        addedLead ? (
          <>
            {viewingAs ? null : <ClearLeadDraft userId={profile.id} />}
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-x-3 rounded-md border border-primary bg-accent px-4 py-1 text-sm text-accent-foreground"
              data-testid="lead-saved"
            >
              <span>Lead saved. On to the next door.</span>
              <Link
                href={`/app/leads/${addedLead.id}`}
                className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
              >
                Open {leadName(addedLead)}
              </Link>
            </div>
          </>
        ) : null
      }
      times={
        <section aria-labelledby="session-times-heading" className="flex flex-col gap-3" data-testid="session-times">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h2 id="session-times-heading" className="text-lg font-bold">
                {timesHeading}
              </h2>
              <Link
                href="/app/schedule"
                className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold underline underline-offset-4"
              >
                All evenings
              </Link>
            </div>
            {timesNote ? <p className="-mt-1 text-sm text-pretty text-muted-foreground">{timesNote}</p> : null}
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
      unfinished={<UnfinishedBookings userId={profile.id} />}
      outToday={<OutToday rows={out} />}
    />
  );
}
