// Contact privacy (Keenan, 2026-11-04): whose phone number and email a person
// may see. Keenan sees every lead's; a setter only their own leads' (created
// or assigned to them). The database keeps the rest from a setter's own
// session; View as reads with Keenan's session, so the screens apply the
// same rule here, for the person being viewed. Kept pure for unit tests.

export type ContactViewer = { id: string; role: string };
export type ContactOwnership = { created_by: string; assigned_to: string | null };
export type Contact = { phone: string | null; email: string | null };

export function maySeeContact(viewer: ContactViewer, lead: ContactOwnership): boolean {
  return viewer.role === "owner" || lead.created_by === viewer.id || lead.assigned_to === viewer.id;
}

export const NO_CONTACT: Contact = { phone: null, email: null };

// The lead with the phone and email this viewer may see, nulls otherwise.
export function withContact<T extends { id: string }>(lead: T, contacts: Map<string, Contact>): T & Contact {
  return { ...lead, ...(contacts.get(lead.id) ?? NO_CONTACT) };
}
