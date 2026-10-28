import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { StatusBadge } from "@/components/leads/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireProfile } from "@/lib/auth/profile";
import { namesById } from "@/lib/leads/queries";
import { cleanSearch, searchFilter } from "@/lib/leads/search";
import { groupByStatus, leadName, STATUS_LABELS } from "@/lib/leads/status";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Leads",
};

const LIMIT = 200;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; scope?: string | string[]; added?: string | string[] }>;
}) {
  const me = await requireProfile();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const everyone = params.scope === "everyone";
  const added = typeof params.added === "string" ? params.added : null;
  const search = cleanSearch(q);

  const supabase = await createClient();
  let query = supabase
    .from("leads")
    .select("id, first_name, last_name, address_line, neighbourhood, status, created_at, created_by, assigned_to")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (!everyone) query = query.or(`created_by.eq.${me.id},assigned_to.eq.${me.id}`);
  const filter = searchFilter(search);
  if (filter) query = query.or(filter);
  const { data, error } = await query;
  if (error) throw new Error("Leads could not be loaded.");

  const leads = data ?? [];
  const names = everyone ? await namesById(supabase, leads.map((lead) => lead.created_by)) : new Map<string, string>();
  const groups = groupByStatus(leads);
  const addedLead = added ? leads.find((lead) => lead.id === added) : undefined;
  const searchSuffix = q ? `&q=${encodeURIComponent(q)}` : "";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Leads</h1>
        <Button asChild>
          <Link href="/app/leads/new">New lead</Link>
        </Button>
      </div>

      {addedLead ? (
        <p role="status" className="rounded-md border border-primary bg-accent px-4 py-3 text-sm text-accent-foreground">
          Lead saved:{" "}
          <Link href={`/app/leads/${addedLead.id}`} className="font-semibold underline underline-offset-4">
            {leadName(addedLead)}
          </Link>
          .
        </p>
      ) : null}

      <nav aria-label="Whose leads" className="grid grid-cols-2 rounded-md border p-1">
        {[
          { label: "Mine", href: `/app/leads?scope=mine${searchSuffix}`, current: !everyone },
          { label: "Everyone", href: `/app/leads?scope=everyone${searchSuffix}`, current: everyone },
        ].map((tab) => (
          <Link
            key={tab.label}
            href={tab.href}
            aria-current={tab.current ? "page" : undefined}
            className={cn(
              "flex h-11 items-center justify-center rounded-sm text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab.current && "bg-secondary text-secondary-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <Form action="/app/leads" role="search" className="flex gap-2">
        <input type="hidden" name="scope" value={everyone ? "everyone" : "mine"} />
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

      {everyone ? (
        <p className="text-sm text-muted-foreground">
          Everyone&apos;s leads, so you can check an address before knocking. You can open them but only change your own.
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-md border px-4 py-6 text-sm text-muted-foreground">
          {search.text || search.digits
            ? `No leads match "${q}".`
            : everyone
              ? "No one has added a lead yet."
              : "No leads yet. Tap New lead to add the first one from the door."}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.status} aria-labelledby={`group-${group.status}`} className="flex flex-col gap-2">
            <h2 id={`group-${group.status}`} className="text-sm font-semibold text-muted-foreground">
              {STATUS_LABELS[group.status]} ({group.leads.length})
            </h2>
            <ul className="flex flex-col divide-y rounded-md border">
              {group.leads.map((lead) => {
                const mine = lead.created_by === me.id || lead.assigned_to === me.id;
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

      {leads.length === LIMIT ? (
        <p className="text-sm text-muted-foreground">
          Showing the {LIMIT} newest. Search to find older leads.
        </p>
      ) : null}
    </div>
  );
}
