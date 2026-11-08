import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ClearLeadDraft } from "@/components/leads/clear-lead-draft";
import { LeadsWhoMenu } from "@/components/leads/leads-who-menu";
import { StatusBadge } from "@/components/leads/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireProfile } from "@/lib/auth/profile";
import { followUpLabel, groupByAttention } from "@/lib/leads/attention";
import { formatMeetingTime, sentence } from "@/lib/schedule/meetings";
import { namesById } from "@/lib/leads/queries";
import { leadIdsByPhone } from "@/lib/leads/contacts";
import { cleanSearch, searchFilter } from "@/lib/leads/search";
import {
  groupByStatus,
  labelFor,
  leadName,
  SOURCE_OPTIONS,
  STATUS_LABELS,
  type LeadSource,
  type LeadStatus,
} from "@/lib/leads/status";
import {
  DEFAULT_TAB,
  defaultWho,
  groupByOutcome,
  LEAD_TABS,
  latestMeetingByLead,
  leadsHref,
  outcomeLine,
  parseTab,
  parseWho,
  tabStatuses,
  whoFilter,
  whoOptions,
  type LeadTab,
  type LeadWho,
} from "@/lib/leads/tabs";
import { createClient } from "@/lib/supabase/server";
import { calgaryToday, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Leads",
};

// Met, Closed and search show the newest this many. Active and Later list
// every open lead.
const LIMIT = 200;
const OPEN_LIMIT = 500;

const COLUMNS =
  "id, first_name, last_name, address_line, neighbourhood, status, source, follow_up_on, created_at, created_by, assigned_to, sold_at, installed_at, lost_at, lost_reason";

type Row = {
  id: string;
  first_name: string;
  last_name: string | null;
  address_line: string;
  neighbourhood: string | null;
  status: LeadStatus;
  source: LeadSource;
  follow_up_on: string | null;
  created_at: string;
  created_by: string;
  assigned_to: string | null;
  sold_at: string | null;
  installed_at: string | null;
  lost_at: string | null;
  lost_reason: string | null;
};

type Section = { key: string; title: string; leads: Row[] };

// Leads (round 6, Keenan, 2026-11-08): one compact row of status tabs
// (Active, Later, Met, Closed) and a small menu for whose leads. Keenan opens
// on Everyone; a setter opens on their own, with Everyone one tap away.
// Search covers every status. Every query is scoped in code to the person
// the screen is for, so View as shows exactly what they see.
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    tab?: string | string[];
    who?: string | string[];
    // Before round 6: scope=mine|everyone still works; view is ignored.
    scope?: string | string[];
    added?: string | string[];
  }>;
}) {
  const me = await requireProfile();
  const owner = me.role === "owner";
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const tab = parseTab(params.tab);
  const who = parseWho(me.role, { who: params.who, scope: params.scope });
  const added = typeof params.added === "string" ? params.added : null;
  const search = cleanSearch(q);
  const supabase = await createClient();
  // Phone digits match only the leads whose phone this person may see.
  const phoneMatches = search.digits.length >= 3 ? await leadIdsByPhone(supabase, me, search.digits) : [];
  const filter = searchFilter(search, phoneMatches);
  const searching = Boolean(filter);
  const whose = whoFilter(me.role, who, me.id);
  const today = calgaryToday();
  const statuses = [...tabStatuses(tab)];

  let query = supabase.from("leads").select(COLUMNS);
  if (whose) query = query.or(whose);
  if (filter) {
    query = query.or(filter).order("created_at", { ascending: false }).limit(LIMIT);
  } else if (tab === "active") {
    query = query.in("status", statuses).order("created_at", { ascending: true }).limit(OPEN_LIMIT);
  } else if (tab === "later") {
    query = query.in("status", statuses).order("follow_up_on", { ascending: true }).limit(OPEN_LIMIT);
  } else {
    query = query.in("status", statuses).order("updated_at", { ascending: false }).limit(LIMIT);
  }

  // How many leads each tab holds, for the same who. Not while searching:
  // the tabs give way to Clear search then.
  const countTab = async (statusesOfTab: readonly LeadStatus[]) => {
    let count = supabase.from("leads").select("id", { count: "exact", head: true }).in("status", [...statusesOfTab]);
    if (whose) count = count.or(whose);
    const { count: n, error } = await count;
    return error ? null : n;
  };
  const countsQuery: Promise<(number | null)[]> = searching
    ? Promise.resolve([])
    : Promise.all(LEAD_TABS.map((entry) => countTab(entry.statuses)));
  const addedQuery = added
    ? supabase.from("leads").select("id, first_name, last_name, created_by").eq("id", added).maybeSingle()
    : null;
  const [{ data, error }, counts, addedResult] = await Promise.all([query, countsQuery, addedQuery]);
  if (error) throw new Error("Leads could not be loaded.");

  const leads: Row[] = data ?? [];
  const showWho = who !== "mine";
  const bookedIds = leads.filter((lead) => lead.status === "meeting_booked").map((lead) => lead.id);
  const metIds = leads.filter((lead) => lead.status === "met").map((lead) => lead.id);
  const meetingsOf = async (ids: string[], meetingStatuses: ("booked" | "confirmed" | "qualified" | "not_qualified")[]) => {
    if (ids.length === 0) return [];
    const { data: rows } = await supabase.from("meetings").select("lead_id, starts_at").in("lead_id", ids).in("status", meetingStatuses);
    return rows ?? [];
  };
  const [names, live, held] = await Promise.all([
    showWho ? namesById(supabase, leads.map((lead) => lead.created_by)) : new Map<string, string>(),
    meetingsOf(bookedIds, ["booked", "confirmed"]),
    // A met lead's latest meeting that was held, marked or not yet marked.
    meetingsOf(metIds, ["qualified", "not_qualified", "booked", "confirmed"]),
  ]);
  const meetingAt = new Map(live.map((meeting) => [meeting.lead_id, new Date(meeting.starts_at).toISOString()]));
  const metAt = latestMeetingByLead(held);

  const sections: Section[] = searching
    ? groupByStatus(leads).map((group) => ({ key: group.status, title: STATUS_LABELS[group.status], leads: group.leads }))
    : tab === "active" || tab === "later"
      ? groupByAttention(leads, today, meetingAt)
      : groupByOutcome(leads, tab, metAt).map((group) => ({
          key: group.status,
          title: STATUS_LABELS[group.status],
          leads: group.leads,
        }));
  const addedLead = addedResult?.data ?? undefined;
  const limited = (searching || tab === "met" || tab === "closed") && leads.length === LIMIT;

  const tabParam = tab === DEFAULT_TAB ? undefined : tab;
  const whoParam = who === defaultWho(me.role) ? undefined : who;

  return (
    <div className="flex flex-col gap-4">
      {/* One row at 390 wide: the title, whose leads, and New lead. */}
      <div className="flex items-center gap-2">
        <h1 className="shrink-0 text-2xl font-bold">Leads</h1>
        <LeadsWhoMenu current={who} options={whoOptions(me.role)} hidden={{ tab: tabParam, q: q || undefined }} />
        <Button asChild className="ml-auto h-11">
          <Link href="/app/leads/new">
            <Plus aria-hidden="true" className="size-5" />
            New lead
          </Link>
        </Button>
      </div>

      {addedLead && addedLead.created_by === me.id ? <ClearLeadDraft userId={me.id} /> : null}
      {addedLead ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-x-3 rounded-md border border-primary bg-accent px-4 py-1 text-sm text-accent-foreground"
        >
          <span>Lead saved.</span>
          <Link
            href={`/app/leads/${addedLead.id}`}
            className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
          >
            Open {leadName(addedLead)}
          </Link>
        </div>
      ) : null}

      {/* A search covers every status, so while searching the tabs give way
          to the way back (2026-11-03). */}
      {searching ? (
        <div className="flex min-h-[3.375rem] items-center justify-between gap-3 rounded-md border py-1 pr-1 pl-4">
          <p className="text-sm text-pretty text-muted-foreground">Search covers every status.</p>
          <Link
            href={leadsHref(me.role, { tab, who })}
            className="inline-flex h-11 shrink-0 items-center rounded-sm px-3 text-sm font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="clear-search"
          >
            Clear search
          </Link>
        </div>
      ) : (
        <StatusTabs
          tabs={LEAD_TABS.map((entry, index) => ({
            value: entry.value,
            label: entry.label,
            href: leadsHref(me.role, { tab: entry.value, who }),
            count: counts[index] ?? null,
          }))}
          current={tab}
        />
      )}

      <Form action="/app/leads" role="search" className="flex gap-2">
        {tabParam ? <input type="hidden" name="tab" value={tabParam} /> : null}
        {whoParam ? <input type="hidden" name="who" value={whoParam} /> : null}
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Name, address or phone"
          aria-label="Search leads"
          autoComplete="off"
          enterKeyHint="search"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </Form>

      {/* Only when it tells a setter something the menu doesn't. */}
      {!owner && who === "everyone" ? (
        <p className="text-sm text-pretty text-muted-foreground">
          Everyone&apos;s leads, to check an address before knocking. You can change only your own.
        </p>
      ) : null}

      {sections.length === 0 ? (
        <p className="rounded-md border px-4 py-6 text-sm text-pretty text-muted-foreground">
          {searching ? `No leads match "${q}".` : emptyText(tab, who, owner)}
          {searching && who !== "everyone" ? (
            <>
              {" "}
              <Link
                href={leadsHref(me.role, { tab, who: "everyone", q })}
                className="inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4"
              >
                Search everyone&apos;s leads
              </Link>
            </>
          ) : null}
        </p>
      ) : (
        sections.map((section) => (
          <section key={section.key} aria-labelledby={`group-${section.key}`} className="flex flex-col gap-2">
            <h2 id={`group-${section.key}`} className="text-sm font-semibold text-muted-foreground">
              {section.title} ({section.leads.length})
            </h2>
            <ul className="flex flex-col divide-y rounded-md border">
              {section.leads.map((lead) => {
                const mine = lead.created_by === me.id || lead.assigned_to === me.id;
                const overdue = lead.status === "follow_up" && lead.follow_up_on !== null && lead.follow_up_on < today;
                const outcome = outcomeLine(lead, metAt.get(lead.id));
                const followUp =
                  lead.status === "follow_up" && lead.follow_up_on
                    ? `${followUpLabel(lead.follow_up_on, today)}. `
                    : meetingAt.has(lead.id)
                      ? `${sentence(`Meeting ${formatMeetingTime(meetingAt.get(lead.id) as string)}`)} `
                      : "";
                const by = showWho && lead.created_by !== me.id ? ` by ${names.get(lead.created_by) ?? "someone"}` : "";
                const source = owner ? labelFor(SOURCE_OPTIONS, lead.source) : "";
                return (
                  <li key={lead.id}>
                    <Link
                      href={`/app/leads/${lead.id}`}
                      className="flex min-h-16 flex-col justify-center gap-0.5 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{leadName(lead)}</span>
                        <StatusBadge status={lead.status} />
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {lead.address_line}
                        {lead.neighbourhood ? `, ${lead.neighbourhood}` : ""}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {outcome ? <span className="text-foreground">{sentence(outcome)} </span> : null}
                        {overdue ? <span className="font-bold text-foreground">{followUp}</span> : followUp}
                        Added {formatDate(lead.created_at)}
                        {owner ? by : by && !mine ? `${by}, read only` : ""}
                        {source ? ` · ${source}` : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {limited ? (
        <p className="text-sm text-muted-foreground">Showing the {LIMIT} newest. Search to find older leads.</p>
      ) : null}
    </div>
  );
}

// What each empty tab will hold, and how a lead gets there.
function emptyText(tab: LeadTab, who: LeadWho, owner: boolean): string {
  const everyone = who === "everyone";
  switch (tab) {
    case "active":
      if (owner && who === "mine") return "None of your own leads are active. Tap New lead to add a phone call or referral.";
      if (owner && who === "setters") return "No active leads from setters. A lead they add at the door shows here.";
      if (everyone) return "No active leads. New leads and booked meetings show here.";
      return "No active leads. Tap New lead to add one from the door.";
    case "later":
      return everyone
        ? "No follow-ups. A lead set to Follow up shows here, with the day to come back."
        : "No follow-ups. A lead you set to Follow up shows here, with the day to come back.";
    case "met":
      return owner
        ? "No one is waiting on a decision. A lead shows here once you mark it Met or Quoted."
        : "No leads waiting on a decision. A lead shows here once Keenan has met them.";
    case "closed":
      return "No closed leads yet. Sold, installed and lost leads show here.";
  }
}

// Four status tabs in one row: a filter inside Leads, not app navigation.
function StatusTabs({
  tabs,
  current,
}: {
  tabs: { value: LeadTab; label: string; href: string; count: number | null }[];
  current: LeadTab;
}) {
  return (
    <nav aria-label="Lead status" className="grid grid-cols-4 rounded-md border p-1">
      {tabs.map((tab) => (
        <Link
          key={tab.value}
          href={tab.href}
          aria-current={tab.value === current ? "page" : undefined}
          className={cn(
            "flex h-11 min-w-0 items-center justify-center gap-1 rounded-sm px-1 text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
            tab.value === current && "bg-secondary text-secondary-foreground",
          )}
        >
          <span>{tab.label}</span>
          {tab.count !== null ? (
            <>
              <span aria-hidden="true" className="text-xs font-medium tabular-nums">
                {tab.count > 999 ? "999+" : tab.count}
              </span>
              <span className="sr-only">, {tab.count} leads</span>
            </>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
