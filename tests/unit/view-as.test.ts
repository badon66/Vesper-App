import { describe, expect, it } from "vitest";
import { isViewAsRefusal, parseViewAsCookie, refusedWhileViewing, viewAsCookieValue, VIEW_AS_EXIT_PATH, VIEW_AS_READ_ONLY } from "@/lib/view-as";

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

  it("refuses any write that isn't a server action, except leaving View as", () => {
    expect(refusedWhileViewing("POST", "/app/leads/123")).toBe(true);
    expect(refusedWhileViewing("POST", "/app")).toBe(true);
    expect(refusedWhileViewing("PUT", "/app/admin/settings")).toBe(true);
    expect(refusedWhileViewing("DELETE", "/app/leads")).toBe(true);
    expect(refusedWhileViewing("POST", VIEW_AS_EXIT_PATH)).toBe(false);
  });

  it("lets a server action through to its own guard, which refuses every write while viewing (round 2)", () => {
    expect(refusedWhileViewing("POST", "/app/leads/123", true)).toBe(false);
    expect(refusedWhileViewing("POST", "/app/schedule", true)).toBe(false);
  });

  it("says what happened calmly", () => {
    expect(VIEW_AS_READ_ONLY).toBe("View as: nothing was saved.");
    expect(isViewAsRefusal("View as: nothing was saved.")).toBe(true);
    expect(isViewAsRefusal("That didn't save.")).toBe(false);
  });
});
