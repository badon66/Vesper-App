import type { Metadata } from "next";
import { MeetingItem, type MeetingItemData } from "@/components/meetings/meeting-item";
import { QuickPickRow, type QuickPickItem } from "@/components/meetings/quick-pick";
import { readLine } from "@/lib/leads/extras";
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
import { prepFor } from "@/lib/meetings/prep-queries";
import { timePhrase } from "@/lib/schedule/meetings";
import { addDays, calgaryDateOf, calgaryDayStart, calgaryToday, formatDate, formatLongDay, formatTime, requestTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Meetings",
};

const LIVE = new Set(["booked", "confirmed"]);
const MARKED = new Set(["qualified", "not_qualified", "no_show"]);
// Quick pick (round 7): the next few evenings after tonight, and the
// newest leads.
const QUICK_DAYS = 3;
const RECENT_LEADS = 10;
const RECENT_COLUMNS =
  "id, first_name, last_name, address_line, neighbourhood, status, created_at, phone_saved, owns_home, wants_price, both_decision_makers, christmas_lights_now, looked_into_before, not_collected";

// Meetings (Keenan, 2026-11-02): meeting mode's own home, owner only (the
// owner group's layout refuses everyone else, View as included). Tonight in
// time order, each with a big Start and its prep list (round 7: Ready, or
// what's left); under it the quick pick, the next few days' meetings and
// the newest leads, one tap to their prep list or Start; then the later
// evenings. Start a meeting finds anyone else; Get tonight ready keeps
// tonight on the iPad.
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

  const quickUntil = addDays(today, QUICK_DAYS);
  const soon = upcoming.filter((meeting) => calgaryDateOf(meeting.starts_at) <= quickUntil);
  const later = upcoming.filter((meeting) => calgaryDateOf(meeting.starts_at) > quickUntil);
  const booked = [...tonight, ...upcoming];
  const bookedLeads = new Set(booked.map((meeting) => meeting.lead_id));

  const leadIds = Array.from(bookedLeads);
  const [leadRows, mockupRows, hosts, settingsRow, recentRows] = await Promise.all([
    leadIds.length > 0
      ? supabase.from("leads").select("id, updated_at").in("id", leadIds).then(({ data }) => data ?? [])
      : Promise.resolve([]),
    leadIds.length > 0
      ? supabase.from("lead_photos").select("lead_id, created_at").eq("slot", "mockup").in("lead_id", leadIds).then(({ data }) => data ?? [])
      : Promise.resolve([]),
    namesById(supabase, booked.map((meeting) => meeting.host_id)),
    supabase.from("settings").select("updated_at").eq("id", 1).maybeSingle().then(({ data }) => data),
    // The newest leads not lost, for someone met without a booking here.
    supabase
      .from("leads")
      .select(RECENT_COLUMNS)
      .neq("status", "lost")
      .order("created_at", { ascending: false })
      .limit(RECENT_LEADS + leadIds.length)
      .then(({ data }) => data ?? []),
  ]);
  const recent = recentRows.filter((lead) => !bookedLeads.has(lead.id)).slice(0, RECENT_LEADS);
  // The prep list of every meeting and lead shown: the live meeting's own
  // confirmation where there is one.
  const liveByLead = new Map(booked.filter((meeting) => LIVE.has(meeting.status)).map((meeting) => [meeting.lead_id, meeting]));
  const prep = await prepFor(
    supabase,
    [...booked.map((meeting) => meeting.lead), ...recent.map((lead) => ({ ...lead, phone: null }))],
    (leadId) => liveByLead.get(leadId) ?? null,
  );
  const glance = (leadId: string) => {
    const summary = prep.get(leadId);
    return summary ? { ready: summary.ready, left: summary.left, line: summary.line } : { ready: false, left: 0, line: "" };
  };
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
    prep: LIVE.has(meeting.status) ? glance(meeting.lead_id) : null,
    confirmed: LIVE.has(meeting.status) && Boolean(meeting.confirmed_at),
    completeness: completenessLabel(meeting.lead),
    read: readLine(meeting.lead),
    next: meeting.id === nextTonight,
    changedAt: new Date(changedAt.get(meeting.lead_id) ?? settingsChanged).toISOString(),
  });

  const soonPicks: QuickPickItem[] = soon.map((meeting) => ({
    leadId: meeting.lead_id,
    name: leadName(meeting.lead),
    when: timePhrase(meeting.starts_at, today),
    place: meeting.lead.neighbourhood || meeting.lead.address_line || null,
    prep: glance(meeting.lead_id),
    confirmed: Boolean(meeting.confirmed_at),
  }));
  const recentPicks: QuickPickItem[] = recent.map((lead) => ({
    leadId: lead.id,
    name: leadName(lead),
    when: `Added ${formatDate(lead.created_at)}`,
    place: lead.neighbourhood || lead.address_line || null,
    prep: glance(lead.id),
    confirmed: false,
  }));

  // After the quick pick's days, by evening.
  const evenings = new Map<string, MeetingItemData[]>();
  for (const meeting of later) {
    const day = calgaryDateOf(meeting.starts_at);
    evenings.set(day, [...(evenings.get(day) ?? []), toItem(meeting)]);
  }

  // While Start a meeting is open, the lists step aside: someone new may be
  // standing beside the iPad, and other customers stay off the screen.
  return (
    <StartMeeting mapsKey={getPublicEnv().NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}>
      <TonightList items={tonight.map(toItem)} renderedAt={new Date(now).toISOString()} />

      <QuickPickRow
        id="soon-heading"
        testId="meetings-soon"
        title="Next few days"
        note={`The next ${QUICK_DAYS} evenings after tonight. Tap one for its prep list.`}
        empty={`Nothing booked for the next ${QUICK_DAYS} evenings yet. When a setter books one, it shows here.`}
        items={soonPicks}
      />

      <QuickPickRow
        id="recent-heading"
        testId="meetings-recent"
        title="Recent leads"
        note="Newest first, for someone met without a booking. Tap one for its prep list."
        empty="No leads yet. New leads show here, newest first."
        items={recentPicks}
      />

      <section aria-labelledby="upcoming-heading" className="flex flex-col gap-4" data-testid="meetings-upcoming">
        <div>
          <h2 id="upcoming-heading" className="text-xl font-bold">
            Later
          </h2>
          <p className="text-sm text-muted-foreground">
            {later.length === 0
              ? `Nothing booked further out yet. Bookings open ${settings.windowDays} days ahead.`
              : `After the next ${QUICK_DAYS} evenings, up to ${settings.windowDays} days ahead, by evening.`}
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
