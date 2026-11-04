import "server-only";
import { type Contact, type ContactViewer, maySeeContact } from "@/lib/leads/contact-rules";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;

// The phone and email of some leads, for the leads this viewer may contact
// (contact privacy, 2026-11-04). They come only from the lead_contacts view,
// which already holds back other setters' leads from a setter's own session;
// the rule is applied again here so View as, which reads with Keenan's
// session, shows a setter exactly what they would see.
export async function contactsFor(supabase: Client, viewer: ContactViewer, leadIds: string[]): Promise<Map<string, Contact>> {
  const contacts = new Map<string, Contact>();
  const ids = [...new Set(leadIds.filter(Boolean))];
  if (ids.length === 0) return contacts;
  const { data } = await supabase
    .from("lead_contacts")
    .select("lead_id, phone, email, created_by, assigned_to")
    .in("lead_id", ids);
  for (const row of data ?? []) {
    if (!row.lead_id || !row.created_by) continue;
    if (!maySeeContact(viewer, { created_by: row.created_by, assigned_to: row.assigned_to })) continue;
    contacts.set(row.lead_id, { phone: row.phone, email: row.email });
  }
  return contacts;
}

// One lead's phone and email for this viewer, or nulls.
export async function contactFor(supabase: Client, viewer: ContactViewer, leadId: string): Promise<Contact> {
  return (await contactsFor(supabase, viewer, [leadId])).get(leadId) ?? { phone: null, email: null };
}

// The ids of the leads whose phone holds these digits, among those this
// viewer may contact: a setter's search by phone finds only their own leads.
export async function leadIdsByPhone(supabase: Client, viewer: ContactViewer, digits: string): Promise<string[]> {
  if (!/^\d{3,}$/.test(digits)) return [];
  const { data } = await supabase
    .from("lead_contacts")
    .select("lead_id, created_by, assigned_to")
    .ilike("phone", `%${digits}%`)
    .limit(200);
  return (data ?? [])
    .filter((row) => row.lead_id && row.created_by && maySeeContact(viewer, { created_by: row.created_by, assigned_to: row.assigned_to }))
    .map((row) => row.lead_id as string);
}
