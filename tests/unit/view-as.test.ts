import { describe, expect, it } from "vitest";
import { parseViewAsCookie, refusedWhileViewing, viewAsCookieValue, VIEW_AS_EXIT_PATH } from "@/lib/view-as";

const owner = "0b6f6f0e-2c1a-4e8b-9a7d-5c3e2f1a0b9c";
const setter = "7d1e2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b";

describe("the View as cookie", () => {
  it("round-trips the owner and the person being viewed", () => {
    expect(parseViewAsCookie(viewAsCookieValue(owner, setter))).toEqual({ ownerId: owner, targetId: setter });
  });

  it("rejects anything malformed, and viewing as yourself", () => {
    for (const value of [undefined, null, "", "x", owner, `${owner}:`, `${owner}:${setter}:x`, `${owner}:not-a-uuid`, `${owner}:${owner}`]) {
      expect(parseViewAsCookie(value)).toBeNull();
    }
  });
});

describe("refusedWhileViewing", () => {
  it("allows reading", () => {
    expect(refusedWhileViewing("GET", "/app/leads")).toBe(false);
    expect(refusedWhileViewing("HEAD", "/app")).toBe(false);
  });

  it("refuses every server action and any other write, except leaving View as", () => {
    expect(refusedWhileViewing("POST", "/app/leads/123")).toBe(true);
    expect(refusedWhileViewing("POST", "/app")).toBe(true);
    expect(refusedWhileViewing("PUT", "/app/admin/settings")).toBe(true);
    expect(refusedWhileViewing("DELETE", "/app/leads")).toBe(true);
    expect(refusedWhileViewing("POST", VIEW_AS_EXIT_PATH)).toBe(false);
  });
});
