import { describe, expect, it } from "vitest";
import { followUpDateFor, followUpLabel, groupByAttention, isDue } from "@/lib/leads/attention";

const today = "2026-10-28";
const lead = (id: string, status: string, created_at: string, follow_up_on: string | null = null) => ({
  id,
  status: status as "new" | "follow_up" | "meeting_booked" | "lost",
  created_at,
  follow_up_on,
});

describe("groupByAttention", () => {
  const leads = [
    lead("new-late", "new", "2026-10-27T20:00:00Z"),
    lead("later-far", "follow_up", "2026-10-01T10:00:00Z", "2026-11-04"),
    lead("due-today", "follow_up", "2026-10-20T10:00:00Z", "2026-10-28"),
    lead("booked", "meeting_booked", "2026-10-25T10:00:00Z"),
    lead("new-early", "new", "2026-10-26T20:00:00Z"),
    lead("overdue", "follow_up", "2026-10-21T10:00:00Z", "2026-10-25"),
    lead("later-soon", "follow_up", "2026-10-02T10:00:00Z", "2026-10-29"),
    lead("lost", "lost", "2026-10-26T10:00:00Z"),
  ];

  it("puts due follow-ups first, then new, then later follow-ups, then booked meetings", () => {
    const groups = groupByAttention(leads, today);
    expect(groups.map((group) => [group.title, group.leads.map((l) => l.id)])).toEqual([
      ["Follow-ups due", ["overdue", "due-today"]],
      ["New", ["new-early", "new-late"]],
      ["Follow up later", ["later-soon", "later-far"]],
      ["Meeting booked", ["booked"]],
    ]);
  });

  it("leaves out lost and closed leads and empty groups", () => {
    const groups = groupByAttention([lead("lost", "lost", "2026-10-26T10:00:00Z"), lead("n", "new", "2026-10-26T10:00:00Z")], today);
    expect(groups.map((group) => group.key)).toEqual(["new"]);
  });

  it("treats a follow-up dated today as due", () => {
    expect(isDue(lead("a", "follow_up", "2026-10-01T00:00:00Z", today), today)).toBe(true);
    expect(isDue(lead("b", "follow_up", "2026-10-01T00:00:00Z", "2026-10-29"), today)).toBe(false);
  });
});

describe("followUpLabel", () => {
  it("says plainly when it is due", () => {
    expect(followUpLabel("2026-10-28", today)).toBe("Due today");
    expect(followUpLabel("2026-10-26", today)).toBe("Overdue since Mon, Oct 26");
    expect(followUpLabel("2026-10-29", today)).toBe("Due tomorrow");
    expect(followUpLabel("2026-10-30", today)).toBe("Due Fri, Oct 30");
  });
});

describe("followUpDateFor", () => {
  it("works out the quick choices from Calgary's today", () => {
    expect(followUpDateFor("tomorrow", null, today)).toEqual({ ok: true, date: "2026-10-29" });
    expect(followUpDateFor("three_days", null, today)).toEqual({ ok: true, date: "2026-10-31" });
    expect(followUpDateFor("next_week", null, today)).toEqual({ ok: true, date: "2026-11-04" });
  });

  it("takes a picked day from today up to a year ahead", () => {
    expect(followUpDateFor("date", "2026-10-28", today)).toEqual({ ok: true, date: "2026-10-28" });
    expect(followUpDateFor("date", "2027-10-28", today)).toEqual({ ok: true, date: "2027-10-28" });
    expect(followUpDateFor("date", "2026-10-27", today)).toEqual({ ok: false, error: "Pick today or a later day." });
    expect(followUpDateFor("date", "2027-10-29", today)).toEqual({ ok: false, error: "Pick a day within the next year." });
  });

  it("refuses anything that is not a real day or a known choice", () => {
    expect(followUpDateFor("date", "2026-02-30", today).ok).toBe(false);
    expect(followUpDateFor("date", "tomorrow", today).ok).toBe(false);
    expect(followUpDateFor("date", null, today).ok).toBe(false);
    expect(followUpDateFor("someday", null, today)).toEqual({ ok: false, error: "Pick when to follow up." });
  });
});
