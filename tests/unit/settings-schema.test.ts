import { describe, expect, it } from "vitest";
import {
  fractionToPercentString,
  parseSettingsForm,
  settingsFormDataToInput,
  settingsRowToFormDefaults,
  settingsUpdateFromValues,
} from "@/lib/settings/schema";

const valid = {
  price_per_ft: "23",
  box_price: "500.00",
  neighbour_discount: "150",
  referral_credit: "150",
  gst_enabled: false,
  gst_rate_percent: "5",
  gst_number: "",
  booking_pay: "20",
  commission_rate_percent: "5",
  warranty_text: "Ten year warranty on parts and labour.",
  meeting_days: ["1", "2", "3", "4", "5", "6"],
  meeting_start: "18:00",
  meeting_slot_minutes: "45",
  meeting_slot_count: "4",
  booking_cutoff_minutes: "30",
  hold_minutes: "5",
  booking_window_days: "14",
  distance_warning_km: "10",
  lost_reasons: "price\nother company\nnot now",
  step_note_at_door: "Who you are.\r\nFind out.\r\n",
  step_note_after_door: "Photos.",
  step_note_book: "Book it.",
  not_qualified_reasons: "Not the homeowner\nDecision maker missing\nOther",
  company_name: "Vesper Lighting, Inc.",
  company_phone: "",
  company_email: "info@vesperlighting.ca",
  company_address: "",
  christmas_banner_on: true,
  christmas_banner_title: " Want them up for Christmas? ",
  christmas_banner_text: "We install every day\r\nthe weather allows.",
  product_points: [
    { icon: "lightbulb", text: " RGBW lights. " },
    { icon: "rocket", text: "Unknown icon." },
    { icon: "plug", text: "   " },
  ],
  rush_colour_fee: "350",
  upper_access_fee: "200",
  upper_gable_access_fee: "",
  service_call_fee: "95",
  price_hold_days: "120",
  min_job_total: "2500",
  faq_text: "Q.\r\nA.",
  presentation_pages: [
    { kind: "what_vesper_is", title: "Permanent roofline lighting", body: "An investment in the home." },
    { kind: "gallery", title: "Our installs", body: "" },
  ],
};

describe("parseSettingsForm", () => {
  it("accepts the defaults and converts percentages to fractions", () => {
    const result = parseSettingsForm(valid);
    if (result.ok) {
      expect(result.values.rush_colour_fee).toBe(350);
      expect(result.values.upper_access_fee).toBe(200);
      expect(result.values.upper_gable_access_fee).toBeNull();
      expect(result.values.service_call_fee).toBe(95);
      expect(result.values.price_hold_days).toBe(120);
      expect(result.values.christmas_banner_title).toBe("Want them up for Christmas?");
      expect(result.values.christmas_banner_text).toBe("We install every day the weather allows.");
      // A blank line is left out; an unknown icon becomes a tick.
      expect(result.values.product_points).toEqual([
        { icon: "lightbulb", text: "RGBW lights." },
        { icon: "check", text: "Unknown icon." },
      ]);
      expect(result.values.min_job_total).toBe(2500);
      expect(result.values.faq_text).toBe("Q.\nA.");
      expect(result.values.presentation_pages[0]).toEqual({
        kind: "what_vesper_is",
        title: "Permanent roofline lighting",
        body: "An investment in the home.",
      });
    }
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.gst_rate_percent).toBe(0.05);
    expect(result.values.commission_rate_percent).toBe(0.05);
    expect(result.values.meeting_days).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.values.lost_reasons).toEqual(["price", "other company", "not now"]);
  });

  it("rounds money to the cent and percentages to four decimals", () => {
    const result = parseSettingsForm({ ...valid, price_per_ft: "23.456", commission_rate_percent: "12.345" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.price_per_ft).toBe(23.46);
    expect(result.values.commission_rate_percent).toBe(0.1235);
  });

  it("rejects blank or negative money with the field named", () => {
    const blank = parseSettingsForm({ ...valid, box_price: "" });
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.errors.box_price).toMatch(/number/);
    const negative = parseSettingsForm({ ...valid, booking_pay: "-5" });
    expect(negative.ok).toBe(false);
    if (!negative.ok) expect(negative.errors.booking_pay).toMatch(/negative/);
  });

  it("requires at least one meeting day and a real time", () => {
    const noDays = parseSettingsForm({ ...valid, meeting_days: [] });
    expect(noDays.ok).toBe(false);
    if (!noDays.ok) expect(noDays.errors.meeting_days).toMatch(/day/);
    const badTime = parseSettingsForm({ ...valid, meeting_start: "6pm" });
    expect(badTime.ok).toBe(false);
    if (!badTime.ok) expect(badTime.errors.meeting_start).toMatch(/18:00/);
  });

  it("dedupes and sorts days, trims and dedupes lost reasons", () => {
    const result = parseSettingsForm({ ...valid, meeting_days: ["6", "1", "1", "0"], lost_reasons: " price \n\nprice\nother " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.meeting_days).toEqual([0, 1, 6]);
    expect(result.values.lost_reasons).toEqual(["price", "other"]);
  });

  it("keeps slot counts and lengths inside sane bounds", () => {
    const tooMany = parseSettingsForm({ ...valid, meeting_slot_count: "13" });
    expect(tooMany.ok).toBe(false);
    const tooShort = parseSettingsForm({ ...valid, meeting_slot_minutes: "10" });
    expect(tooShort.ok).toBe(false);
    const fraction = parseSettingsForm({ ...valid, meeting_slot_count: "2.5" });
    expect(fraction.ok).toBe(false);
  });

  it("stores a trimmed GST number and turns blank into null", () => {
    const withNumber = parseSettingsForm({ ...valid, gst_number: "  123456789 RT0001 " });
    expect(withNumber.ok).toBe(true);
    if (withNumber.ok) expect(settingsUpdateFromValues(withNumber.values).gst_number).toBe("123456789 RT0001");
  });

  it("keeps each step note's line breaks, trims it, and refuses it empty or too long", () => {
    const result = parseSettingsForm(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values.step_note_at_door).toBe("Who you are.\nFind out.");
      const update = settingsUpdateFromValues(result.values);
      expect([update.step_note_at_door, update.step_note_after_door, update.step_note_book]).toEqual(["Who you are.\nFind out.", "Photos.", "Book it."]);
      expect(update).not.toHaveProperty("door_guide");
    }
    for (const field of ["step_note_at_door", "step_note_after_door", "step_note_book"] as const) {
      const empty = parseSettingsForm({ ...valid, [field]: "  \n " });
      expect(empty.ok).toBe(false);
      if (!empty.ok) expect(empty.errors[field]).toBe("cannot be empty");
      expect(parseSettingsForm({ ...valid, [field]: "x".repeat(2001) }).ok).toBe(false);
      expect(parseSettingsForm({ ...valid, [field]: "x".repeat(2000) }).ok).toBe(true);
    }
  });

  it("keeps the booking cutoff, hold grace period and window within sensible bounds", () => {
    const result = parseSettingsForm(valid);
    expect(result.ok && [result.values.booking_cutoff_minutes, result.values.hold_minutes, result.values.booking_window_days]).toEqual([30, 5, 14]);
    expect(parseSettingsForm({ ...valid, hold_minutes: "0" }).ok).toBe(false);
    expect(parseSettingsForm({ ...valid, booking_cutoff_minutes: "-5" }).ok).toBe(false);
    expect(parseSettingsForm({ ...valid, booking_window_days: "61" }).ok).toBe(false);
    const reasons = parseSettingsForm({ ...valid, not_qualified_reasons: "  " });
    expect(reasons.ok).toBe(false);
  });

  it("allows an empty company email but not a malformed one", () => {
    expect(parseSettingsForm({ ...valid, company_email: "" }).ok).toBe(true);
    expect(parseSettingsForm({ ...valid, company_email: "info@" }).ok).toBe(false);
  });
});

describe("settingsUpdateFromValues", () => {
  it("maps percent fields onto the stored rate columns and nests company", () => {
    const parsed = parseSettingsForm(valid);
    if (!parsed.ok) throw new Error("expected valid input");
    const update = settingsUpdateFromValues(parsed.values);
    expect(update.gst_rate).toBe(0.05);
    expect(update.gst_number).toBeNull();
    expect(update.commission_rate).toBe(0.05);
    expect(update).not.toHaveProperty("gst_rate_percent");
    expect(update.company).toEqual({
      name: "Vesper Lighting, Inc.",
      phone: "",
      email: "info@vesperlighting.ca",
      address: "",
    });
  });
});

describe("settingsRowToFormDefaults", () => {
  it("turns the stored row back into input strings", () => {
    const defaults = settingsRowToFormDefaults({
      id: 1,
      price_per_ft: 23,
      box_price: 500,
      neighbour_discount: 150,
      referral_credit: 150,
      gst_rate: 0.05,
      gst_enabled: false,
      gst_number: "123456789 RT0001",
      booking_pay: 20,
      commission_rate: 0.125,
      warranty_text: "w",
      presentation: [],
      lost_reasons: ["price", "other"],
      door_guide: "1. Open.\n2. Find out.",
      step_note_at_door: "Who you are.",
      step_note_after_door: "Photos.",
      step_note_book: "Book it.",
      not_qualified_reasons: ["Not the homeowner", "Other"],
      booking_cutoff_minutes: 30,
      hold_grace_minutes: 2,
      hold_minutes: 5,
      booking_window_days: 14,
      meeting_host_id: null,
      meeting_days: [1, 2, 3, 4, 5, 6],
      meeting_start: "18:00:00",
      meeting_slot_minutes: 45,
      meeting_slot_count: 4,
      distance_warning_km: 10,
      company: { name: "Vesper", phone: "", email: "", address: "" },
      rush_colour_fee_per_ft: null, service_call_fee: 95, quote_valid_days: 14, min_job_total: null, faq_text: "Q and A",
      rush_colour_fee: 350, upper_access_fee: null, upper_gable_access_fee: 400, price_hold_days: 120,
      christmas_banner_on: false, christmas_banner_title: "Want them up for Christmas?", christmas_banner_text: "Book now.",
      product_points: [{ icon: "zap", text: "A 24V system." }, { icon: "rocket", text: "Odd icon." }, "junk", { icon: "plug", text: "" }],
      updated_at: "2026-10-26T00:00:00Z",
    });
    expect(defaults.price_per_ft).toBe("23.00");
    expect(defaults.rush_colour_fee).toBe("350.00");
    expect(defaults.upper_access_fee).toBe("");
    expect(defaults.upper_gable_access_fee).toBe("400.00");
    expect(defaults.service_call_fee).toBe("95.00");
    expect(defaults.price_hold_days).toBe("120");
    expect([defaults.christmas_banner_on, defaults.christmas_banner_title, defaults.christmas_banner_text]).toEqual([false, "Want them up for Christmas?", "Book now."]);
    // Always six rows for the form, blank ones filling the rest.
    expect(defaults.product_points).toEqual([
      { icon: "zap", text: "A 24V system." },
      { icon: "check", text: "Odd icon." },
      { icon: "check", text: "" },
      { icon: "check", text: "" },
      { icon: "check", text: "" },
      { icon: "check", text: "" },
    ]);
    expect(defaults.min_job_total).toBe("");
    expect(defaults.gst_rate_percent).toBe("5");
    expect(defaults.gst_number).toBe("123456789 RT0001");
    expect(defaults.commission_rate_percent).toBe("12.5");
    expect(defaults.meeting_start).toBe("18:00");
    expect(defaults.lost_reasons).toBe("price\nother");
    expect([defaults.step_note_at_door, defaults.step_note_after_door, defaults.step_note_book]).toEqual(["Who you are.", "Photos.", "Book it."]);
    expect(defaults.not_qualified_reasons).toBe("Not the homeowner\nOther");
    expect([defaults.booking_cutoff_minutes, defaults.hold_minutes, defaults.booking_window_days]).toEqual(["30", "5", "14"]);
    expect(defaults.company_name).toBe("Vesper");
  });

  it("survives a company value that is not an object", () => {
    const defaults = settingsRowToFormDefaults({
      id: 1, price_per_ft: 1, box_price: 1, neighbour_discount: 0, referral_credit: 0, gst_rate: 0, gst_enabled: false, gst_number: null,
      booking_pay: 0, commission_rate: 0, warranty_text: "w", presentation: [], lost_reasons: [], door_guide: "g", step_note_at_door: "a", step_note_after_door: "b", step_note_book: "c", not_qualified_reasons: ["Other"], booking_cutoff_minutes: 30, hold_grace_minutes: 2, hold_minutes: 5, booking_window_days: 14, meeting_host_id: null, meeting_days: [1],
      meeting_start: "18:00:00", meeting_slot_minutes: 45, meeting_slot_count: 4, distance_warning_km: 10,
      company: "nonsense", rush_colour_fee_per_ft: null, service_call_fee: null, quote_valid_days: 14, min_job_total: 2500, faq_text: "",
      rush_colour_fee: null, upper_access_fee: 200, upper_gable_access_fee: 400, price_hold_days: 120,
      christmas_banner_on: true, christmas_banner_title: "T", christmas_banner_text: "", product_points: [],
      updated_at: "2026-10-26T00:00:00Z",
    });
    expect(defaults.company_name).toBe("");
  });
});

describe("settingsFormDataToInput", () => {
  it("reads checkbox groups and the GST switch from FormData", () => {
    const fd = new FormData();
    fd.set("gst_enabled", "on");
    fd.append("meeting_days", "1");
    fd.append("meeting_days", "3");
    fd.set("price_per_ft", "23");
    const input = settingsFormDataToInput(fd);
    expect(input.gst_enabled).toBe(true);
    expect(input.meeting_days).toEqual(["1", "3"]);
    expect(input.price_per_ft).toBe("23");
    expect(input.box_price).toBe("");
  });
});

describe("fractionToPercentString", () => {
  it("prints clean percentages", () => {
    expect(fractionToPercentString(0.05)).toBe("5");
    expect(fractionToPercentString(0.1235)).toBe("12.35");
    expect(fractionToPercentString(0)).toBe("0");
  });
});
