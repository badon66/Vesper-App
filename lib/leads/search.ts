// The Leads search box. Text matches names, address and neighbourhood; three
// or more digits also match phone numbers, among the leads whose phone the
// person may see (contact privacy, 2026-11-04): the caller finds those
// through lead_contacts and passes their ids. Anything that could change the
// meaning of the database filter is stripped before it is used.

export type LeadSearch = { text: string; digits: string };

export function cleanSearch(raw: string | null | undefined): LeadSearch {
  const input = (raw ?? "").normalize("NFKC");
  const text = input
    .replace(/[^\p{L}\p{N}\s'#/-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  const digits = input.replace(/\D/g, "").slice(0, 15);
  return { text, digits };
}

// A PostgREST "or" filter for the search, or null when there is nothing to
// search for. phoneMatches are the ids of the leads whose phone holds the
// digits.
export function searchFilter(search: LeadSearch, phoneMatches: string[] = []): string | null {
  const parts: string[] = [];
  if (search.text) {
    for (const column of ["first_name", "last_name", "address_line", "neighbourhood"]) {
      parts.push(`${column}.ilike.*${search.text}*`);
    }
  }
  const ids = phoneMatches.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (search.digits.length >= 3 && ids.length > 0) parts.push(`id.in.(${ids.join(",")})`);
  return parts.length > 0 ? parts.join(",") : null;
}
