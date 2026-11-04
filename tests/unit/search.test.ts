import { describe, expect, it } from "vitest";
import { cleanSearch, searchFilter } from "@/lib/leads/search";

describe("cleanSearch", () => {
  it("strips characters that could change the database filter", () => {
    // Underscore is a one-character wildcard in database text matching, so it goes too.
    expect(cleanSearch("Lee,first_name.eq.x)(").text).toBe("Lee first name eq x");
    expect(cleanSearch("50%*off").text).toBe("50 off");
    expect(cleanSearch("  O'Neil   #5 ").text).toBe("O'Neil #5");
  });

  it("keeps accented names and collects digits for phone search", () => {
    expect(cleanSearch("Élise Côté").text).toBe("Élise Côté");
    expect(cleanSearch("(403) 555-0199").digits).toBe("4035550199");
  });

  it("caps the length", () => {
    expect(cleanSearch("a".repeat(200)).text).toHaveLength(60);
  });
});

describe("searchFilter", () => {
  it("matches names, address and neighbourhood, plus phone when three or more digits are typed", () => {
    expect(searchFilter(cleanSearch("evan"))).toBe(
      "first_name.ilike.*evan*,last_name.ilike.*evan*,address_line.ilike.*evan*,neighbourhood.ilike.*evan*",
    );
    expect(searchFilter(cleanSearch("12"))).not.toContain("phone");
    expect(searchFilter(cleanSearch("   "))).toBeNull();
  });

  it("matches phone digits only through the leads whose phone the person may see (contact privacy, 2026-11-04)", () => {
    const mine = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
    // Never a filter on the phone column itself, which nobody reads from the table.
    expect(searchFilter(cleanSearch("555-01"))).not.toContain("phone");
    expect(searchFilter(cleanSearch("555-01"), [mine])).toContain(`id.in.(${mine})`);
    // Digits too short for a phone search add nothing, ids or not.
    expect(searchFilter(cleanSearch("12"), [mine])).not.toContain("id.in");
    // Anything that isn't an id is dropped before it reaches the filter.
    expect(searchFilter(cleanSearch("555-01"), ["not-an-id),or(id.neq.0"])).not.toContain("id.in");
  });
});
