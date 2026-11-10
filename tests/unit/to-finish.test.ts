import { describe, expect, it } from "vitest";
import {
  ADDRESS_TO_COME,
  bookingsToFinishLabel,
  guidedPhotoCount,
  isOwnLead,
  isUpcomingBooking,
  NAME_TO_COME,
  toBeCompletedLabel,
  toFinish,
  toFinishHref,
  type ToFinishLead,
  type ToFinishPhotos,
} from "@/lib/leads/to-finish";

// Book now, finish later (Keenan, 2026-11-10): a booking needs only a time
// and a name or an address; the rest of the old Before you book list is
// listed to finish later, on the setter's reminder bar and the lead page.

const ID = "00000000-0000-4000-8000-000000000001";

// A lead with everything in.
function done(patch: Partial<ToFinishLead> = {}): ToFinishLead {
  return {
    id: ID,
    name_to_come: false,
    address_to_come: false,
    lat: 51.05,
    lng: -114.07,
    phone_saved: true,
    owns_home: true,
    wants_price: true,
    both_decision_makers: true,
    christmas_lights_now: "none",
    looked_into_before: "new_to_them",
    soffit_colour: "white",
    not_collected: [],
    ...patch,
  };
}

// A booking made with only a name, at the door.
function bare(patch: Partial<ToFinishLead> = {}): ToFinishLead {
  return done({
    address_to_come: true,
    lat: null,
    lng: null,
    phone_saved: false,
    owns_home: null,
    wants_price: null,
    both_decision_makers: null,
    christmas_lights_now: null,
    looked_into_before: null,
    soffit_colour: null,
    ...patch,
  });
}

const ALL_PHOTOS: ToFinishPhotos = { guided: 3, skipped: false };
const NO_PHOTOS: ToFinishPhotos = { guided: 0, skipped: false };
const keys = (items: { key: string }[]) => items.map((item) => item.key);

describe("What a booking still needs", () => {
  it("is nothing when everything is in", () => {
    expect(toFinish(done(), ALL_PHOTOS, "booking")).toEqual([]);
    expect(toFinish(done(), ALL_PHOTOS, "lead")).toEqual([]);
  });

  it("lists the old Before you book items, in order, for a booking made with only a name", () => {
    expect(keys(toFinish(bare(), NO_PHOTOS, "booking"))).toEqual([
      "address",
      "phone",
      "owns_home",
      "wants_price",
      "both_decision_makers",
      "soffit_colour",
      "photos",
    ]);
  });

  it("adds Christmas lights now and Looked into it before on the lead page", () => {
    expect(keys(toFinish(bare(), NO_PHOTOS, "lead"))).toEqual([
      "address",
      "phone",
      "owns_home",
      "wants_price",
      "both_decision_makers",
      "christmas_lights_now",
      "looked_into_before",
      "soffit_colour",
      "photos",
    ]);
    // Never on the reminder bar: they were never needed to book.
    const onBar = keys(toFinish(done({ christmas_lights_now: null, looked_into_before: null }), ALL_PHOTOS, "booking"));
    expect(onBar).toEqual([]);
  });

  it("lists the name when it is still to come, by its flag", () => {
    const items = toFinish(done({ name_to_come: true }), ALL_PHOTOS, "booking");
    expect(keys(items)).toEqual(["name"]);
    expect(items[0].href).toBe(`/app/leads/${ID}/edit#lead-first_name`);
  });

  it("folds the map position into an address still to come, and lists it alone once there's an address", () => {
    const toCome = toFinish(done({ address_to_come: true, lat: null, lng: null }), ALL_PHOTOS, "booking");
    expect(keys(toCome)).toEqual(["address"]);
    const typed = toFinish(done({ lat: null, lng: null }), ALL_PHOTOS, "booking");
    expect(keys(typed)).toEqual(["map_position"]);
    expect(typed[0].href).toBe(`/app/leads/${ID}/edit#lead-address`);
    expect(keys(toFinish(done({ lng: null }), ALL_PHOTOS, "booking"))).toEqual(["map_position"]);
  });

  it("reads the phone only from phone_saved (contact privacy)", () => {
    expect(keys(toFinish(done({ phone_saved: false }), ALL_PHOTOS, "booking"))).toEqual(["phone"]);
    expect(toFinish(done({ phone_saved: false }), ALL_PHOTOS, "booking")[0].detail).toBe("No number yet");
    const marked = toFinish(done({ phone_saved: false, not_collected: ["phone"] }), ALL_PHOTOS, "booking");
    expect(marked[0].detail).toBe("Not collected");
    expect(marked[0].href).toBe(`/app/leads/${ID}/edit#lead-phone`);
  });

  it("counts Not collected as still to finish, and says so", () => {
    const lead = done({ owns_home: null, wants_price: null, not_collected: ["owns_home"] });
    const items = toFinish(lead, ALL_PHOTOS, "booking");
    expect(keys(items)).toEqual(["owns_home", "wants_price"]);
    expect(items.map((item) => item.detail)).toEqual(["Not collected", "Not asked yet"]);
  });

  it("takes a No on wants a price or everyone who decides as an answer", () => {
    expect(toFinish(done({ wants_price: false, both_decision_makers: false }), ALL_PHOTOS, "booking")).toEqual([]);
  });

  it("takes a No on owns the home as an answer on a lead (it rules booking out, it isn't missing)", () => {
    expect(toFinish(done({ owns_home: false }), ALL_PHOTOS, "lead")).toEqual([]);
  });

  it("takes Not sure as a soffit answer", () => {
    expect(toFinish(done({ soffit_colour: "not_sure" }), ALL_PHOTOS, "booking")).toEqual([]);
    expect(keys(toFinish(done({ soffit_colour: null }), ALL_PHOTOS, "booking"))).toEqual(["soffit_colour"]);
  });

  it("needs all three guided photos, unless the booking says why they were skipped", () => {
    const two = toFinish(done(), { guided: 2, skipped: false }, "booking");
    expect(keys(two)).toEqual(["photos"]);
    expect(two[0].detail).toBe("2 of 3 taken");
    expect(two[0].href).toBe(`/app/leads/${ID}#photos`);
    expect(toFinish(done(), { guided: 0, skipped: true }, "booking")).toEqual([]);
    expect(toFinish(done(), { guided: 3, skipped: false }, "booking")).toEqual([]);
  });

  it("sends each question to its own answers on the edit page", () => {
    for (const key of ["owns_home", "wants_price", "both_decision_makers", "soffit_colour", "christmas_lights_now", "looked_into_before"] as const) {
      expect(toFinishHref(ID, key)).toBe(`/app/leads/${ID}/edit#q-${key}`);
    }
  });

  it("writes plain words, with no em dashes", () => {
    const words = toFinish(bare({ name_to_come: true }), NO_PHOTOS, "lead")
      .flatMap((item) => [item.label, item.detail])
      .join(" ");
    expect(words).not.toMatch(/—/);
  });
});

describe("Counting the guided photos", () => {
  it("counts Front, Left corner and Right corner once each, and nothing else", () => {
    expect(guidedPhotoCount([])).toBe(0);
    expect(guidedPhotoCount(["front", "soffit", "mockup", null])).toBe(1);
    expect(guidedPhotoCount(["front", "left_corner", "right_corner", "front"])).toBe(3);
  });
});

describe("The reminder bar and the dropdown", () => {
  it("says how many bookings are left to finish", () => {
    expect(bookingsToFinishLabel(1)).toBe("1 booking to finish");
    expect(bookingsToFinishLabel(2)).toBe("2 bookings to finish");
  });

  it("says how many things are left on the lead", () => {
    expect(toBeCompletedLabel(4)).toBe("To be completed (4)");
  });

  it("counts a setter's own leads: made by them or assigned to them", () => {
    expect(isOwnLead({ created_by: "a", assigned_to: null }, "a")).toBe(true);
    expect(isOwnLead({ created_by: "b", assigned_to: "a" }, "a")).toBe(true);
    expect(isOwnLead({ created_by: "b", assigned_to: "c" }, "a")).toBe(false);
  });

  it("counts bookings still on and not started", () => {
    const now = Date.parse("2026-11-10T00:00:00Z");
    expect(isUpcomingBooking({ status: "booked", starts_at: "2026-11-10T01:00:00Z" }, now)).toBe(true);
    expect(isUpcomingBooking({ status: "confirmed", starts_at: "2026-11-10T01:00:00Z" }, now)).toBe(true);
    expect(isUpcomingBooking({ status: "booked", starts_at: "2026-11-09T23:59:00Z" }, now)).toBe(false);
    expect(isUpcomingBooking({ status: "booked", starts_at: "2026-11-10T00:00:00Z" }, now)).toBe(false);
    for (const status of ["qualified", "not_qualified", "no_show", "cancelled", "moved"]) {
      expect(isUpcomingBooking({ status, starts_at: "2026-11-10T01:00:00Z" }, now)).toBe(false);
    }
  });

  it("names the placeholders a booking saves", () => {
    expect(NAME_TO_COME).toBe("Name to come");
    expect(ADDRESS_TO_COME).toBe("Address to come");
  });
});
