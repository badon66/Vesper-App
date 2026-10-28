import { parsePhoneNumberFromString } from "libphonenumber-js";

// Phone numbers are Canadian by default (Keenan, 2026-10-27). A number typed
// without a country code becomes +1; a number typed with + and a country code
// is kept. Stored as E.164, shown in the local format people are used to.
export const DEFAULT_PHONE_COUNTRY = "CA" as const;

export type PhoneParse =
  | { ok: true; e164: string | null }
  | { ok: false; error: string };

export function normalizePhone(input: string | null | undefined): PhoneParse {
  const text = (input ?? "").trim();
  if (!text) return { ok: true, e164: null };
  const parsed = parsePhoneNumberFromString(text, DEFAULT_PHONE_COUNTRY);
  if (!parsed || !parsed.isValid()) {
    return { ok: false, error: "That phone number doesn't look right. Check the digits." };
  }
  return { ok: true, e164: parsed.number };
}

// (403) 555-0199 for North American numbers, +44 20 7946 0958 otherwise.
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  return parsed.countryCallingCode === "1"
    ? parsed.formatNational()
    : parsed.formatInternational();
}
