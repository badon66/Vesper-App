// The Leads search box. Text matches names, address and neighbourhood; three
// or more digits also match phone numbers. Anything that could change the
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
// search for.
export function searchFilter(search: LeadSearch): string | null {
  const parts: string[] = [];
  if (search.text) {
    for (const column of ["first_name", "last_name", "address_line", "neighbourhood"]) {
      parts.push(`${column}.ilike.*${search.text}*`);
    }
  }
  if (search.digits.length >= 3) parts.push(`phone.ilike.*${search.digits}*`);
  return parts.length > 0 ? parts.join(",") : null;
}
