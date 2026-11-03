import { describe, expect, it } from "vitest";
import { ANSWER_OR_NOT_COLLECTED, leadColumnsFromValues, leadFormDataToInput, parseLeadForm } from "@/lib/leads/schema";

const me = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const photo = "0b6f6f0e-2c1a-4e8b-9a7d-5c3e2f1a0b9c";

// Every counted question marked Not collected (round 2): the least a lead
// needs to be saved.
const blank = {
  first_name: "Dana",
  last_name: "",
  phone: "",
  phone_not_collected: "1",
  email: "",
  address_line: "123 Evanston Way NW",
  city: "",
  postal_code: "",
  neighbourhood: "",
  lat: "",
  lng: "",
  place_id: "",
  position_source: "",
  position_accuracy_m: "",
  house_type: "",
  soffit_colour: "",
  soffit_note: "",
  owns_home: "not_collected",
  wants_price: "not_collected",
  both_decision_makers: "not_collected",
  christmas_lights_now: "not_collected",
  looked_into_before: "not_collected",
  areas_wanted: "not_collected",
  install_timing: "not_collected",
  notes: "",
  source: "door",
  photo_paths: [] as string[],
  photo_slot_front: "",
  photo_slot_left_corner: "",
  photo_slot_right_corner: "",
  photo_slot_soffit: "",
};

describe("parseLeadForm", () => {
  it("needs a first name, an address and every question answered or Not collected; blanks become nothing and the city defaults to Calgary", () => {
    const result = parseLeadForm(blank);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toMatchObject({
      first_name: "Dana",
      last_name: null,
      phone: null,
      email: null,
      city: "Calgary",
      lat: null,
      lng: null,
      place_id: null,
      house_type: null,
      source: "door",
    });
  });

  it("names the missing first name and address", () => {
    const result = parseLeadForm({ ...blank, first_name: " ", address_line: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.first_name).toMatch(/first name/i);
    expect(result.errors.address_line).toMatch(/address/i);
  });

  it("stores phones as E.164 with Canada as the default and flags bad numbers", () => {
    const good = parseLeadForm({ ...blank, phone: "(403) 555-0199" });
    expect(good.ok && good.values.phone).toBe("+14035550199");
    const bad = parseLeadForm({ ...blank, phone: "555" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.phone).toMatch(/phone number/i);
  });

  it("checks email only when one is given", () => {
    expect(parseLeadForm({ ...blank, email: "dana@example.com" }).ok).toBe(true);
    const bad = parseLeadForm({ ...blank, email: "dana@" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.email).toMatch(/email/i);
  });

  it("keeps a full map position with its place id and drops a half one entirely", () => {
    const full = parseLeadForm({ ...blank, lat: "51.17", lng: "-114.1", place_id: "ChIJx" });
    expect(full.ok && [full.values.lat, full.values.lng, full.values.place_id]).toEqual([51.17, -114.1, "ChIJx"]);
    const half = parseLeadForm({ ...blank, lat: "51.17", lng: "", place_id: "ChIJx" });
    expect(half.ok && [half.values.lat, half.values.lng, half.values.place_id]).toEqual([null, null, null]);
    const nonsense = parseLeadForm({ ...blank, lat: "north", lng: "-114.1" });
    expect(nonsense.ok).toBe(false);
    if (!nonsense.ok) expect(nonsense.errors.address_line).toMatch(/pick the address again/i);
  });

  it("stores Not collected as such, never as an answer, and the soffit stays optional", () => {
    const result = parseLeadForm(blank);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toMatchObject({
      phone: null,
      owns_home: null,
      wants_price: null,
      both_decision_makers: null,
      soffit_colour: null,
      christmas_lights_now: null,
      areas_wanted: null,
      install_timing: null,
      slot_photos: [],
    });
    expect(result.values.not_collected).toEqual([
      "phone",
      "owns_home",
      "wants_price",
      "both_decision_makers",
      "christmas_lights_now",
      "looked_into_before",
      "areas_wanted",
      "install_timing",
    ]);
  });

  it("refuses to save while a question has neither an answer nor Not collected, naming each one", () => {
    const result = parseLeadForm({ ...blank, phone_not_collected: "", wants_price: "", install_timing: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual({
      phone: ANSWER_OR_NOT_COLLECTED,
      wants_price: ANSWER_OR_NOT_COLLECTED,
      install_timing: ANSWER_OR_NOT_COLLECTED,
    });
  });

  it("lets an answer win over Not collected, the phone included", () => {
    const result = parseLeadForm({ ...blank, phone: "403 555 0199", owns_home: "yes", both_decision_makers: "no" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.phone).toBe("+14035550199");
    expect(result.values.owns_home).toBe(true);
    expect(result.values.both_decision_makers).toBe(false);
    expect(result.values.not_collected).not.toContain("phone");
    expect(result.values.not_collected).not.toContain("owns_home");
    expect(result.values.not_collected).not.toContain("both_decision_makers");
  });

  it("stores the yes or no answers as true or false", () => {
    const yes = parseLeadForm({ ...blank, owns_home: "yes", wants_price: "yes" });
    expect(yes.ok && [yes.values.owns_home, yes.values.wants_price]).toEqual([true, true]);
    const no = parseLeadForm({ ...blank, owns_home: "no", wants_price: "not_yet" });
    expect(no.ok && [no.values.owns_home, no.values.wants_price]).toEqual([false, false]);
    // Each question has its own words for no.
    expect(parseLeadForm({ ...blank, owns_home: "not_yet" }).ok).toBe(false);
    expect(parseLeadForm({ ...blank, wants_price: "no" }).ok).toBe(false);
    expect(parseLeadForm({ ...blank, owns_home: "maybe" }).ok).toBe(false);
  });

  it("accepts the listed answers to the other Find out questions", () => {
    const result = parseLeadForm({
      ...blank,
      christmas_lights_now: "hires",
      areas_wanted: "front_and_sides",
      install_timing: "before_christmas",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values).toMatchObject({
      christmas_lights_now: "hires",
      areas_wanted: "front_and_sides",
      install_timing: "before_christmas",
    });
    const wrong = parseLeadForm({ ...blank, christmas_lights_now: "neighbour", areas_wanted: "roof", install_timing: "never" });
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) {
      expect(Object.keys(wrong.errors).sort()).toEqual(["areas_wanted", "christmas_lights_now", "install_timing"]);
    }
  });

  it("offers only White, Off-white or cream, Other and Not sure for the soffit", () => {
    for (const soffit of ["white", "off_white", "other", "not_sure"]) {
      expect(parseLeadForm({ ...blank, soffit_colour: soffit }).ok).toBe(true);
    }
    // Black and Brown stay in the database type, unused; the app never offers them.
    expect(parseLeadForm({ ...blank, soffit_colour: "black" }).ok).toBe(false);
    expect(parseLeadForm({ ...blank, soffit_colour: "brown" }).ok).toBe(false);
  });

  it("collects the guided photos with their slots, in slot order", () => {
    const front = `${me}/${photo}.jpg`;
    const soffit = `${me}/1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d.jpg`;
    const result = parseLeadForm({ ...blank, photo_slot_soffit: soffit, photo_slot_front: front });
    expect(result.ok && result.values.slot_photos).toEqual([
      { slot: "front", path: front },
      { slot: "soffit", path: soffit },
    ]);
    const bad = parseLeadForm({ ...blank, photo_slot_left_corner: "../etc/passwd" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.errors.photo_paths).toMatch(/did not upload/i);
  });

  it("accepts only the listed choices and keeps the soffit note only for Other", () => {
    expect(parseLeadForm({ ...blank, house_type: "castle" }).ok).toBe(false);
    const white = parseLeadForm({ ...blank, soffit_colour: "white", soffit_note: "cream" });
    expect(white.ok && white.values.soffit_note).toBeNull();
    const other = parseLeadForm({ ...blank, soffit_colour: "other", soffit_note: "cream" });
    expect(other.ok && other.values.soffit_note).toBe("cream");
  });

  it("accepts up to six photos, each in the uploader's folder format", () => {
    expect(parseLeadForm({ ...blank, photo_paths: [`${me}/${photo}.jpg`] }).ok).toBe(true);
    expect(parseLeadForm({ ...blank, photo_paths: ["../etc/passwd"] }).ok).toBe(false);
    expect(parseLeadForm({ ...blank, photo_paths: Array(7).fill(`${me}/${photo}.jpg`) }).ok).toBe(false);
  });
});

describe("leadFormDataToInput and leadColumnsFromValues", () => {
  // A form with every counted question marked Not collected.
  function formWithNotCollected(): FormData {
    const fd = new FormData();
    fd.set("phone_not_collected", "1");
    for (const question of ["owns_home", "wants_price", "both_decision_makers", "christmas_lights_now", "looked_into_before", "areas_wanted", "install_timing"]) {
      fd.set(question, "not_collected");
    }
    return fd;
  }

  it("reads the form and never writes status, owner or session from it", () => {
    const fd = formWithNotCollected();
    fd.set("first_name", "Dana");
    fd.set("address_line", "123 Evanston Way NW");
    fd.set("status", "sold");
    fd.set("created_by", photo);
    fd.append("photo_paths", `${me}/${photo}.jpg`);
    const input = leadFormDataToInput(fd);
    expect(input.source).toBe("door");
    expect(input.photo_paths).toEqual([`${me}/${photo}.jpg`]);
    const parsed = parseLeadForm(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const columns = leadColumnsFromValues(parsed.values);
    for (const key of ["status", "created_by", "assigned_to", "knock_session_id", "photo_paths"]) {
      expect(columns).not.toHaveProperty(key);
    }
  });

  it("reads the Find out answers and slot photos, and never writes the track colour", () => {
    const fd = formWithNotCollected();
    fd.set("first_name", "Dana");
    fd.set("address_line", "123 Evanston Way NW");
    fd.set("owns_home", "yes");
    fd.set("wants_price", "not_yet");
    fd.set("soffit_colour", "off_white");
    fd.set("install_timing", "no_rush");
    fd.set("photo_slot_right_corner", `${me}/${photo}.jpg`);
    fd.set("track_colour_id", photo);
    fd.set("track_ral_code", "7016");
    const input = leadFormDataToInput(fd);
    expect(input).toMatchObject({ christmas_lights_now: "not_collected", areas_wanted: "not_collected", photo_slot_front: "" });
    const parsed = parseLeadForm(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.values.slot_photos).toEqual([{ slot: "right_corner", path: `${me}/${photo}.jpg` }]);
    const columns = leadColumnsFromValues(parsed.values);
    expect(columns).toMatchObject({
      owns_home: true,
      wants_price: false,
      soffit_colour: "off_white",
      christmas_lights_now: null,
      areas_wanted: null,
      install_timing: "no_rush",
      not_collected: ["phone", "both_decision_makers", "christmas_lights_now", "looked_into_before", "areas_wanted"],
    });
    for (const key of ["track_colour_id", "track_ral_code", "slot_photos", "photo_slot_right_corner"]) {
      expect(columns).not.toHaveProperty(key);
    }
  });
});
