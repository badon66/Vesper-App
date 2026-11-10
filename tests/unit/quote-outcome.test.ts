import { describe, expect, it } from "vitest";
import {
  cancelWindowEndsAt,
  cancelWindowWords,
  cleanOutcomeNote,
  commissionLine,
  insideCancelWindow,
  isOutcomeReason,
  lostReasonFor,
  OUTCOME_REASON_OPTIONS,
  OUTCOME_REASONS,
  outcomeActions,
  outcomeFailure,
  outcomeMessageFor,
  outcomeState,
  outcomeTitle,
  parseAcceptResult,
  plannedInstallLine,
  reasonLabel,
  shortDay,
} from "@/lib/quotes/outcome";
import { outcomeLine } from "@/lib/leads/tabs";

describe("decline and cancel reasons", () => {
  it("is one fixed list of five, stored as their words", () => {
    expect(OUTCOME_REASONS).toEqual(["price", "timing", "partner said no", "went with someone else", "other"]);
    expect(OUTCOME_REASON_OPTIONS.map((option) => option.label)).toEqual([
      "Price",
      "Timing",
      "Partner said no",
      "Went with someone else",
      "Other",
    ]);
    expect(reasonLabel("went with someone else")).toBe("Went with someone else");
  });

  it("knows a reason from the list and nothing else", () => {
    expect(isOutcomeReason("partner said no")).toBe(true);
    expect(isOutcomeReason("Price")).toBe(false);
    expect(isOutcomeReason("other company")).toBe(false);
    expect(isOutcomeReason(null)).toBe(false);
    expect(isOutcomeReason(5)).toBe(false);
  });

  it("gives the lead's lost reason, so the card reads Lost: price or Lost: cancelled, timing", () => {
    expect(lostReasonFor("declined", "price")).toBe("price");
    expect(lostReasonFor("declined", "partner said no")).toBe("partner said no");
    expect(lostReasonFor("cancelled", "timing")).toBe("cancelled, timing");
    const lost = (reason: string) => ({ status: "lost" as const, sold_at: null, installed_at: null, lost_reason: reason });
    expect(outcomeLine(lost(lostReasonFor("declined", "price")))).toBe("Lost: price");
    expect(outcomeLine(lost(lostReasonFor("cancelled", "timing")))).toBe("Lost: cancelled, timing");
    expect(outcomeLine(lost(lostReasonFor("cancelled", "went with someone else")))).toBe(
      "Lost: cancelled, went with someone else",
    );
  });

  it("keeps a note for Other only, trimmed, up to 300 characters", () => {
    expect(cleanOutcomeNote("other", "  Moving in the spring.  ")).toEqual({ ok: true, note: "Moving in the spring." });
    expect(cleanOutcomeNote("other", "   ")).toEqual({ ok: true, note: null });
    expect(cleanOutcomeNote("other", null)).toEqual({ ok: true, note: null });
    expect(cleanOutcomeNote("price", undefined)).toEqual({ ok: true, note: null });
    expect(cleanOutcomeNote("price", "Too much")).toMatchObject({ ok: false, code: "bad_note" });
    expect(cleanOutcomeNote("other", "x".repeat(300))).toEqual({ ok: true, note: "x".repeat(300) });
    expect(cleanOutcomeNote("other", "x".repeat(301))).toMatchObject({ ok: false, code: "bad_note" });
    // Characters, not UTF-16 units: 300 letters that each take two units fit.
    expect(cleanOutcomeNote("other", "\u{1D400}".repeat(300))).toMatchObject({ ok: true });
  });
});

describe("the 10-day window", () => {
  const accepted = "2026-11-09T03:00:00.000Z";
  const day = 24 * 60 * 60 * 1000;
  const at = (ms: number) => new Date(Date.parse(accepted) + ms);

  it("is inside for 10 days after the acceptance, and after from then on", () => {
    expect(insideCancelWindow(accepted, at(0))).toBe(true);
    expect(insideCancelWindow(accepted, at(9 * day + 23 * 60 * 60 * 1000))).toBe(true);
    expect(insideCancelWindow(accepted, at(10 * day - 1))).toBe(true);
    // The database's own test: accepted_at > now() - interval '10 days'.
    expect(insideCancelWindow(accepted, at(10 * day))).toBe(false);
    expect(insideCancelWindow(accepted, at(30 * day))).toBe(false);
  });

  it("takes the moment as text, a number or a date", () => {
    expect(insideCancelWindow(accepted, "2026-11-12T03:00:00Z")).toBe(true);
    expect(insideCancelWindow(accepted, Date.parse("2026-11-20T03:00:00Z"))).toBe(false);
    expect(insideCancelWindow("not a date", at(0))).toBe(false);
  });

  it("says when it closes and how a cancel came", () => {
    expect(cancelWindowEndsAt(accepted)).toBe("2026-11-19T03:00:00.000Z");
    expect(cancelWindowEndsAt("soon")).toBeNull();
    expect(cancelWindowWords(true)).toBe("inside the 10-day window");
    expect(cancelWindowWords(false)).toBe("after the 10-day window");
  });
});

describe("the outcome card", () => {
  it("knows where a quote stands", () => {
    expect(outcomeState("draft", "met")).toBe("open");
    expect(outcomeState("presented", "quoted")).toBe("open");
    expect(outcomeState("accepted", "sold")).toBe("accepted");
    expect(outcomeState("accepted", "installed")).toBe("installed");
    expect(outcomeState("declined", "lost")).toBe("declined");
    expect(outcomeState("cancelled", "lost")).toBe("cancelled");
  });

  it("offers Accepted and Declined before an answer, Accept again after a no, the rest while Sold, and a way back after Installed", () => {
    const none = { accept: false, decline: false, installed: false, notInstalled: false, cancel: false, undo: false };
    expect(outcomeActions("open")).toEqual({ ...none, accept: true, decline: true });
    expect(outcomeActions("declined")).toEqual({ ...none, accept: true });
    expect(outcomeActions("cancelled")).toEqual({ ...none, accept: true });
    expect(outcomeActions("accepted")).toEqual({ ...none, installed: true, cancel: true, undo: true });
    // Undo is offered while Sold, never after Installed; after Installed a
    // cancel still can come, and Not installed yet puts a wrong tap right.
    expect(outcomeActions("installed")).toEqual({ ...none, notInstalled: true, cancel: true });
  });

  it("names short days in Calgary", () => {
    expect(shortDay("2026-11-09")).toBe("Nov 9");
    // 10:00 pm in Calgary on November 9 is 04:00 UTC on the 10th.
    expect(shortDay("2026-11-10T04:00:00Z")).toBe("Nov 9");
    expect(shortDay("2026-11-20T18:00:00Z")).toBe("Nov 20");
  });

  const quote = {
    status: "accepted" as const,
    accepted_at: "2026-11-10T03:15:00Z",
    declined_at: null,
    cancelled_at: null,
    decline_reason: null,
    cancel_reason: null,
  };

  it("heads each state with its day and, for a no, the reason", () => {
    expect(outcomeTitle(quote, { status: "sold", installed_at: null })).toEqual({ title: "Accepted Nov 9", reason: null });
    // Installed at noon Calgary time on the chosen day.
    expect(outcomeTitle(quote, { status: "installed", installed_at: "2026-11-20T18:00:00Z" })).toEqual({
      title: "Installed Nov 20",
      reason: null,
    });
    expect(
      outcomeTitle(
        { ...quote, status: "declined", accepted_at: null, declined_at: "2026-11-09T20:00:00Z", decline_reason: "price" },
        { status: "lost", installed_at: null },
      ),
    ).toEqual({ title: "Declined Nov 9", reason: "Price" });
    expect(
      outcomeTitle(
        { ...quote, status: "cancelled", cancelled_at: "2026-11-12T20:00:00Z", cancel_reason: "partner said no" },
        { status: "lost", installed_at: null },
      ),
    ).toEqual({ title: "Cancelled Nov 12", reason: "Partner said no" });
    expect(outcomeTitle({ ...quote, status: "declined", decline_reason: "something typed" }, { status: "lost", installed_at: null })).toEqual({
      title: "Declined",
      reason: null,
    });
    expect(outcomeTitle({ ...quote, status: "draft", accepted_at: null }, { status: "met", installed_at: null })).toBeNull();
  });

  it("names the planned install day, when there is one", () => {
    expect(plannedInstallLine("2026-11-20")).toBe("Install planned for Fri, Nov 20.");
    expect(plannedInstallLine(null)).toBeNull();
    expect(plannedInstallLine("next week")).toBeNull();
  });
});

describe("the commission line on Keenan's card", () => {
  const earning = {
    kind: "earning" as const,
    amount: 142,
    setterName: "Zane",
    status: "pending" as const,
    payableAt: null,
    paidAt: null,
  };

  it("says what is coming, owed, paid or voided, with the setter's name", () => {
    expect(commissionLine(earning)).toBe("$142 to Zane, coming once installed.");
    expect(commissionLine({ ...earning, amount: 168.75 })).toBe("$168.75 to Zane, coming once installed.");
    expect(commissionLine({ ...earning, payableAt: "2026-11-20T18:00:00Z" })).toBe("$142 to Zane, owed now. Mark it paid in Pay.");
    expect(commissionLine({ ...earning, status: "paid", payableAt: "x", paidAt: "2026-11-27T19:00:00Z" })).toBe(
      "$142 to Zane, paid Nov 27.",
    );
    expect(commissionLine({ ...earning, status: "void" })).toBe("$142 to Zane, voided.");
  });

  it("says why there is none", () => {
    expect(commissionLine({ kind: "none", reason: "owner_lead" })).toBe("No commission: the lead is yours.");
    expect(commissionLine({ kind: "none", reason: "already_paid" })).toBe("No new commission: one on this lead is already paid.");
    expect(commissionLine({ kind: "none", reason: null })).toBe("No commission on this sale.");
  });
});

describe("what Accepted returns", () => {
  it("reads the commission it made, or why it made none", () => {
    expect(parseAcceptResult({ commission: { profile_id: "p1", amount: 142 }, reason: null })).toEqual({
      commission: { profileId: "p1", amount: 142 },
      reason: null,
    });
    // Postgres numerics can come back as text.
    expect(parseAcceptResult({ commission: { profile_id: "p1", amount: "168.75" }, reason: null }).commission).toEqual({
      profileId: "p1",
      amount: 168.75,
    });
    expect(parseAcceptResult({ commission: null, reason: "owner_lead" })).toEqual({ commission: null, reason: "owner_lead" });
    expect(parseAcceptResult({ commission: null, reason: "already_paid" })).toEqual({ commission: null, reason: "already_paid" });
    expect(parseAcceptResult(null)).toEqual({ commission: null, reason: null });
    expect(parseAcceptResult({ commission: { amount: 5 }, reason: "something" })).toEqual({ commission: null, reason: null });
  });
});

describe("messages", () => {
  it("turns each database hint into plain words", () => {
    expect(outcomeMessageFor("track_colour_needed")).toBe("Set the track colour first. It goes on the accepted quote.");
    expect(outcomeMessageFor("quote_locked")).toBe(
      "This quote is accepted, so its numbers are locked. Undo the acceptance to change them.",
    );
    expect(outcomeMessageFor("not_allowed")).toBe("Only Keenan can do that.");
    expect(outcomeMessageFor("read_only")).toBe("View as: nothing was saved.");
    expect(outcomeMessageFor("bad_date")).toBe("Pick the install day: today or earlier.");
    // The database also answers not_open for a quote it can't find, so the
    // words fit both.
    expect(outcomeMessageFor("not_open")).toBe("This quote has changed since the page opened. Refresh to see where it stands.");
    expect(outcomeMessageFor("already_accepted")).toBe("Another quote on this lead is already accepted. Undo that one first.");
  });

  it("has words for every hint the outcome functions and guards raise", () => {
    const hints = [
      "not_allowed",
      "not_open",
      "already_accepted",
      "track_colour_needed",
      "bad_runs",
      "bad_reason",
      "bad_note",
      "not_accepted",
      "not_undoable",
      "not_sold",
      "bad_date",
      "outcome_only",
      "quote_locked",
    ];
    for (const hint of hints) expect(outcomeMessageFor(hint)).not.toBe("That didn't save. Check your signal and try again.");
  });

  it("falls back for anything it does not know", () => {
    expect(outcomeMessageFor("toString")).toBe("That didn't save. Check your signal and try again.");
    expect(outcomeMessageFor(null)).toBe("That didn't save. Check your signal and try again.");
  });

  it("makes an action's failure from a database error", () => {
    expect(outcomeFailure({ message: "Track colour needed", hint: "track_colour_needed" })).toEqual({
      ok: false,
      code: "track_colour_needed",
      message: "Set the track colour first. It goes on the accepted quote.",
    });
    expect(outcomeFailure({ message: "boom" })).toEqual({
      ok: false,
      code: "unknown",
      message: "That didn't save. Check your signal and try again.",
    });
  });

  it("never uses an em dash", () => {
    const words = [
      ...OUTCOME_REASON_OPTIONS.map((option) => option.label),
      ...["not_allowed", "not_open", "already_accepted", "track_colour_needed", "bad_runs", "bad_reason", "bad_note", "not_accepted", "not_undoable", "not_sold", "bad_date", "outcome_only", "quote_locked", "no_quote", "no_lead"].map(outcomeMessageFor),
    ];
    for (const text of words) expect(text).not.toMatch(/\u2014/);
  });
});
