import { describe, expect, it } from "vitest";
import { LEAD_CHANGED, quickEditStatus, quickTabs } from "@/lib/leads/quick-edit";

// Round 20 (Keenan, 2026-11-14): the quick edit pop-up's tab rules.
describe("moving a lead to a tab from the quick edit", () => {
  it("staying in its tab changes nothing; Later always carries its day", () => {
    expect(quickEditStatus("active", "new")).toEqual({ kind: "same" });
    expect(quickEditStatus("active", "meeting_booked")).toEqual({ kind: "same" });
    expect(quickEditStatus("met", "quoted")).toEqual({ kind: "same" });
    expect(quickEditStatus("closed", "lost")).toEqual({ kind: "same" });
    expect(quickEditStatus("later", "follow_up")).toEqual({ kind: "follow_up" });
  });

  it("Active is New, Later is Follow up, Met is Met, Closed is Lost", () => {
    expect(quickEditStatus("active", "follow_up")).toEqual({ kind: "change", to: "new" });
    expect(quickEditStatus("later", "new")).toEqual({ kind: "follow_up" });
    expect(quickEditStatus("met", "new")).toEqual({ kind: "change", to: "met" });
    expect(quickEditStatus("closed", "met")).toEqual({ kind: "change", to: "lost" });
  });

  it("a Sold or Installed lead stays in Closed: its status comes from its quote", () => {
    expect(quickEditStatus("active", "sold").kind).toBe("refused");
    expect(quickEditStatus("met", "installed").kind).toBe("refused");
    expect(quickEditStatus("closed", "sold")).toEqual({ kind: "same" });
  });

  it("setters pick Active, Later or Closed for their open leads, never Met; Keenan picks any", () => {
    expect(quickTabs("sales", "new")).toEqual(["active", "later", "closed"]);
    expect(quickTabs("sales", "follow_up")).toEqual(["active", "later", "closed"]);
    expect(quickTabs("sales", "meeting_booked")).toEqual(["active"]);
    expect(quickTabs("sales", "met")).toEqual(["met"]);
    expect(quickTabs("owner", "new")).toEqual(["active", "later", "met", "closed"]);
  });

  it("says plainly when the lead changed since it was opened", () => {
    expect(LEAD_CHANGED).toBe("This lead changed since you opened it. Reopen it to see the latest, then make your change.");
  });
});
