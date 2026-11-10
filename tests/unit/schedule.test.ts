import { describe, expect, it } from "vitest";
import { eveningLabel, eveningNote, eveningsOf, initials, isBookable, pickEvening, toBoardSlots, type BoardSlot } from "@/lib/schedule/board";
import { distanceWarnings, formatKm, kmBetween, legs, navigateUrl } from "@/lib/schedule/distance";
import { bookingMessage } from "@/lib/schedule/messages";
import { formatMeetingTime, hasOutcome, isLive, positionSourceText, sentence } from "@/lib/schedule/meetings";
import { bookingProblems, bookingSkip } from "@/lib/schedule/readiness";

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
    expect(pickEvening(evenings, "2026-11-02")).toEqual({ day: "2026-11-02", tonightFull: false, tonightHasTimes: true });
  });

  it("says tonight is full and opens the next evening with an opening", () => {
    const slots = [
      slot("2026-11-02", "23:00", "booked"),
      slot("2026-11-02", "23:35", "held"),
      slot("2026-11-03", "23:00", "closed"),
      slot("2026-11-05", "23:00", "open"),
    ];
    const evenings = eveningsOf(slots, "2026-11-02", 14);
    expect(pickEvening(evenings, "2026-11-02")).toEqual({ day: "2026-11-05", tonightFull: true, tonightHasTimes: true });
    expect(evenings.find((e) => e.day === "2026-11-04")?.slots).toEqual([]);
  });

  it("stays on tonight when nothing is open in the whole window", () => {
    expect(pickEvening(eveningsOf([], "2026-11-02", 14), "2026-11-02")).toEqual({ day: "2026-11-02", tonightFull: true, tonightHasTimes: false });
  });

  // Round 5 (Keenan, 2026-11-06): Session's row of days, with one quiet line.
  it("says quietly when the chosen evening has nothing open, and why the row opened on a later one", () => {
    const today = "2026-11-02";
    const open = { day: today, tonightFull: false, tonightHasTimes: true };
    expect(eveningNote(today, today, [slot(today, "23:00", "open")], open)).toBeNull();
    expect(eveningNote(today, today, [slot(today, "23:00", "held", { heldByViewer: true })], open)).toBeNull();
    expect(eveningNote(today, today, [slot(today, "23:00", "booked"), slot(today, "23:35", "held")], open)).toBe("Nothing open tonight.");
    expect(eveningNote("2026-11-03", today, [slot("2026-11-03", "23:00", "closed")], open)).toBe("Nothing open tomorrow.");
    expect(eveningNote("2026-11-08", today, [], open)).toBe("No meetings on Sun, Nov 8.");
    const later = { day: "2026-11-05", tonightFull: true, tonightHasTimes: true };
    expect(eveningNote("2026-11-05", today, [slot("2026-11-05", "23:00", "open")], later)).toBe("Nothing left tonight. This is the next evening with an opening.");
    expect(eveningNote("2026-11-05", today, [slot("2026-11-05", "23:00", "open")], { ...later, tonightHasTimes: false })).toBe(
      "No meetings tonight. This is the next evening with an opening.",
    );
    expect(eveningNote("2026-11-06", today, [slot("2026-11-06", "23:00", "open")], later)).toBeNull();
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
    expect(formatKm(0.04)).toBe("under 100 m");
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

// Book now, finish later (Keenan, 2026-11-10): a No on owns the home is the
// one answer that rules a booking out.
describe("What rules a booking out", () => {
  it("is only a No on owns the home, the same way the database does", () => {
    expect(bookingProblems({ owns_home: true })).toEqual([]);
    expect(bookingProblems({ owns_home: null })).toEqual([]);
    expect(bookingProblems({ owns_home: false })).toEqual(["owns_home"]);
  });

  it("sends a photo skip only when it's complete, Other with its note", () => {
    expect(bookingSkip(null, "")).toEqual({ skip: null, note: "" });
    expect(bookingSkip("homeowner_said_no", " ")).toEqual({ skip: "homeowner_said_no", note: "" });
    expect(bookingSkip("other", " ")).toEqual({ skip: null, note: "" });
    expect(bookingSkip("other", " Dog in the yard ")).toEqual({ skip: "other", note: "Dog in the yard" });
    // A note left over from a skip taken back goes nowhere.
    expect(bookingSkip(null, "Dog in the yard")).toEqual({ skip: null, note: "" });
  });
});

describe("booking words", () => {
  it("names who is booking a held time", () => {
    expect(bookingMessage({ message: "Zane Salem is booking this time", hint: "slot_held" })).toBe("Zane Salem is booking this time.");
    expect(bookingMessage({ hint: "slot_taken" })).toBe("That time was just taken. Here are the open times now.");
    expect(bookingMessage(null)).toBe("That didn't save. Check your signal and try again.");
  });

  it("says what still stops a booking, by the database's code", () => {
    expect(bookingMessage({ hint: "not_ready", details: "owns_home" })).toBe("Only homeowners can be booked.");
    expect(bookingMessage({ hint: "not_ready", details: "photos_skip_note" })).toBe("Say why the photos were skipped, or leave the reason off.");
    expect(bookingMessage({ hint: "not_ready", details: "" })).toBe("This lead can't be booked yet.");
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
