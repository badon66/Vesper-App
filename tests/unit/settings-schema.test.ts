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
  distance_warning_km: "10",
  lost_reasons: "price\nother company\nnot now",
  company_name: "Vesper Lighting, Inc.",
  company_phone: "",
  company_email: "info@vesperlighting.ca",
  company_address: "",
};

describe("parseSettingsForm", () => {
  it("accepts the defaults and converts percentages to fractions", () => {
    const result = parseSettingsForm(valid);
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
      meeting_days: [1, 2, 3, 4, 5, 6],
      meeting_start: "18:00:00",
      meeting_slot_minutes: 45,
      meeting_slot_count: 4,
      distance_warning_km: 10,
      company: { name: "Vesper", phone: "", email: "", address: "" },
      updated_at: "2026-10-26T00:00:00Z",
    });
    expect(defaults.price_per_ft).toBe("23.00");
    expect(defaults.gst_rate_percent).toBe("5");
    expect(defaults.gst_number).toBe("123456789 RT0001");
    expect(defaults.commission_rate_percent).toBe("12.5");
    expect(defaults.meeting_start).toBe("18:00");
    expect(defaults.lost_reasons).toBe("price\nother");
    expect(defaults.company_name).toBe("Vesper");
  });

  it("survives a company value that is not an object", () => {
    const defaults = settingsRowToFormDefaults({
      id: 1, price_per_ft: 1, box_price: 1, neighbour_discount: 0, referral_credit: 0, gst_rate: 0, gst_enabled: false, gst_number: null,
      booking_pay: 0, commission_rate: 0, warranty_text: "w", presentation: [], lost_reasons: [], meeting_days: [1],
      meeting_start: "18:00:00", meeting_slot_minutes: 45, meeting_slot_count: 4, distance_warning_km: 10,
      company: "nonsense", updated_at: "2026-10-26T00:00:00Z",
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
