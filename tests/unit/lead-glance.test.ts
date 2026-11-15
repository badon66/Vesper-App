import { describe, expect, it } from "vitest";
import { canPickStatus, followUpShort, linkOpenedLine, statusOptions, thingsToFinish } from "@/lib/leads/glance";

// Round 21 (Keenan, 2026-11-15): the lead page's At a glance.
describe("the status dropdown", () => {
  it("shows every status; Meeting booked, Sold and Installed say what sets them and can't be picked", () => {
    const options = statusOptions("owner", "met");
    expect(options.map((option) => option.value)).toEqual(["new", "follow_up", "meeting_booked", "met", "quoted", "sold", "installed", "lost"]);
    expect(options.filter((option) => option.disabled).map((option) => option.label)).toEqual([
      "Meeting booked (set by booking a meeting)",
      "Sold (set when the quote is accepted)",
      "Installed (set when the job is marked installed)",
    ]);
    expect(canPickStatus(options, "met")).toBe(true);
  });

  it("gives a setter the same choices as today: New, Follow up and Lost, and says Keenan sets the rest", () => {
    const options = statusOptions("sales", "new");
    expect(options.filter((option) => !option.disabled).map((option) => option.value)).toEqual(["new", "follow_up", "lost"]);
    expect(options.find((option) => option.value === "met")?.label).toBe("Met (Keenan sets this)");
  });

  it("keeps the lead's own status selectable, even one set elsewhere, and a setter past their steps can't change it", () => {
    const booked = statusOptions("sales", "meeting_booked");
    expect(booked.find((option) => option.value === "meeting_booked")).toEqual({ value: "meeting_booked", label: "Meeting booked", disabled: false });
    expect(canPickStatus(booked, "meeting_booked")).toBe(false);
    const sold = statusOptions("owner", "sold");
    expect(sold.find((option) => option.value === "sold")?.disabled).toBe(false);
  });
});

describe("the lines", () => {
  it("their link, in plain words", () => {
    expect(linkOpenedLine(0, null, "2026-11-15")).toBe("Not opened yet");
    expect(linkOpenedLine(3, "2026-11-15T20:00:00Z", "2026-11-15")).toBe("Opened today, 3 times");
    expect(linkOpenedLine(1, "2026-11-14T20:00:00Z", "2026-11-15")).toBe("Opened yesterday, once");
    expect(linkOpenedLine(2, "2026-11-12T20:00:00Z", "2026-11-15")).toBe("Opened Thu, Nov 12, twice");
  });

  it("the follow-up day, overdue said so", () => {
    expect(followUpShort("2026-11-15", "2026-11-15")).toEqual({ text: "Today", overdue: false });
    expect(followUpShort("2026-11-16", "2026-11-15")).toEqual({ text: "Tomorrow, Mon, Nov 16", overdue: false });
    expect(followUpShort("2026-11-12", "2026-11-15")).toEqual({ text: "Overdue since Thu, Nov 12", overdue: true });
  });

  it("things to finish", () => {
    expect(thingsToFinish(1)).toBe("1 thing to finish");
    expect(thingsToFinish(3)).toBe("3 things to finish");
  });
});
