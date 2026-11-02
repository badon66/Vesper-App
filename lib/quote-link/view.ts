// The customer quote link (2026-11-02), kept pure: what the database's
// quote_for_customer answer means, the prices for whatever runs the
// customer has switched on, the option named in words, the link itself
// and the text Keenan sends. No React and no network, so it is unit tested
// like the pricing it feeds, and the page and the server share it.

import { z } from "zod";
import {
  formatMoney,
  priceQuote,
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

export type CustomerQuote = {
  state: "live";
  firstName: string;
  lastName: string | null;
  address: string;
  city: string | null;
  validUntil: string | null;
  quote: {
    runs: QuoteRun[];
    runsFingerprint: string;
    pricePerFt: number;
    boxPrice: number;
    boxCount: number;
    adders: { label: string; amount: number; upperOnly: boolean }[];
    discounts: { label: string; amount: number }[];
    colourTiming: ColourTiming | null;
    rushFeePerFt: number | null;
    minJobTotal: number | null;
    gstEnabled: boolean;
    gstRate: number;
  };
  warranty: string;
  company: Company;
  mockupPath: string | null;
  // Positions of the runs they had switched on; null = the Recommended package.
  selection: number[] | null;
  bookedAt: string | null;
  bookedOption: string | null;
};

export type ExpiredQuote = { state: "expired"; company: Company };

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
  rush_fee_per_ft: z.coerce.number().nullable().catch(null),
  min_job_total: z.coerce.number().nullable().catch(null),
  gst_enabled: z.boolean().catch(false),
  gst_rate: number,
});

function toQuote(q: z.infer<typeof quoteSchema>): CustomerQuote["quote"] {
  return {
    runs: q.runs,
    runsFingerprint: q.runs_fingerprint,
    pricePerFt: q.price_per_ft,
    boxPrice: q.box_price,
    boxCount: q.box_count,
    adders: q.adders.map((a) => ({ label: a.label, amount: a.amount, upperOnly: a.upper_only === true })),
    discounts: q.discounts,
    colourTiming: q.colour_timing,
    rushFeePerFt: q.rush_fee_per_ft,
    minJobTotal: q.min_job_total,
    gstEnabled: q.gst_enabled,
    gstRate: q.gst_rate,
  };
}

// A quotes row (Keenan's side), read the same way the customer's page reads
// it, so the lead page and the link always show the same total.
export function quoteFromRow(row: unknown): CustomerQuote["quote"] | null {
  const parsed = quoteSchema.safeParse(row);
  return parsed.success ? toQuote(parsed.data) : null;
}

const liveSchema = z.object({
  state: z.literal("live"),
  first_name: z.string(),
  last_name: z.string().nullable().catch(null),
  address: z.string(),
  city: z.string().nullable().catch(null),
  valid_until: z.string().nullable().catch(null),
  quote: quoteSchema,
  warranty: z.string().catch(""),
  company: companySchema,
  mockup_path: z.string().nullable().catch(null),
  selection: z.array(z.number().int()).nullable().catch(null),
  booked_at: z.string().nullable().catch(null),
  booked_option: z.string().nullable().catch(null),
});

// The database's answer, as the page uses it. Anything that isn't a live
// quote, however it arrives, is the expired screen.
export function parseCustomerQuote(data: unknown): CustomerQuote | ExpiredQuote {
  const live = liveSchema.safeParse(data);
  if (!live.success) {
    const company = companySchema.parse(
      data && typeof data === "object" ? (data as { company?: unknown }).company : undefined,
    );
    return { state: "expired", company };
  }
  const v = live.data;
  return {
    state: "live",
    firstName: v.first_name,
    lastName: v.last_name,
    address: v.address,
    city: v.city,
    validUntil: v.valid_until,
    quote: toQuote(v.quote),
    warranty: v.warranty,
    company: v.company,
    mockupPath: v.mockup_path,
    selection: v.selection,
    bookedAt: v.booked_at,
    bookedOption: v.booked_option,
  };
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
    rushFeePerFt: quote.colourTiming === "rush" ? quote.rushFeePerFt : null,
    minJobTotal: quote.minJobTotal,
    gstEnabled: quote.gstEnabled,
    gstRate: quote.gstRate,
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
  const good = validUntil ? `It's good until ${formatLongDay(validUntil)}. ` : "";
  return `${hello}\n${link}\n\n${good}When you're ready, tap Book my install, or call or text me with any questions.\n\nKeenan, Vesper Lighting\n${phone}`;
}

// tel: and sms: want the digits; Canadian numbers get the +1.
export function phoneHref(phone: string, scheme: "tel" | "sms"): string {
  const digits = phone.replace(/\D/g, "");
  const full = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits.startsWith("1") ? `+${digits}` : digits;
  return `${scheme}:${full}`;
}

// The breakdown's money, as the page shows it: "-$150" for discounts.
export const lineAmount = (amount: number) => formatMoney(amount);
