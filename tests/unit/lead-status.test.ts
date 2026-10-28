import { describe, expect, it } from "vitest";
import { canChangeStatus, groupByStatus, leadName, SETTER_STATUSES, statusChoices } from "@/lib/leads/status";

describe("status rules", () => {
  it("lets setters move only between New, Follow up and Lost", () => {
    expect(SETTER_STATUSES).toEqual(["new", "follow_up", "lost"]);
    expect(statusChoices("sales", "new")).toEqual(["new", "follow_up", "lost"]);
    expect(canChangeStatus("sales", "new", "follow_up")).toBe(true);
    expect(canChangeStatus("sales", "lost", "new")).toBe(true);
    expect(canChangeStatus("sales", "new", "meeting_booked")).toBe(false);
    expect(canChangeStatus("sales", "follow_up", "sold")).toBe(false);
  });

  it("gives setters no choices once the owner has moved a lead past them", () => {
    for (const status of ["meeting_booked", "met", "quoted", "sold", "installed"] as const) {
      expect(statusChoices("sales", status), status).toEqual([]);
      expect(canChangeStatus("sales", status, "follow_up"), status).toBe(false);
    }
  });

  it("lets the owner set any status and crew none", () => {
    expect(statusChoices("owner", "new")).toHaveLength(8);
    expect(canChangeStatus("owner", "new", "installed")).toBe(true);
    expect(canChangeStatus("owner", "new", "new")).toBe(false);
    expect(statusChoices("crew", "new")).toEqual([]);
  });
});

describe("groupByStatus", () => {
  it("groups in status order, keeps the given order inside each group, and skips empty groups", () => {
    const leads = [
      { id: "a", status: "lost" as const },
      { id: "b", status: "new" as const },
      { id: "c", status: "follow_up" as const },
      { id: "d", status: "new" as const },
    ];
    expect(groupByStatus(leads).map((g) => [g.status, g.leads.map((l) => l.id)])).toEqual([
      ["new", ["b", "d"]],
      ["follow_up", ["c"]],
      ["lost", ["a"]],
    ]);
  });
});

describe("leadName", () => {
  it("joins first and last name and copes without a last name", () => {
    expect(leadName({ first_name: "Dana", last_name: "Lee" })).toBe("Dana Lee");
    expect(leadName({ first_name: "TEST LEAD (automated)", last_name: null })).toBe("TEST LEAD (automated)");
  });
});
