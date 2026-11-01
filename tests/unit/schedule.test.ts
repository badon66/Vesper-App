import { describe, expect, it } from "vitest";
import { eveningLabel, eveningsOf, initials, isBookable, pickEvening, toBoardSlots, type BoardSlot } from "@/lib/schedule/board";
import { distanceWarnings, formatKm, kmBetween, legs, navigateUrl } from "@/lib/schedule/distance";
import { bookingMessage } from "@/lib/schedule/messages";
import { formatMeetingTime, hasOutcome, isLive, positionSourceText, sentence } from "@/lib/schedule/meetings";
import { bookingProblems, leadReadiness, type ReadinessLead } from "@/lib/schedule/readiness";

const slot = (day: string, time: string, state: BoardSlot["state"], extra: Partial<BoardSlot> = {}): BoardSlot => ({
  day,
  startsAt: `${day}T${time}:00.000Z`,
  endsAt: `${day}T${time}:00.000Z`,
  state,
  holderName: null,
  heldByViewer: false,
  meetingId: null,
  leadId: null,
  neighbourhood: null,
  setterName: null,
  setterIsViewer: false,
  ...extra,
});

describe("the schedule board", () => {
  it("reads the database's rows", () => {
    const [first] = toBoardSlots([
      {
        day: "2026-11-02",
        starts_at: "2026-11-02 23:00:00+00",
        ends_at: "2026-11-02 23:35:00+00",
        state: "held",
        holder_id: "x",
        holder_name: "Zane Salem",
        held_by_viewer: false,
        meeting_id: null,
        lead_id: null,
        neighbourhood: null,
        setter_id: null,
        setter_name: null,
        setter_is_viewer: false,
      },
    ]);
    expect(first).toMatchObject({ startsAt: "2026-11-02T23:00:00.000Z", state: "held", holderName: "Zane Salem" });
  });

  it("shows a holder by initials", () => {
    expect(initials("Zane Salem")).toBe("ZS");
    expect(initials("  keenan  ")).toBe("K");
    expect(initials("Mary Ann van Dyke")).toBe("MD");
    expect(initials(null)).toBe("?");
  });

  it("lets a person tap an open time, or the one they already hold, and nothing else", () => {
    expect(isBookable(slot("2026-11-02", "23:00", "open"))).toBe(true);
    expect(isBookable(slot("2026-11-02", "23:00", "held", { heldByViewer: true }))).toBe(true);
    for (const state of ["held", "booked", "blocked", "closed"] as const) {
      expect(isBookable(slot("2026-11-02", "23:00", state))).toBe(false);
    }
  });

  it("opens on tonight while it has an opening", () => {
    const evenings = eveningsOf([slot("2026-11-02", "23:00", "open"), slot("2026-11-03", "23:00", "open")], "2026-11-02", 14);
    expect(evenings).toHaveLength(15);
    expect(pickEvening(evenings, "2026-11-02")).toEqual({ day: "2026-11-02", tonightFull: false });
  });

  it("says tonight is full and opens the next evening with an opening", () => {
    const slots = [
      slot("2026-11-02", "23:00", "booked"),
      slot("2026-11-02", "23:35", "held"),
      slot("2026-11-03", "23:00", "closed"),
      slot("2026-11-05", "23:00", "open"),
    ];
    const evenings = eveningsOf(slots, "2026-11-02", 14);
    expect(pickEvening(evenings, "2026-11-02")).toEqual({ day: "2026-11-05", tonightFull: true });
    expect(evenings.find((e) => e.day === "2026-11-04")?.slots).toEqual([]);
  });

  it("stays on tonight when nothing is open in the whole window", () => {
    expect(pickEvening(eveningsOf([], "2026-11-02", 14), "2026-11-02")).toEqual({ day: "2026-11-02", tonightFull: true });
  });

  it("names evenings the way people say them", () => {
    expect(eveningLabel("2026-11-02", "2026-11-02")).toBe("Tonight");
    expect(eveningLabel("2026-11-03", "2026-11-02")).toBe("Tomorrow");
    expect(eveningLabel("2026-11-05", "2026-11-02")).toBe("Thu, Nov 5");
  });
});

describe("distances", () => {
  const evanston = { lat: 51.1743, lng: -114.1044 };
  const mahogany = { lat: 50.8960, lng: -113.9330 };

  it("measures in a straight line", () => {
    expect(kmBetween(evanston, evanston)).toBe(0);
    expect(kmBetween(evanston, mahogany)).toBeGreaterThan(32);
    expect(kmBetween(evanston, mahogany)).toBeLessThan(34);
    expect(formatKm(3.25)).toBe("3.3 km");
    expect(formatKm(33.4)).toBe("33 km");
  });

  it("warns about the meetings just before and after a time when they are too far, and only those", () => {
    const evening = [
      { startsAt: "2026-11-02T23:00:00Z", ...mahogany, neighbourhood: "Mahogany" },
      { startsAt: "2026-11-02T23:35:00Z", ...evanston, neighbourhood: "Evanston" },
      { startsAt: "2026-11-03T00:45:00Z", ...mahogany, neighbourhood: "Mahogany" },
    ];
    const at = "2026-11-03T00:10:00Z";
    const warnings = distanceWarnings(evanston, at, evening, 10);
    expect(warnings.map((w) => [w.side, w.meeting.neighbourhood])).toEqual([["after", "Mahogany"]]);
    expect(distanceWarnings(mahogany, at, evening, 10).map((w) => w.side)).toEqual(["before"]);
    expect(distanceWarnings(null, at, evening, 10)).toEqual([]);
    expect(distanceWarnings(evanston, at, evening, 100)).toEqual([]);
  });

  it("gives Tonight the distance from each meeting to the one before", () => {
    const evening = [
      { startsAt: "1", ...evanston, neighbourhood: null },
      { startsAt: "2", ...mahogany, neighbourhood: null },
      { startsAt: "3", lat: null, lng: null, neighbourhood: null },
    ];
    const result = legs(evening);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeGreaterThan(32);
    expect(result[2]).toBeNull();
  });

  it("navigates to the map position, or the address when there is none", () => {
    expect(navigateUrl({ lat: 51.1, lng: -114.1, address_line: "1 A St", city: "Calgary" })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=51.1%2C-114.1",
    );
    expect(navigateUrl({ lat: null, lng: null, address_line: "1 A St", city: "Calgary" })).toContain("1%20A%20St%2C%20Calgary");
  });
});

describe("Before you book", () => {
  const ready: ReadinessLead = { phone: "+14035550100", owns_home: true, wants_price: true, soffit_colour: "not_sure", lat: 51, lng: -114 };

  it("lists each thing a lead still needs, the same way the database does", () => {
    expect(bookingProblems(ready, 3, { everyone: true, skip: null, skipNote: "" })).toEqual([]);
    expect(
      bookingProblems(
        { phone: null, owns_home: false, wants_price: null, soffit_colour: null, lat: null, lng: null },
        0,
        { everyone: false, skip: null, skipNote: "" },
      ),
    ).toEqual(["phone", "owns_home", "wants_price", "soffit_colour", "map_position", "photos", "everyone_deciding_present"]);
  });

  it("takes a skip reason for missing photos, with a note for Other", () => {
    expect(bookingProblems(ready, 2, { everyone: true, skip: "homeowner_said_no", skipNote: "" })).toEqual([]);
    expect(bookingProblems(ready, 2, { everyone: true, skip: "other", skipNote: " " })).toEqual(["photos_skip_note"]);
    expect(bookingProblems(ready, 2, { everyone: true, skip: "other", skipNote: "Dog in the yard" })).toEqual([]);
  });

  it("shows the lead's own items as a checklist", () => {
    const items = leadReadiness({ ...ready, phone: null }, 3);
    expect(items.map((item) => [item.key, item.ok])).toEqual([
      ["phone", false],
      ["owns_home", true],
      ["wants_price", true],
      ["soffit_colour", true],
      ["photos", true],
      ["map_position", true],
    ]);
  });
});

describe("booking words", () => {
  it("names who is booking a held time", () => {
    expect(bookingMessage({ message: "Zane Salem is booking this time", hint: "slot_held" })).toBe("Zane Salem is booking this time.");
    expect(bookingMessage({ hint: "slot_taken" })).toBe("That time was just taken. Here are the open times now.");
    expect(bookingMessage(null)).toBe("That didn't save. Check your signal and try again.");
  });

  it("formats meeting times and statuses", () => {
    expect(formatMeetingTime("2026-11-02T23:35:00Z")).toBe("Mon, Nov 2 at 5:35 p.m.");
    expect(isLive("booked") && !isLive("moved") && hasOutcome("no_show") && !hasOutcome("booked")).toBe(true);
    expect(positionSourceText("device", 8.4)).toBe("Placed from the phone at the door, accurate to about 8 m");
    expect(positionSourceText(null, null)).toBeNull();
    expect(sentence("You're holding Sat, Nov 14 at 5:00 p.m.")).toBe("You're holding Sat, Nov 14 at 5:00 p.m.");
    expect(sentence("Booked")).toBe("Booked.");
  });
});
