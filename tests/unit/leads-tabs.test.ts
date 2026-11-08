import { describe, expect, it } from "vitest";
import { STATUS_ORDER } from "@/lib/leads/status";
import {
  defaultWho,
  groupByOutcome,
  LEAD_TABS,
  latestMeetingByLead,
  leadsHref,
  outcomeAt,
  outcomeLine,
  parseTab,
  parseWho,
  tabOf,
  tabStatuses,
  whoFilter,
  whoOptions,
} from "@/lib/leads/tabs";

const ME = "11111111-2222-4333-8444-555555555555";

describe("status tabs", () => {
  it("splits the statuses into Active, Later, Met and Closed", () => {
    expect(LEAD_TABS.map((tab) => tab.label)).toEqual(["Active", "Later", "Met", "Closed"]);
    expect(tabStatuses("active")).toEqual(["new", "meeting_booked"]);
    expect(tabStatuses("later")).toEqual(["follow_up"]);
    expect(tabStatuses("met")).toEqual(["met", "quoted"]);
    expect(tabStatuses("closed")).toEqual(["sold", "installed", "lost"]);
  });

  it("puts every status in exactly one tab", () => {
    const all = LEAD_TABS.flatMap((tab) => tab.statuses);
    expect([...all].sort()).toEqual([...STATUS_ORDER].sort());
    expect(tabOf("follow_up")).toBe("later");
    expect(tabOf("installed")).toBe("closed");
  });

  it("opens on Active and ignores anything it does not know", () => {
    expect(parseTab(undefined)).toBe("active");
    expect(parseTab("closed")).toBe("closed");
    expect(parseTab("all")).toBe("active");
    expect(parseTab(["met", "later"])).toBe("active");
  });
});

describe("whose leads", () => {
  it("offers Keenan Everyone, Setters and Mine, opening on Everyone", () => {
    expect(whoOptions("owner").map((option) => option.label)).toEqual(["Everyone", "Setters", "Mine"]);
    expect(defaultWho("owner")).toBe("everyone");
    expect(parseWho("owner", {})).toBe("everyone");
  });

  it("offers a setter Mine and Everyone, opening on Mine", () => {
    expect(whoOptions("sales").map((option) => option.label)).toEqual(["Mine", "Everyone"]);
    expect(parseWho("sales", {})).toBe("mine");
    expect(parseWho("sales", { who: "everyone" })).toBe("everyone");
  });

  it("never gives a setter the Setters choice", () => {
    expect(parseWho("sales", { who: "setters" })).toBe("mine");
  });

  it("keeps links from before round 6 working", () => {
    expect(parseWho("sales", { scope: "everyone" })).toBe("everyone");
    expect(parseWho("owner", { scope: "mine" })).toBe("mine");
    expect(parseWho("owner", { who: "setters", scope: "mine" })).toBe("setters");
  });

  it("filters to Keenan's own leads, the setters' leads, or everyone's", () => {
    expect(whoFilter("owner", "everyone", ME)).toBeNull();
    expect(whoFilter("owner", "mine", ME)).toBe(`created_by.eq.${ME}`);
    expect(whoFilter("owner", "setters", ME)).toBe(`created_by.neq.${ME}`);
  });

  it("filters a setter's Mine to the leads they added or are assigned", () => {
    expect(whoFilter("sales", "mine", ME)).toBe(`created_by.eq.${ME},assigned_to.eq.${ME}`);
    expect(whoFilter("sales", "everyone", ME)).toBeNull();
  });

  it("refuses an id that could change the filter", () => {
    expect(() => whoFilter("sales", "mine", "x,status.eq.lost")).toThrow();
  });
});

describe("outcome line", () => {
  const lead = (status: Parameters<typeof outcomeLine>[0]["status"], extra: Partial<Parameters<typeof outcomeLine>[0]> = {}) => ({
    status,
    sold_at: null,
    installed_at: null,
    lost_reason: null,
    ...extra,
  });

  it("says when a met lead was met, in Calgary", () => {
    // 7:30 pm in Calgary on Saturday, November 7 is 01:30 UTC on the 8th.
    expect(outcomeLine(lead("met"), "2026-11-08T01:30:00.000Z")).toBe("Met Sat, Nov 7");
    expect(outcomeLine(lead("met"))).toBe("Met");
  });

  it("names the sale, install or loss, and never a price", () => {
    expect(outcomeLine(lead("quoted"))).toBe("Quoted");
    expect(outcomeLine(lead("sold", { sold_at: "2026-11-05T22:00:00Z" }))).toBe("Sold Thu, Nov 5");
    expect(outcomeLine(lead("installed", { installed_at: "2026-11-06T18:00:00Z" }))).toBe("Installed Fri, Nov 6");
    expect(outcomeLine(lead("lost", { lost_reason: "Price" }))).toBe("Lost: Price");
    expect(outcomeLine(lead("lost", { lost_reason: "  " }))).toBe("Lost");
  });

  it("has nothing to say for a lead not met yet", () => {
    expect(outcomeLine(lead("new"))).toBeNull();
    expect(outcomeLine(lead("follow_up"))).toBeNull();
    expect(outcomeLine(lead("meeting_booked"))).toBeNull();
  });
});

describe("Met and Closed order", () => {
  const row = (id: string, status: "met" | "quoted" | "sold" | "installed" | "lost", created_at: string, at: Partial<{ sold_at: string; installed_at: string; lost_at: string }> = {}) => ({
    id,
    status,
    created_at,
    sold_at: at.sold_at ?? null,
    installed_at: at.installed_at ?? null,
    lost_at: at.lost_at ?? null,
    lost_reason: null,
  });

  it("groups by status in status order, the newest outcome first", () => {
    const leads = [
      row("lost-old", "lost", "2026-11-01T10:00:00Z", { lost_at: "2026-11-02T10:00:00Z" }),
      row("sold", "sold", "2026-10-01T10:00:00Z", { sold_at: "2026-11-03T10:00:00Z" }),
      row("lost-new", "lost", "2026-10-20T10:00:00Z", { lost_at: "2026-11-06T10:00:00Z" }),
      row("installed", "installed", "2026-09-01T10:00:00Z", { installed_at: "2026-11-04T10:00:00Z" }),
    ];
    const groups = groupByOutcome(leads, "closed");
    expect(groups.map((group) => [group.status, group.leads.map((lead) => lead.id)])).toEqual([
      ["sold", ["sold"]],
      ["installed", ["installed"]],
      ["lost", ["lost-new", "lost-old"]],
    ]);
  });

  it("orders met leads by their meeting, falling back to when they were added", () => {
    const leads = [
      row("met-early", "met", "2026-10-30T10:00:00Z"),
      row("met-late", "met", "2026-10-01T10:00:00Z"),
      row("quoted", "quoted", "2026-10-15T10:00:00Z"),
    ];
    const metAt = new Map([
      ["met-early", "2026-11-02T01:30:00.000Z"],
      ["met-late", "2026-11-07T02:15:00.000Z"],
    ]);
    expect(outcomeAt(leads[2], metAt)).toBe("2026-10-15T10:00:00Z");
    const groups = groupByOutcome(leads, "met", metAt);
    expect(groups.map((group) => [group.status, group.leads.map((lead) => lead.id)])).toEqual([
      ["met", ["met-late", "met-early"]],
      ["quoted", ["quoted"]],
    ]);
  });

  it("keeps only the latest meeting for each lead", () => {
    const latest = latestMeetingByLead([
      { lead_id: "a", starts_at: "2026-11-02T01:30:00+00:00" },
      { lead_id: "a", starts_at: "2026-11-05T02:15:00+00:00" },
      { lead_id: "b", starts_at: "2026-11-03T01:30:00+00:00" },
    ]);
    expect(latest.get("a")).toBe("2026-11-05T02:15:00.000Z");
    expect(latest.get("b")).toBe("2026-11-03T01:30:00.000Z");
  });
});

describe("links", () => {
  it("leaves the defaults out so the plain address is the opening view", () => {
    expect(leadsHref("owner", { tab: "active", who: "everyone" })).toBe("/app/leads");
    expect(leadsHref("sales", { tab: "active", who: "mine" })).toBe("/app/leads");
    expect(leadsHref("sales", { tab: "closed", who: "everyone" })).toBe("/app/leads?tab=closed&who=everyone");
    expect(leadsHref("owner", { tab: "later", who: "mine", q: "Oak St" })).toBe("/app/leads?tab=later&who=mine&q=Oak+St");
  });
});
