// The agreement signed on the customer's quote link (quote link take 3,
// Keenan, 2026-11-11), kept pure: what a signing record says, worked into
// what the signed PDF shows. The record is saved by the database at the
// moment of signing (agreement_signatures): their typed name, their finger
// signature, the time, the agreement's text from Settings and a copy of the
// quote as it stood. Every number on the PDF is worked out here from that
// copy with lib/pricing.ts, never taken from anything the customer's phone
// sent, so the signed copy always matches what the quote said.

import { z } from "zod";
import { formatMoney, type QuoteLine } from "@/lib/pricing";
import { offerChoice, quoteFromRow, type Company, FALLBACK_COMPANY } from "@/lib/quote-link/view";
import { customerChoice } from "@/lib/quote-link/view";
import { calgaryDateOf, formatFullDate, formatTime } from "@/lib/time";

const recordSchema = z.object({
  signer_name: z.string(),
  signed_at: z.string(),
  offer_id: z.string().catch(""),
  offer_name: z.string().catch(""),
  signature_png: z.string().catch(""),
  agreement_text: z.string().catch(""),
  quote: z.record(z.string(), z.unknown()).catch({}),
  lead: z
    .object({
      first_name: z.string().nullable().optional().catch(null),
      last_name: z.string().nullable().optional().catch(null),
      address: z.string().nullable().optional().catch(null),
      city: z.string().nullable().optional().catch(null),
    })
    .catch({}),
});

// A signing record as the database hands it (quote_link_signed_copy, or an
// agreement_signatures row read by Keenan with its snapshots renamed).
export type SignedRecordInput = z.input<typeof recordSchema>;

export type SignedAgreement = {
  signerName: string;
  // "November 11, 2026" (always with the year: it is a signed document) and
  // "9:41 p.m.", in Calgary time.
  signedDay: string;
  signedTime: string;
  customerName: string;
  address: string;
  // The option they chose and its lines, priced from the saved quote.
  option: string;
  // Round 18: a track's line lists every area on it, indented under it.
  lines: { label: string; detail: string | null; amount: string; areas?: { label: string; detail: string | null; amount: string }[] }[];
  // Before GST, the GST in dollars and the total, as a formal document
  // shows them (CLAUDE.md); with GST off only the total, and no mention of
  // GST at all.
  subtotal: string;
  gst: string | null;
  total: string;
  gstNumber: string | null;
  trackColour: string | null;
  priceHeldUntil: string | null;
  agreementText: string;
  signaturePng: string | null;
  company: Company;
};

const lineAmount = (line: QuoteLine) => (line.amount < 0 ? `−${formatMoney(-line.amount)}` : formatMoney(line.amount));

const companySchema = z
  .object({
    name: z.string().nullable().optional().catch(null),
    phone: z.string().nullable().optional().catch(null),
    email: z.string().nullable().optional().catch(null),
    address: z.string().nullable().optional().catch(null),
  })
  .catch({});

// The record, ready for the PDF. Null when it can't be read or its option
// isn't on the saved quote, so nothing half-made is ever handed out.
export function signedAgreement(input: unknown): SignedAgreement | null {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return null;
  const r = parsed.data;
  const quote = quoteFromRow(r.quote);
  if (!quote) return null;
  const choice = offerChoice(quote, r.offer_id);
  if (!choice) return null;
  const totals = choice.totals;
  const gstOn = quote.gstEnabled;
  const c = companySchema.parse((r.quote as { company?: unknown }).company);
  const gstNumber = typeof (r.quote as { gst_number?: unknown }).gst_number === "string" ? ((r.quote as { gst_number: string }).gst_number.trim() || null) : null;
  const validUntil = typeof (r.quote as { valid_until?: unknown }).valid_until === "string" ? (r.quote as { valid_until: string }).valid_until : null;
  const name = [r.lead.first_name, r.lead.last_name].map((part) => (part ?? "").trim()).filter(Boolean).join(" ");
  const address = [r.lead.address, r.lead.city].map((part) => (part ?? "").trim()).filter(Boolean).join(", ");
  return {
    signerName: r.signer_name.trim(),
    signedDay: formatFullDate(calgaryDateOf(r.signed_at)),
    signedTime: formatTime(r.signed_at),
    customerName: name,
    address,
    option: customerChoice(choice.name),
    lines: totals.lines.map((line) => ({
      label: line.label,
      detail: line.detail,
      amount: lineAmount(line),
      ...(line.areas ? { areas: line.areas.map((area) => ({ label: area.label, detail: area.detail, amount: lineAmount(area) })) } : {}),
    })),
    subtotal: formatMoney(totals.subtotal),
    gst: gstOn ? formatMoney(totals.gst) : null,
    total: formatMoney(gstOn ? totals.total : totals.subtotal),
    gstNumber: gstOn ? gstNumber : null,
    trackColour: quote.trackColourName,
    priceHeldUntil: validUntil && /^\d{4}-\d{2}-\d{2}$/.test(validUntil) ? formatFullDate(validUntil) : null,
    agreementText: r.agreement_text.trim(),
    signaturePng: r.signature_png.startsWith("data:image/png;base64,") ? r.signature_png : null,
    company: {
      name: c.name?.trim() || FALLBACK_COMPANY.name,
      phone: c.phone?.trim() || FALLBACK_COMPANY.phone,
      email: c.email?.trim() || FALLBACK_COMPANY.email,
      address: c.address?.trim() || FALLBACK_COMPANY.address,
    },
  };
}

// The file a signed copy is saved under.
export function signedFileName(agreement: Pick<SignedAgreement, "customerName">, day: string): string {
  const who = agreement.customerName.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Customer";
  return `Vesper agreement, ${who}, ${day}.pdf`;
}
