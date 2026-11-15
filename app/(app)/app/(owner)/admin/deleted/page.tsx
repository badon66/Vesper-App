import type { Metadata } from "next";
import { NotForYourRole } from "@/components/not-for-your-role";
import { RestoreLeadButton } from "@/components/leads/restore-lead-button";
import { requireProfile } from "@/lib/auth/profile";
import { purgeExpiredLeads } from "@/lib/leads/purge";
import { leadName } from "@/lib/leads/status";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/time";

export const metadata: Metadata = {
  title: "Deleted",
};

type DeletedLead = {
  id: string;
  first_name: string;
  last_name: string | null;
  address_line: string | null;
  city: string | null;
  deleted_at: string;
  gone_after: string;
};

// Round 20 (Keenan, 2026-11-14): the leads Keenan deleted, newest first,
// each with Restore and the day it's gone for good. Restoring brings the
// lead, its quote and its link back, but never a cancelled meeting. Owner
// only (the group's layout, and the database function refuses anyone
// else); under View as the viewed person's role applies, so it never shows.
export default async function DeletedPage() {
  const me = await requireProfile();
  if (me.role !== "owner") return <NotForYourRole />;
  // Leads past their 30 days go for good first, so the list is exact.
  await purgeExpiredLeads().catch(() => 0);
  const supabase = await createClient();
  const { data } = await supabase.rpc("deleted_leads");
  const leads = (Array.isArray(data) ? data : []) as unknown as DeletedLead[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Deleted</h1>
        <p className="text-muted-foreground text-pretty">
          A deleted lead stays here for 30 days, then it&apos;s gone for good with its quotes, link, photos, mockups and files.
        </p>
      </div>
      {leads.length === 0 ? (
        <p className="rounded-xl border px-4 py-6 text-muted-foreground text-pretty" data-testid="deleted-empty">
          Nothing in Deleted. Delete lead, at the bottom of a lead&apos;s page, puts it here.
        </p>
      ) : (
        <ul className="flex flex-col divide-y border-y" aria-label="Deleted leads" data-testid="deleted-list">
          {leads.map((lead) => (
            <li key={lead.id} className="flex flex-wrap items-center justify-between gap-3 py-4" data-testid="deleted-lead" data-lead-id={lead.id}>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">{leadName(lead)}</span>
                {lead.address_line ? <span className="text-sm text-muted-foreground">{lead.address_line}</span> : null}
                <span className="text-sm text-muted-foreground">
                  Deleted {formatDate(lead.deleted_at)}. Gone for good after {formatDate(lead.gone_after)}.
                </span>
              </div>
              <RestoreLeadButton leadId={lead.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
