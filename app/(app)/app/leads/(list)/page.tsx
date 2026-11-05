import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ClearLeadDraft } from "@/components/leads/clear-lead-draft";
import { StatusBadge } from "@/components/leads/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireProfile } from "@/lib/auth/profile";
import { ACTIVE_STATUSES, followUpLabel, groupByAttention } from "@/lib/leads/attention";
import { formatMeetingTime, sentence } from "@/lib/schedule/meetings";
import { namesById } from "@/lib/leads/queries";
import { leadIdsByPhone } from "@/lib/leads/contacts";
import { cleanSearch, searchFilter } from "@/lib/leads/search";
import { groupByStatus, leadName, STATUS_LABELS, type LeadStatus } from "@/lib/leads/status";
import { createClient } from "@/lib/supabase/server";
import { calgaryToday, formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Leads",
};

// All and search show the newest this many. Active lists every open lead.
const LIMIT = 200;
const ACTIVE_LIMIT = 500;

type Row = {
  id: string;
  first_name: string;
  last_name: string | null;
  address_line: string;
  neighbourhood: string | null;
  status: LeadStatus;
  follow_up_on: string | null;
  created_at: string;
  created_by: string;
  assigned_to: string | null;
};

type Section = { key: string; title: string; leads: Row[] };

// Leads opens to Active: New, Follow up and Meeting booked, in the order they
// need attention. Lost and closed leads are behind All and search, and search
// always covers every status. Mine is the person's own leads; Everyone shows
// the whole team's, read only unless they are yours. Every query is scoped to
// the person the screen is for, so View as shows exactly what they see.
export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    scope?: string | string[];
    view?: string | string[];
    added?: string | string[];
  }>;
}) {
  const me = await requireProfile();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const everyone = params.scope === "everyone";
  const all = params.view === "all";
  const added = typeof params.added === "string" ? params.added : null;
  const search = cleanSearch(q);
  const supabase = await createClient();
  // Phone digits match only the leads whose phone this person may see.
  const phoneMatches = search.digits.length >= 3 ? await leadIdsByPhone(supabase, me, search.digits) : [];
  const filter = searchFilter(search, phoneMatches);
  const searching = Boolean(filter);
  const showActive = !all && !searching;
  const today = calgaryToday();

  let query = supabase
    .from("leads")
    .select("id, first_name, last_name, address_line, neighbourhood, status, follow_up_on, created_at, created_by, assigned_to");
  if (!everyone) query = query.or(`created_by.eq.${me.id},assigned_to.eq.${me.id}`);
  if (filter) query = query.or(filter);
  if (showActive) {
    query = query.in("status", [...ACTIVE_STATUSES]).order("created_at", { ascending: true }).limit(ACTIVE_LIMIT);
  } else {
    query = query.order("created_at", { ascending: false }).limit(LIMIT);
  }
  const addedQuery = added
    ? supabase.from("leads").select("id, first_name, last_name, created_by").eq("id", added).maybeSingle()
    : null;
  const [{ data, error }, addedResult] = await Promise.all([query, addedQuery]);
  if (error) throw new Error("Leads could not be loaded.");

  const leads: Row[] = data ?? [];
  const names = everyone ? await namesById(supabase, leads.map((lead) => lead.created_by)) : new Map<string, string>();
  const bookedIds = leads.filter((lead) => lead.status === "meeting_booked").map((lead) => lead.id);
  const { data: live } =
    bookedIds.length > 0
      ? await supabase.from("meetings").select("lead_id, starts_at").in("lead_id", bookedIds).in("status", ["booked", "confirmed"])
      : { data: [] };
  const meetingAt = new Map((live ?? []).map((meeting) => [meeting.lead_id, new Date(meeting.starts_at).toISOString()]));
  const sections: Section[] = showActive
    ? groupByAttention(leads, today, meetingAt)
    : groupByStatus(leads).map((group) => ({ key: group.status, title: STATUS_LABELS[group.status], leads: group.leads }));
  const addedLead = addedResult?.data ?? undefined;

  const link = (next: { scope?: "mine" | "everyone"; view?: "active" | "all"; keepSearch?: boolean }) => {
    const target = new URLSearchParams();
    target.set("scope", next.scope ?? (everyone ? "everyone" : "mine"));
    target.set("view", next.view ?? (all ? "all" : "active"));
    if (q && next.keepSearch !== false) target.set("q", q);
    return `/app/leads?${target.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Leads</h1>
        <Button asChild className="h-11">
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

      <div className="grid gap-2 sm:grid-cols-2">
        {/* A search covers every status, so while searching, Active and All
            give way to the way back (2026-11-03). */}
        {searching ? (
          <Link
            href={link({ keepSearch: false })}
            className="flex h-[3.375rem] items-center justify-center rounded-md border text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="clear-search"
          >
            Clear search: every status shown
          </Link>
        ) : (
          <Switch
            label="Which leads"
            options={[
              { label: "Active", href: link({ view: "active" }), current: !all },
              { label: "All", href: link({ view: "all" }), current: all },
            ]}
          />
        )}
        <Switch
          label="Whose leads"
          options={[
            { label: "Mine", href: link({ scope: "mine" }), current: !everyone },
            { label: "Everyone", href: link({ scope: "everyone" }), current: everyone },
          ]}
        />
      </div>

      <Form action="/app/leads" role="search" className="flex gap-2">
        <input type="hidden" name="scope" value={everyone ? "everyone" : "mine"} />
        <input type="hidden" name="view" value={all ? "all" : "active"} />
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

      {/* One short line only when it tells something the switches don't. */}
      {searching || everyone ? (
        <p className="text-sm text-pretty text-muted-foreground">
          {searching ? "Search covers every status, lost and closed leads included." : ""}
          {searching && everyone ? " " : ""}
          {everyone ? "Everyone's leads, to check an address before knocking. You can change only your own." : ""}
        </p>
      ) : null}

      {sections.length === 0 ? (
        <p className="rounded-md border px-4 py-6 text-sm text-muted-foreground">
          {searching
            ? `No leads match "${q}".`
            : showActive
              ? everyone
                ? "No one has an active lead right now. Lost and closed leads are under All."
                : "No active leads. Tap New lead to add one from the door, or look under All for lost and closed ones."
              : everyone
                ? "No one has added a lead yet."
                : "No leads yet. Tap New lead to add the first one from the door."}
          {searching && !everyone ? (
            <>
              {" "}
              <Link href={link({ scope: "everyone" })} className="inline-flex min-h-11 items-center font-semibold text-foreground underline underline-offset-4">
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
                const followUp =
                  lead.status === "follow_up" && lead.follow_up_on
                    ? `${followUpLabel(lead.follow_up_on, today)}. `
                    : meetingAt.has(lead.id)
                      ? `${sentence(`Meeting ${formatMeetingTime(meetingAt.get(lead.id) as string)}`)} `
                      : "";
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
                        {overdue ? <span className="font-bold text-foreground">{followUp}</span> : followUp}
                        Added {formatDate(lead.created_at)}
                        {everyone && !mine ? ` by ${names.get(lead.created_by) ?? "someone"}, read only` : ""}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {!showActive && leads.length === LIMIT ? (
        <p className="text-sm text-muted-foreground">
          Showing the {LIMIT} newest. Search to find older leads.
        </p>
      ) : null}
    </div>
  );
}

function Switch({ label, options }: { label: string; options: { label: string; href: string; current: boolean }[] }) {
  return (
    <nav aria-label={label} className="grid grid-cols-2 rounded-md border p-1">
      {options.map((option) => (
        <Link
          key={option.label}
          href={option.href}
          aria-current={option.current ? "page" : undefined}
          className={cn(
            "flex h-11 items-center justify-center rounded-sm text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
            option.current && "bg-secondary text-secondary-foreground",
          )}
        >
          {option.label}
        </Link>
      ))}
    </nav>
  );
}
