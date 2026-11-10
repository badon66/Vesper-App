import { NOT_COLLECTED } from "@/lib/leads/questions";
import { parseLeadForm, unansweredQuestions, type LeadFormErrors, type LeadFormValues } from "@/lib/leads/schema";
import { ADDRESS_TO_COME, NAME_TO_COME } from "@/lib/leads/to-finish";

// The booking sheet's save at Book (Keenan, 2026-11-10: book now, finish
// later). A booking needs only a first name or the address, so this save
// takes a person with either one and any of the questions not asked yet.
// Every field it does get is checked by New lead's own rules
// (lib/leads/schema.ts), which stay as they are for New lead and for a save
// that isn't a booking.
//
// The database needs a first name and an address on every lead, so the one
// missing goes in as Name to come or Address to come with its flag
// (leads.name_to_come, leads.address_to_come). Without an address there is
// no map position either.

export const NAME_OR_ADDRESS = "Add a first name or the address first.";

export type SheetLeadValues = LeadFormValues & { name_to_come: boolean; address_to_come: boolean };

export function parseSheetLead(
  input: Record<string, unknown>,
): { ok: true; values: SheetLeadValues } | { ok: false; errors: LeadFormErrors } {
  const blank = (key: string) => String(input[key] ?? "").trim() === "";
  const nameToCome = blank("first_name");
  const addressToCome = blank("address_line");
  if (nameToCome && addressToCome) return { ok: false, errors: { first_name: NAME_OR_ADDRESS } };

  const filled: Record<string, unknown> = { ...input };
  if (nameToCome) filled.first_name = NAME_TO_COME;
  if (addressToCome) {
    Object.assign(filled, {
      address_line: ADDRESS_TO_COME,
      postal_code: "",
      lat: "",
      lng: "",
      place_id: "",
      position_source: "",
      position_accuracy_m: "",
    });
  }
  // A question not asked yet goes through New lead's rules as Not collected,
  // so everything else is checked as New lead checks it, then comes back
  // out as not asked: the lead says what the door said, nothing more.
  const open = unansweredQuestions(filled);
  for (const question of open) {
    if (question === "phone") filled.phone_not_collected = "1";
    else filled[question] = NOT_COLLECTED;
  }
  const parsed = parseLeadForm(filled);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    values: {
      ...parsed.values,
      not_collected: parsed.values.not_collected.filter((question) => !open.includes(question)),
      name_to_come: nameToCome,
      address_to_come: addressToCome,
    },
  };
}

// Whether a saved lead's name or address is still to come. The flag is the
// truth; a read that doesn't carry it falls back on the words saved in its
// place.
export function nameToCome(lead: { first_name: string; name_to_come?: boolean | null }): boolean {
  return lead.name_to_come ?? lead.first_name === NAME_TO_COME;
}

export function addressToCome(lead: { address_line: string; address_to_come?: boolean | null }): boolean {
  return lead.address_to_come ?? lead.address_line === ADDRESS_TO_COME;
}
