import type { Metadata } from "next";
import { MeetingItem, type MeetingItemData } from "@/components/meetings/meeting-item";
import { completenessLabel } from "@/lib/leads/questions";
import { StartMeeting } from "@/components/meetings/start-meeting";
import { TonightList } from "@/components/meetings/tonight-list";
import { NotForYourRole } from "@/components/not-for-your-role";
import { requireProfile } from "@/lib/auth/profile";
import { getPublicEnv } from "@/lib/env";
import { namesById } from "@/lib/leads/queries";
import { leadName } from "@/lib/leads/status";
import { MEETING_STATUS_LABELS } from "@/lib/schedule/meetings";
import { bookingSettings, meetingsBetween, meetingsOnDay, type MeetingWithLead } from "@/lib/schedule/queries";
import { createClient } from "@/lib/supabase/server";
import { addDays, calgaryDateOf, calgaryDayStart, calgaryToday, formatLongDay, formatTime, requestTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Meetings",
};

const LIVE = new Set(["booked", "confirmed"]);
const MARKED = new Set(["qualified", "not_qualified", "no_show"]);

// Meetings (Keenan, 2026-11-02): meeting mode's own home, owner only (the
// owner group's layout refuses everyone else, View as included). Tonight in
// time order, then what's booked after it, each with a big Start and a flag
// for a missing mockup or track colour; Start a meeting for anyone not
// booked; Get tonight ready to keep tonight on the iPad.
export default async function MeetingsPage() {
  const me = await requireProfile();
  // The layout's gate only swaps what shows; a page still runs and sends
  // its data. So the page checks too, before it reads anything.
  if (me.role !== "owner") return <NotForYourRole />;
  const supabase = await createClient();
  const today = calgaryToday();
  const now = requestTime();
  const settings = await bookingSettings(supabase);
  const [tonightAll, laterAll] = await Promise.all([
    meetingsOnDay(supabase, today),
    meetingsBetween(supabase, calgaryDayStart(addDays(today, 1)), calgaryDayStart(addDays(today, settings.windowDays + 1))),
  ]);
  const tonight = tonightAll.filter((meeting) => meeting.status !== "moved" && meeting.status !== "cancelled");
  const upcoming = laterAll.filter((meeting) => LIVE.has(meeting.status));

  const leadIds = Array.from(new Set([...tonight, ...upcoming].map((meeting) => meeting.lead_id)));
  const [leadRows, mockupRows, hosts, settingsRow] = await Promise.all([
    leadIds.length > 0
      ? supabase.from("leads").select("id, track_colour_id, track_ral_code, updated_at").in("id", leadIds).then(({ data }) => data ?? [])
      : Promise.resolve([]),
    leadIds.length > 0
      ? supabase.from("lead_photos").select("lead_id, created_at").eq("slot", "mockup").in("lead_id", leadIds).then(({ data }) => data ?? [])
      : Promise.resolve([]),
    namesById(supabase, [...tonight, ...upcoming].map((meeting) => meeting.host_id)),
    supabase.from("settings").select("updated_at").eq("id", 1).maybeSingle().then(({ data }) => data),
  ]);
  const hasColour = new Set(leadRows.filter((row) => row.track_colour_id || row.track_ral_code).map((row) => row.id));
  const hasMockup = new Set(mockupRows.map((row) => row.lead_id));
  // When anything a meeting page shows last changed: the lead (colour,
  // initials, details), its mockup, or Settings (the presentation, prices).
  const changedAt = new Map<string, number>();
  const settingsChanged = Date.parse(settingsRow?.updated_at ?? "") || 0;
  for (const row of leadRows) changedAt.set(row.id, Math.max(settingsChanged, Date.parse(row.updated_at) || 0));
  for (const row of mockupRows) changedAt.set(row.lead_id, Math.max(changedAt.get(row.lead_id) ?? 0, Date.parse(row.created_at) || 0));

  // The next meeting still to come tonight gets the one gold Start.
  const nextTonight = tonight.find((meeting) => LIVE.has(meeting.status) && Date.parse(meeting.ends_at) > now)?.id ?? null;

  const toItem = (meeting: MeetingWithLead): MeetingItemData => ({
    meetingId: meeting.id,
    leadId: meeting.lead_id,
    time: formatTime(meeting.starts_at),
    name: leadName(meeting.lead),
    address: [meeting.lead.address_line, meeting.lead.neighbourhood].filter(Boolean).join(", "),
    host: meeting.host_id !== me.id ? (hosts.get(meeting.host_id) ?? "Another host") : null,
    outcome: MARKED.has(meeting.status) ? `Marked ${MEETING_STATUS_LABELS[meeting.status]}` : null,
    missingMockup: !hasMockup.has(meeting.lead_id),
    missingColour: !hasColour.has(meeting.lead_id),
    completeness: completenessLabel(meeting.lead),
    next: meeting.id === nextTonight,
    changedAt: new Date(changedAt.get(meeting.lead_id) ?? settingsChanged).toISOString(),
  });

  // After tonight, by evening.
  const evenings = new Map<string, MeetingItemData[]>();
  for (const meeting of upcoming) {
    const day = calgaryDateOf(meeting.starts_at);
    evenings.set(day, [...(evenings.get(day) ?? []), toItem(meeting)]);
  }

  // While Start a meeting is open, the lists step aside: someone new may be
  // standing beside the iPad, and other customers stay off the screen.
  return (
    <StartMeeting mapsKey={getPublicEnv().NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}>
      <TonightList items={tonight.map(toItem)} renderedAt={new Date(now).toISOString()} />

      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-4" data-testid="meetings-upcoming">
        <div>
          <h2 id="upcoming-heading" className="text-xl font-bold">
            Upcoming
          </h2>
          <p className="text-sm text-muted-foreground">
            {upcoming.length === 0
              ? `Nothing booked after tonight yet. When a setter books a later evening, up to ${settings.windowDays} days ahead, it shows here.`
              : `The next ${settings.windowDays} days, by evening.`}
          </p>
        </div>
        {[...evenings.entries()].map(([day, items]) => (
          <div key={day} className="flex flex-col gap-3">
            <h3 className="text-base font-semibold">{formatLongDay(day)}</h3>
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <MeetingItem key={item.meetingId} item={item} compact />
              ))}
            </ul>
          </div>
        ))}
      </section>
    </StartMeeting>
  );
}
