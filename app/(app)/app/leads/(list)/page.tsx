import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { StatusBadge } from "@/components/leads/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireProfile } from "@/lib/auth/profile";
import { ACTIVE_STATUSES, followUpLabel, groupByAttention } from "@/lib/leads/attention";
import { namesById } from "@/lib/leads/queries";
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
  const filter = searchFilter(search);
  const searching = Boolean(filter);
  const showActive = !all && !searching;
  const today = calgaryToday();

  const supabase = await createClient();
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
    ? supabase.from("leads").select("id, first_name, last_name").eq("id", added).maybeSingle()
    : null;
  const [{ data, error }, addedResult] = await Promise.all([query, addedQuery]);
  if (error) throw new Error("Leads could not be loaded.");

  const leads: Row[] = data ?? [];
  const names = everyone ? await namesById(supabase, leads.map((lead) => lead.created_by)) : new Map<string, string>();
  const sections: Section[] = showActive
    ? groupByAttention(leads, today)
    : groupByStatus(leads).map((group) => ({ key: group.status, title: STATUS_LABELS[group.status], leads: group.leads }));
  const addedLead = addedResult?.data ?? undefined;

  const link = (next: { scope?: "mine" | "everyone"; view?: "active" | "all" }) => {
    const target = new URLSearchParams();
    target.set("scope", next.scope ?? (everyone ? "everyone" : "mine"));
    target.set("view", next.view ?? (all ? "all" : "active"));
    if (q) target.set("q", q);
    return `/app/leads?${target.toString()}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Leads</h1>

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
        <Switch
          label="Which leads"
          options={[
            { label: "Active", href: link({ view: "active" }), current: !all },
            { label: "All", href: link({ view: "all" }), current: all },
          ]}
        />
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

      <p className="text-sm text-muted-foreground">
        {searching
          ? "Search covers every status, lost and closed leads included."
          : all
            ? "Every lead, grouped by status, newest first."
            : "New, Follow up and Meeting booked, what needs attention first."}
        {everyone ? " Everyone's leads, so you can check an address before knocking. You can open them but only change your own." : ""}
      </p>

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
                const followUp =
                  lead.status === "follow_up" && lead.follow_up_on ? `${followUpLabel(lead.follow_up_on, today)}. ` : "";
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
                      <span className="text-xs text-muted-foreground">
                        {followUp}
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
