import { describe, expect, it } from "vitest";
import { DEFAULT_LINES, LINE_SPECS } from "@/lib/deck";
import { describeEvent, type TimelineEvent } from "@/lib/leads/timeline";
import type { QuoteRun } from "@/lib/pricing";
import { runName } from "@/lib/quote-link/view";
import { lineRenamed, newAreaRun, renameRun, renameView, runDisplayName } from "@/lib/quotes/areas";
import { CUSTOMER_OFFER_NAME, offerRunName } from "@/lib/quotes/offers";

// Round 19 (Keenan, 2026-11-13): one name for a line everywhere, the quote
// editor's; the timeline names a customer's own build and the site visit;
// Keenan's own words for Double track.

describe("a line's name everywhere", () => {
  const house: QuoteRun[] = [
    newAreaRun("front_lower", 64),
    newAreaRun("front_upper", 40),
    newAreaRun("front_lower_gable", 12),
    newAreaRun("front_upper_gable", 18),
    newAreaRun("left_lower", 28),
    newAreaRun("left_upper_gable", 10),
  ];

  it("names every measured line apart, a gable always with upper or lower", () => {
    expect(house.map((run) => run.name)).toEqual(["Front", "Front", "Front gable", "Front gable", "Left side", "Left side gable"]);
    expect(house.map((run, at) => runName(run, at))).toEqual([
      "Front lower",
      "Front upper",
      "Front lower gable",
      "Front upper gable",
      "Left side lower",
      "Left side upper gable",
    ]);
    expect(house.map((run, at) => offerRunName(run, at))).toEqual(house.map((run, at) => runName(run, at)));
  });

  it("keeps Keenan's renames, view and line, everywhere", () => {
    const runs = renameView(house.map((run, at) => (at === 3 ? renameRun(run, "Garage peak") : run)), "front", "Street side");
    expect(runs.map(runDisplayName).slice(0, 4)).toEqual(["Street side lower", "Street side upper", "Street side lower gable", "Garage peak"]);
    expect(runs.map((run, at) => runName(run, at)).slice(0, 4)).toEqual(runs.map(runDisplayName).slice(0, 4));
  });

  it("reads an old run under a standard name with its level too; a name of its own stays", () => {
    const old: QuoteRun[] = [
      { name: "Front gable", feet: 18, level: "upper", part: "gable" },
      { name: "Front gable", feet: 12, level: "lower", part: "gable" },
      { name: "Front", feet: 64, level: "lower", part: "eave" },
      { name: "Garage peak", feet: 9, level: "upper", part: "gable" },
      { name: "", feet: 10, level: "lower" },
    ];
    expect(old.map((run, at) => runName(run, at))).toEqual(["Front upper gable", "Front lower gable", "Front lower", "Garage peak", "Run 5"]);
    // Typing the full standard name is no rename.
    expect(lineRenamed(renameRun(newAreaRun("front_upper_gable", 10), "Front upper gable"))).toBe(false);
    expect(lineRenamed(renameRun(newAreaRun("front_upper_gable", 10), "Garage peak"))).toBe(true);
  });
});

describe("the timeline (round 19)", () => {
  const base: Omit<TimelineEvent, "type"> = { id: "e1", lead_id: "l1", actor_id: null, from_status: null, to_status: null, payload: null, created_at: "2026-11-13T01:00:00Z" } as Omit<TimelineEvent, "type">;
  const runs: QuoteRun[] = [newAreaRun("front_lower", 64), newAreaRun("front_upper_gable", 18), newAreaRun("back_lower", 50)];

  it("names a customer's own build by its lines where the quote is readable", () => {
    const event = { ...base, type: "install_requested", payload: { option: CUSTOMER_OFFER_NAME, runs: ["Front", "Front gable"], positions: [0, 1] } } as TimelineEvent;
    expect(describeEvent(event, runs)).toBe("Tapped Book my install: their own option, Front lower and Front upper gable.");
    // A setter never reads the quote; an entry from before round 19 has no positions.
    expect(describeEvent(event)).toBe("Tapped Book my install: their own option.");
    expect(describeEvent({ ...event, payload: { option: CUSTOMER_OFFER_NAME } } as TimelineEvent, runs)).toBe("Tapped Book my install: their own option.");
    // Signing their own build reads the same way.
    expect(describeEvent({ ...base, type: "agreement_signed", payload: { option: CUSTOMER_OFFER_NAME, signer: "Jane Smith" } } as TimelineEvent)).toBe(
      "Signed the agreement for their own option, as Jane Smith.",
    );
    // Keenan's own options read as before.
    expect(describeEvent({ ...base, type: "install_requested", payload: { option: "Full wrap", positions: [0, 1, 2] } } as TimelineEvent, runs)).toBe(
      "Tapped Book my install: Full wrap.",
    );
  });

  it("adds a line when a site visit is set, moved, cleared, done or not done yet", () => {
    const visit = (payload: Record<string, unknown>) => describeEvent({ ...base, type: "site_visit", payload } as TimelineEvent);
    expect(visit({ change: "set", visit_on: "2026-11-16" })).toBe("Set the site visit for Mon, Nov 16.");
    expect(visit({ change: "cleared", visit_on: null })).toBe("Took the site visit day off.");
    expect(visit({ change: "done", visit_on: "2026-11-16" })).toBe("Marked the site visit done.");
    expect(visit({ change: "not_done", visit_on: "2026-11-16" })).toBe("Marked the site visit not done yet.");
    for (const line of [visit({ change: "set", visit_on: "2026-11-16" }), visit({ change: "done" })]) expect(line).not.toMatch(/\$|[–—]/);
  });
});

describe("Keenan's words for Double track", () => {
  it("are the default, and fit Settings' limit for a track's words", () => {
    const words = DEFAULT_LINES.link_track_double;
    expect(words).toBe(
      "Double track is two pieces: a base that fixes to your house and a cover with the lights built in that fits over it, so you never see a screw.",
    );
    expect(words.split(/\s+/).length).toBeLessThanOrEqual(LINE_SPECS.link_track_double.words);
  });
});
