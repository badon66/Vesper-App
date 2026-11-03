import { z } from "zod";
import type { Database } from "@/types/database";

// Settings form: validation, conversion between what the inputs hold and
// what the database stores, and the defaults shown when the form opens.
// Percentages are typed as percentages and stored as fractions. Money is
// rounded to the cent.

export type SettingsRow = Database["public"]["Tables"]["settings"]["Row"];
export type SettingsUpdate = Database["public"]["Tables"]["settings"]["Update"];

export const DAY_OPTIONS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const money = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ error: "must be a number" })
    .min(0, { error: "cannot be negative" })
    .max(99_999_999, { error: "is too large" })
    .transform((n) => Math.round(n * 100) / 100),
);

const percent = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ error: "must be a number" })
    .min(0, { error: "cannot be negative" })
    .max(99.99, { error: "must be under 100" })
    .transform((p) => Math.round(p * 100) / 10_000),
);

// A money field that may be left empty on purpose: empty means not set
// (null), and the app hides that line instead of showing a blank (M5).
const moneyOrUnset = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.union([
    z.null(),
    z.coerce
      .number({ error: "must be a number" })
      .min(0, { error: "cannot be negative" })
      .max(99_999_999, { error: "is too large" })
      .transform((n) => Math.round(n * 100) / 100),
  ]),
);

const wholeNumber = (min: number, max: number) =>
  z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: "must be a number" })
      .int({ error: "must be a whole number" })
      .min(min, { error: `must be at least ${min}` })
      .max(max, { error: `must be at most ${max}` }),
  );

const timeHHMM = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "must be a time like 18:00" });

const lines = z
  .string()
  .transform((text) =>
    Array.from(
      new Set(
        text
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ),
  );

export const settingsFormSchema = z.object({
  price_per_ft: money,
  box_price: money,
  neighbour_discount: money,
  referral_credit: money,
  gst_enabled: z.boolean(),
  gst_rate_percent: percent,
  gst_number: z.string().trim().max(30, { error: "is too long" }),
  booking_pay: money,
  commission_rate_percent: percent,
  warranty_text: z.string().trim().min(1, { error: "cannot be empty" }),
  meeting_days: z
    .array(z.coerce.number().int().min(0).max(6))
    .min(1, { error: "pick at least one day" })
    .transform((days) => Array.from(new Set(days)).sort((a, b) => a - b)),
  meeting_start: timeHHMM,
  meeting_slot_minutes: wholeNumber(15, 180),
  meeting_slot_count: wholeNumber(1, 12),
  booking_cutoff_minutes: wholeNumber(0, 240),
  hold_grace_minutes: wholeNumber(1, 30),
  booking_window_days: wholeNumber(1, 60),
  distance_warning_km: z.preprocess(
    blankToUndefined,
    z.coerce
      .number({ error: "must be a number" })
      .min(0, { error: "cannot be negative" })
      .max(9999, { error: "is too large" })
      .transform((n) => Math.round(n * 10) / 10),
  ),
  lost_reasons: lines.pipe(
    z.array(z.string()).min(1, { error: "add at least one reason" }),
  ),
  not_qualified_reasons: lines.pipe(
    z.array(z.string().max(200, { error: "keep each reason under 200 characters" })).min(1, { error: "add at least one reason" }),
  ),
  // The booking sheet's step notes (M3.5); the old door_guide column stays,
  // unused, and is no longer edited here.
  step_note_at_door: z
    .string()
    .transform((text) => text.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1, { error: "cannot be empty" })
        .max(2000, { error: "must be under 2,000 characters" }),
    ),
  step_note_after_door: z
    .string()
    .transform((text) => text.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1, { error: "cannot be empty" })
        .max(2000, { error: "must be under 2,000 characters" }),
    ),
  step_note_book: z
    .string()
    .transform((text) => text.replace(/\r\n?/g, "\n").trim())
    .pipe(
      z
        .string()
        .min(1, { error: "cannot be empty" })
        .max(2000, { error: "must be under 2,000 characters" }),
    ),
  // Meeting mode (M5).
  rush_colour_fee_per_ft: moneyOrUnset,
  service_call_fee: moneyOrUnset,
  quote_valid_days: wholeNumber(1, 90),
  // The quote link (2026-11-02): the least a job can cost before GST.
  min_job_total: moneyOrUnset,
  faq_text: z
    .string()
    .transform((text) => text.replace(/\r\n?/g, "\n").trim())
    .pipe(z.string().max(8000, { error: "must be under 8,000 characters" })),
  presentation_pages: z
    .array(
      z.object({
        kind: z.enum(["what_vesper_is", "hidden_by_day", "whites_first", "install_day", "warranty", "gallery"]),
        title: z.string().trim().min(1, { error: "cannot be empty" }).max(80, { error: "is too long" }),
        body: z
          .string()
          .transform((text) => text.replace(/\r\n?/g, "\n").trim())
          .pipe(z.string().max(2000, { error: "must be under 2,000 characters" })),
      }),
    )
    .max(6),
  company_name: z.string().trim().min(1, { error: "cannot be empty" }),
  company_phone: z.string().trim().max(40, { error: "is too long" }),
  company_email: z.union([
    z.literal(""),
    z.email({ error: "must be an email address" }),
  ]),
  company_address: z.string().trim().max(200, { error: "is too long" }),
});

export type SettingsFormInput = z.input<typeof settingsFormSchema>;
export type SettingsFormValues = z.output<typeof settingsFormSchema>;
export type SettingsFormField = keyof SettingsFormInput;
export type SettingsFormErrors = Partial<Record<SettingsFormField, string>>;

export function parseSettingsForm(
  input: Record<string, unknown>,
):
  | { ok: true; values: SettingsFormValues }
  | { ok: false; errors: SettingsFormErrors } {
  const result = settingsFormSchema.safeParse(input);
  if (result.success) return { ok: true, values: result.data };
  const errors: SettingsFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as SettingsFormField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}

// FormData from the Settings form, as the schema expects it.
export function settingsFormDataToInput(
  formData: FormData,
): Record<string, unknown> {
  const text = (name: string) => String(formData.get(name) ?? "");
  return {
    price_per_ft: text("price_per_ft"),
    box_price: text("box_price"),
    neighbour_discount: text("neighbour_discount"),
    referral_credit: text("referral_credit"),
    gst_enabled: formData.get("gst_enabled") === "on",
    gst_rate_percent: text("gst_rate_percent"),
    gst_number: text("gst_number"),
    booking_pay: text("booking_pay"),
    commission_rate_percent: text("commission_rate_percent"),
    warranty_text: text("warranty_text"),
    meeting_days: formData.getAll("meeting_days").map(String),
    meeting_start: text("meeting_start"),
    meeting_slot_minutes: text("meeting_slot_minutes"),
    meeting_slot_count: text("meeting_slot_count"),
    booking_cutoff_minutes: text("booking_cutoff_minutes"),
    hold_grace_minutes: text("hold_grace_minutes"),
    booking_window_days: text("booking_window_days"),
    distance_warning_km: text("distance_warning_km"),
    lost_reasons: text("lost_reasons"),
    not_qualified_reasons: text("not_qualified_reasons"),
    step_note_at_door: text("step_note_at_door"),
    step_note_after_door: text("step_note_after_door"),
    step_note_book: text("step_note_book"),
    company_name: text("company_name"),
    company_phone: text("company_phone"),
    company_email: text("company_email"),
    company_address: text("company_address"),
    rush_colour_fee_per_ft: text("rush_colour_fee_per_ft"),
    service_call_fee: text("service_call_fee"),
    quote_valid_days: text("quote_valid_days"),
    min_job_total: text("min_job_total"),
    faq_text: text("faq_text"),
    presentation_pages: formData.getAll("presentation_kind").map((kind) => ({
      kind: String(kind),
      title: text(`presentation_title_${String(kind)}`),
      body: text(`presentation_body_${String(kind)}`),
    })),
  };
}

// Validated form values, as the columns to write.
export function settingsUpdateFromValues(v: SettingsFormValues): SettingsUpdate {
  return {
    price_per_ft: v.price_per_ft,
    box_price: v.box_price,
    neighbour_discount: v.neighbour_discount,
    referral_credit: v.referral_credit,
    gst_enabled: v.gst_enabled,
    gst_rate: v.gst_rate_percent,
    gst_number: v.gst_number || null,
    booking_pay: v.booking_pay,
    commission_rate: v.commission_rate_percent,
    warranty_text: v.warranty_text,
    meeting_days: v.meeting_days,
    meeting_start: v.meeting_start,
    meeting_slot_minutes: v.meeting_slot_minutes,
    meeting_slot_count: v.meeting_slot_count,
    booking_cutoff_minutes: v.booking_cutoff_minutes,
    hold_grace_minutes: v.hold_grace_minutes,
    booking_window_days: v.booking_window_days,
    distance_warning_km: v.distance_warning_km,
    lost_reasons: v.lost_reasons,
    not_qualified_reasons: v.not_qualified_reasons,
    step_note_at_door: v.step_note_at_door,
    step_note_after_door: v.step_note_after_door,
    step_note_book: v.step_note_book,
    company: {
      name: v.company_name,
      phone: v.company_phone,
      email: v.company_email,
      address: v.company_address,
    },
    rush_colour_fee_per_ft: v.rush_colour_fee_per_ft,
    service_call_fee: v.service_call_fee,
    quote_valid_days: v.quote_valid_days,
    min_job_total: v.min_job_total,
    faq_text: v.faq_text,
    // presentation titles and bodies merge over the stored image paths in
    // the action, which is the one place that reads the current jsonb.
  };
}

export function fractionToPercentString(fraction: number): string {
  return String(Math.round(fraction * 10_000) / 100);
}

export type SettingsFormDefaults = {
  price_per_ft: string;
  box_price: string;
  neighbour_discount: string;
  referral_credit: string;
  gst_enabled: boolean;
  gst_rate_percent: string;
  gst_number: string;
  booking_pay: string;
  commission_rate_percent: string;
  warranty_text: string;
  meeting_days: number[];
  meeting_start: string;
  meeting_slot_minutes: string;
  meeting_slot_count: string;
  booking_cutoff_minutes: string;
  hold_grace_minutes: string;
  booking_window_days: string;
  distance_warning_km: string;
  lost_reasons: string;
  not_qualified_reasons: string;
  step_note_at_door: string;
  step_note_after_door: string;
  step_note_book: string;
  company_name: string;
  company_phone: string;
  company_email: string;
  company_address: string;
  rush_colour_fee_per_ft: string;
  service_call_fee: string;
  quote_valid_days: string;
  min_job_total: string;
  faq_text: string;
};

// The stored row, as the strings the inputs start with.
export function settingsRowToFormDefaults(row: SettingsRow): SettingsFormDefaults {
  const company =
    row.company && typeof row.company === "object" && !Array.isArray(row.company)
      ? (row.company as Record<string, unknown>)
      : {};
  const companyField = (key: string) =>
    typeof company[key] === "string" ? (company[key] as string) : "";
  return {
    price_per_ft: row.price_per_ft.toFixed(2),
    box_price: row.box_price.toFixed(2),
    neighbour_discount: row.neighbour_discount.toFixed(2),
    referral_credit: row.referral_credit.toFixed(2),
    gst_enabled: row.gst_enabled,
    gst_rate_percent: fractionToPercentString(row.gst_rate),
    gst_number: row.gst_number ?? "",
    booking_pay: row.booking_pay.toFixed(2),
    commission_rate_percent: fractionToPercentString(row.commission_rate),
    warranty_text: row.warranty_text,
    meeting_days: row.meeting_days,
    meeting_start: row.meeting_start.slice(0, 5),
    meeting_slot_minutes: String(row.meeting_slot_minutes),
    meeting_slot_count: String(row.meeting_slot_count),
    booking_cutoff_minutes: String(row.booking_cutoff_minutes),
    hold_grace_minutes: String(row.hold_grace_minutes),
    booking_window_days: String(row.booking_window_days),
    distance_warning_km: String(row.distance_warning_km),
    lost_reasons: row.lost_reasons.join("\n"),
    not_qualified_reasons: row.not_qualified_reasons.join("\n"),
    step_note_at_door: row.step_note_at_door,
    step_note_after_door: row.step_note_after_door,
    step_note_book: row.step_note_book,
    company_name: companyField("name"),
    company_phone: companyField("phone"),
    company_email: companyField("email"),
    company_address: companyField("address"),
    rush_colour_fee_per_ft: row.rush_colour_fee_per_ft === null ? "" : row.rush_colour_fee_per_ft.toFixed(2),
    service_call_fee: row.service_call_fee === null ? "" : row.service_call_fee.toFixed(2),
    quote_valid_days: String(row.quote_valid_days),
    min_job_total: row.min_job_total === null ? "" : row.min_job_total.toFixed(2),
    faq_text: row.faq_text,
  };
}
