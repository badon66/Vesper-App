// The customer quote link (2026-11-02), kept pure: what the database's
// quote_for_customer answer means, the prices for whatever runs the
// customer has switched on, the option named in words, the link itself
// and the text Keenan sends. No React and no network, so it is unit tested
// like the pricing it feeds, and the page and the server share it.

import { z } from "zod";
import {
  formatMoney,
  priceQuote,
  RUN_PARTS,
  runPart,
  screenTotal,
  selectRuns,
  type ColourTiming,
  type QuoteInputs,
  type QuoteRun,
  type QuoteTotals,
} from "@/lib/pricing";
import { formatLongDay } from "@/lib/time";

// The token's shape, as the database makes it: 24 base64url characters.
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;

export type Company = { name: string; phone: string; email: string; address: string };

// The line icons a product point can have (Settings offers these; anything
// else shows as a tick).
export const POINT_ICONS = [
  "lightbulb",
  "house",
  "zap",
  "smartphone",
  "plug",
  "shield-check",
  "paintbrush",
  "sun",
  "snowflake",
  "wrench",
  "clock",
  "check",
] as const;
export type PointIcon = (typeof POINT_ICONS)[number];
export type ProductPoint = { icon: PointIcon; text: string };

export type CustomerQuote = {
  state: "live";
  firstName: string;
  lastName: string | null;
  address: string;
  city: string | null;
  // The day the quote's prices are held until, and Calgary's date today
  // from the database, so the page never trusts the phone's clock for it.
  validUntil: string | null;
  today: string | null;
  quote: {
    runs: QuoteRun[];
    runsFingerprint: string;
    pricePerFt: number;
    boxPrice: number;
    boxCount: number;
    adders: { label: string; amount: number; upperOnly: boolean }[];
    discounts: { label: string; amount: number }[];
    colourTiming: ColourTiming | null;
    // The quote's flat rush colour fee and upper access amounts
    // (2026-11-04); null on a quote made before then, so no line.
    rushFee: number | null;
    upperAccessFee: number | null;
    upperGableAccessFee: number | null;
    minJobTotal: number | null;
    gstEnabled: boolean;
    gstRate: number;
    // The track colour the quote was made with, by name; null until set.
    trackColourName: string | null;
    trackCustom: boolean;
  };
  warranty: string;
  // Warranty years 6 to 10 (Settings); null hides its line.
  serviceCallFee: number | null;
  // Shown only while Keenan has it on, September 1 to November 30 (the
  // database decides, by Calgary's date).
  christmas: { title: string; text: string } | null;
  productPoints: ProductPoint[];
  installDay: { title: string; body: string } | null;
  // The presentation gallery's photo paths: Vesper's own installs.
  gallery: string[];
  company: Company;
  mockupPath: string | null;
  // Positions of the runs they had switched on; null = the Recommended package.
  selection: number[] | null;
  bookedAt: string | null;
  bookedOption: string | null;
};

// A link Keenan turned off, or one that never existed. Links don't expire
// (2026-11-04): prices are held until a date, and the page still works after.
export type ClosedQuote = { state: "closed"; company: Company };

// Vesper's contact when Settings has none (only for a blank field).
export const FALLBACK_COMPANY: Company = {
  name: "Vesper Lighting",
  phone: "(403) 895-9915",
  email: "info@vesperlighting.ca",
  address: "448 Strathcona Drive SW, Calgary, AB T3H 1M3",
};

const text = z.string().nullable().optional().catch(null);
const number = z.coerce.number().catch(0);

const companySchema = z
  .object({ name: text, phone: text, email: text, address: text })
  .catch({ name: null, phone: null, email: null, address: null })
  .transform(
    (c): Company => ({
      name: c.name?.trim() || FALLBACK_COMPANY.name,
      phone: c.phone?.trim() || FALLBACK_COMPANY.phone,
      email: c.email?.trim() || FALLBACK_COMPANY.email,
      address: c.address?.trim() || FALLBACK_COMPANY.address,
    }),
  );

const runSchema = z.object({
  name: z.string().catch(""),
  feet: number,
  level: z.enum(["lower", "upper"]).catch("lower"),
  // The part of the house (2026-11-04); a run saved before then has none,
  // and its name gives the guess.
  part: z.enum(RUN_PARTS).nullable().optional().catch(null),
});

const quoteSchema = z.object({
  runs: z.array(runSchema).catch([]),
  runs_fingerprint: z.string().catch(""),
  price_per_ft: number,
  box_price: number,
  box_count: number,
  adders: z
    .array(z.object({ label: z.string().catch(""), amount: number, upper_only: z.boolean().optional().catch(false) }))
    .catch([]),
  discounts: z.array(z.object({ label: z.string().catch(""), amount: number })).catch([]),
  colour_timing: z.enum(["stock", "factory_order", "rush"]).nullable().catch(null),
  rush_fee: z.coerce.number().nullable().optional().catch(null),
  upper_access_fee: z.coerce.number().nullable().optional().catch(null),
  upper_gable_access_fee: z.coerce.number().nullable().optional().catch(null),
  min_job_total: z.coerce.number().nullable().catch(null),
  gst_enabled: z.boolean().catch(false),
  gst_rate: number,
  track_colour_name: z.string().nullable().optional().catch(null),
  track_custom: z.boolean().optional().catch(false),
});

function toQuote(q: z.infer<typeof quoteSchema>): CustomerQuote["quote"] {
  return {
    runs: q.runs.map((run) => ({ name: run.name, feet: run.feet, level: run.level, part: runPart(run) })),
    runsFingerprint: q.runs_fingerprint,
    pricePerFt: q.price_per_ft,
    boxPrice: q.box_price,
    boxCount: q.box_count,
    adders: q.adders.map((a) => ({ label: a.label, amount: a.amount, upperOnly: a.upper_only === true })),
    discounts: q.discounts,
    colourTiming: q.colour_timing,
    rushFee: q.rush_fee ?? null,
    upperAccessFee: q.upper_access_fee ?? null,
    upperGableAccessFee: q.upper_gable_access_fee ?? null,
    minJobTotal: q.min_job_total,
    gstEnabled: q.gst_enabled,
    gstRate: q.gst_rate,
    trackColourName: q.track_colour_name?.trim() || null,
    trackCustom: q.track_custom === true,
  };
}

// A quotes row (Keenan's side), read the same way the customer's page reads
// it, so the lead page and the link always show the same total.
export function quoteFromRow(row: unknown): CustomerQuote["quote"] | null {
  const parsed = quoteSchema.safeParse(row);
  return parsed.success ? toQuote(parsed.data) : null;
}

const pointSchema = z.object({
  icon: z.enum(POINT_ICONS).catch("check"),
  text: z.string().catch(""),
});

const liveSchema = z.object({
  state: z.literal("live"),
  first_name: z.string(),
  last_name: z.string().nullable().catch(null),
  address: z.string(),
  city: z.string().nullable().catch(null),
  valid_until: z.string().nullable().catch(null),
  today: z.string().nullable().optional().catch(null),
  quote: quoteSchema,
  warranty: z.string().catch(""),
  service_call_fee: z.coerce.number().nullable().optional().catch(null),
  christmas: z
    .object({ title: z.string().catch(""), text: z.string().catch("") })
    .nullable()
    .optional()
    .catch(null),
  product_points: z.array(pointSchema.catch({ icon: "check", text: "" })).catch([]),
  install_day: z
    .object({ title: z.string().nullable().catch(""), body: z.string().nullable().catch("") })
    .nullable()
    .optional()
    .catch(null),
  gallery: z.array(z.string()).catch([]),
  company: companySchema,
  mockup_path: z.string().nullable().catch(null),
  selection: z.array(z.number().int()).nullable().catch(null),
  booked_at: z.string().nullable().catch(null),
  booked_option: z.string().nullable().catch(null),
});

// The database's answer, as the page uses it. Anything that isn't a live
// quote, however it arrives, is the closed screen.
export function parseCustomerQuote(data: unknown): CustomerQuote | ClosedQuote {
  const live = liveSchema.safeParse(data);
  if (!live.success) {
    const company = companySchema.parse(
      data && typeof data === "object" ? (data as { company?: unknown }).company : undefined,
    );
    return { state: "closed", company };
  }
  const v = live.data;
  const fee = v.service_call_fee ?? null;
  const christmas = v.christmas && v.christmas.title.trim() ? { title: v.christmas.title.trim(), text: v.christmas.text.trim() } : null;
  const installTitle = v.install_day?.title?.trim() ?? "";
  const installBody = v.install_day?.body?.trim() ?? "";
  return {
    state: "live",
    firstName: v.first_name,
    lastName: v.last_name,
    address: v.address,
    city: v.city,
    validUntil: v.valid_until,
    today: v.today ?? null,
    quote: toQuote(v.quote),
    warranty: v.warranty,
    serviceCallFee: fee !== null && Number.isFinite(fee) && fee > 0 ? fee : null,
    christmas,
    productPoints: v.product_points
      .map((point) => ({ icon: point.icon, text: point.text.trim() }))
      .filter((point) => point.text !== ""),
    installDay: installBody ? { title: installTitle || "How install day works", body: installBody } : null,
    gallery: v.gallery.filter((path) => path.trim() !== ""),
    company: v.company,
    mockupPath: v.mockup_path,
    selection: v.selection,
    bookedAt: v.booked_at,
    bookedOption: v.booked_option,
  };
}

// Whether the price hold has passed: after the valid-until date (Calgary),
// the page still works and says prices may have changed. Today comes from
// the database; without it, the hold counts as not passed.
export function priceHoldPassed(validUntil: string | null, today: string | null): boolean {
  return validUntil !== null && today !== null && validUntil < today;
}

// Positions that are on this quote, sorted, without repeats; null when
// they cover every run (the Recommended package) or nothing usable is left.
export function cleanSelection(runCount: number, positions: readonly number[] | null): number[] | null {
  if (positions === null) return null;
  const kept = Array.from(new Set(positions.filter((p) => Number.isInteger(p) && p >= 0 && p < runCount))).sort(
    (a, b) => a - b,
  );
  return kept.length === 0 || kept.length === runCount ? null : kept;
}

// The pricing inputs for the runs they have on: the quote's own prices,
// never Settings, so the link always matches what was quoted.
export function customerInputs(quote: CustomerQuote["quote"], positions: readonly number[] | null): QuoteInputs {
  return {
    runs: selectRuns(quote.runs, cleanSelection(quote.runs.length, positions)),
    boxCount: quote.boxCount,
    pricePerFt: quote.pricePerFt,
    boxPrice: quote.boxPrice,
    adders: quote.adders.map((a) => ({ label: a.label, amount: a.amount, ...(a.upperOnly ? { upperOnly: true } : {}) })),
    discounts: quote.discounts,
    colourTiming: quote.colourTiming,
    rushFee: quote.colourTiming === "rush" ? quote.rushFee : null,
    upperAccessFee: quote.upperAccessFee,
    upperGableAccessFee: quote.upperGableAccessFee,
    minJobTotal: quote.minJobTotal,
    gstEnabled: quote.gstEnabled,
    gstRate: quote.gstRate,
    colourName: quote.trackColourName,
  };
}

export function priceSelection(quote: CustomerQuote["quote"], positions: readonly number[] | null): QuoteTotals {
  return priceQuote(customerInputs(quote, positions));
}

// The total as a customer reads it: "$3,450 + GST" while GST is on.
export function customerTotal(quote: CustomerQuote["quote"], positions: readonly number[] | null): string {
  return screenTotal(priceSelection(quote, positions).subtotal, quote.gstEnabled);
}

// A run's name, never blank.
export function runName(run: QuoteRun, position: number): string {
  return run.name.trim() || `Run ${position + 1}`;
}

// The option in words, the same way the database names it on Book my
// install: never a price.
export function optionName(runs: QuoteRun[], positions: readonly number[] | null): string {
  const kept = cleanSelection(runs.length, positions);
  if (kept === null) return "Recommended package";
  return `Start smaller: ${kept.map((p) => runName(runs[p], p)).join(", ")}`;
}

// The option the way people say it: "Recommended package", "Garage only",
// "Front and Garage", "Front, Front upper and Garage". The database keeps
// the plain form ("Start smaller: Front, Garage"); this is for reading.
export function choiceLabel(option: string): string {
  if (option === "Recommended package") return option;
  const names = option
    .replace(/^Start smaller:\s*/, "")
    .split(/,\s*/)
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length === 0) return option;
  if (names.length === 1) return `${names[0]} only`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// The same inside a sentence: "the Recommended package", or the parts.
export function choiceInSentence(option: string): string {
  return option === "Recommended package" ? "the Recommended package" : choiceLabel(option);
}

// The customer's own words for it (2026-11-04): the page calls everything
// they were quoted "the full quote"; "Recommended package" stays the name
// the database and Keenan's card use.
export function customerChoice(option: string): string {
  return option === "Recommended package" ? "The full quote" : choiceLabel(option);
}

export function customerChoiceInSentence(option: string): string {
  return option === "Recommended package" ? "the full quote" : choiceLabel(option);
}

// "64 ft, upper level"
export function runDetail(run: QuoteRun): string {
  return `${Math.max(0, Math.round(run.feet))} ft, ${run.level === "upper" ? "upper" : "lower"} level`;
}

// The link, from the base address (QUOTE_BASE_URL or the app's own).
export function quoteLinkUrl(base: string, token: string): string {
  return `${base.replace(/\/+$/, "")}/q/${token}`;
}

// The text Keenan can edit and send from his own phone. Plain, no dashes,
// no promises beyond what the quote says.
export function quoteLinkMessage({
  firstName,
  link,
  validUntil,
  phone,
}: {
  firstName: string;
  link: string;
  validUntil: string | null;
  phone: string;
}): string {
  const hello = firstName.trim() ? `Hi ${firstName.trim()}, here's your Vesper quote:` : "Here's your Vesper quote:";
  const held = validUntil ? `Your price is held until ${formatLongDay(validUntil)}. ` : "";
  return `${hello}\n${link}\n\n${held}When you're ready, tap Book my install, or call or text me with any questions.\n\nKeenan, Vesper Lighting\n${phone}`;
}

// tel: and sms: want the digits; Canadian numbers get the +1.
export function phoneHref(phone: string, scheme: "tel" | "sms"): string {
  const digits = phone.replace(/\D/g, "");
  const full = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : digits;
  return `${scheme}:${full}`;
}

// A text to Vesper that starts with a line they can keep or delete
// (2026-11-04): Keenan can place it whoever sends it. "?&body=" opens with
// the words on both iPhone and Android.
export function smsWithBody(phone: string, body: string): string {
  return `${phoneHref(phone, "sms")}?&body=${encodeURIComponent(body)}`;
}

// The breakdown's money, as the page shows it: a true minus for discounts.
export const lineAmount = (amount: number) => (amount < 0 ? `\u2212${formatMoney(-amount)}` : formatMoney(amount));
