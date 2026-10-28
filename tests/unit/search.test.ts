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
    expect(searchFilter(cleanSearch("555-01"))).toContain("phone.ilike.*55501*");
    expect(searchFilter(cleanSearch("12"))).not.toContain("phone");
    expect(searchFilter(cleanSearch("   "))).toBeNull();
  });
});
