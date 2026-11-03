// What a setter's notice says (Keenan, 2026-11-03), kept pure so it is unit
// tested. Notices show on a lock screen, so they name the street only,
// never a house number, a customer's name, a phone number, a note typed by
// hand or another setter's details. The reason for Not qualified comes from
// the fixed list in Settings; anything written out by hand stays in the app.

import type { PushNotice } from "@/lib/push/send-types";
import { formatMoney } from "@/lib/pricing";
import { sentence } from "@/lib/schedule/meetings";

// "123 Aspen Crescent SW" -> "Aspen Crescent SW". Unit numbers, house
// numbers and anything after a comma go; a numbered street ("1234 17 Avenue
// SW") keeps its number. Empty when nothing is left that isn't a number.
const UNIT_ONLY = /^(unit|suite|ste|apt|apartment|#)\s*[\w-]+$/i;
const NUMBERED_ROAD = /^\d+\s+(avenue|ave|street|st)(\s+(nw|ne|sw|se))?$/i;

export function streetOf(address: string): string {
  let parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  // "Unit 5, 123 Main Street": the unit is its own part.
  if (parts.length > 1 && UNIT_ONLY.test(parts[0])) parts = parts.slice(1);
  let street = parts[0] ?? "";
  // A numbered road with no house number ("17 Avenue SW") is all street.
  if (NUMBERED_ROAD.test(street)) return street;
  // "Unit 5 123 Main Street", "#5 123 Main Street": the unit in front.
  street = street.replace(/^(unit|suite|ste|apt|apartment|#)\s*[\w-]+\s*[-,]?\s*/i, "");
  // "123 Main Street SW #5", "123 Main Street Unit 5": the unit behind.
  street = street.replace(/\s+(#\s*|unit\s+|suite\s+|ste\s+|apt\s+|apartment\s+)[\w-]+$/i, "");
  // "5-123 Main Street": the unit before the house number.
  street = street.replace(/^\d+[a-z]?\s*-\s*(?=\d)/i, "");
  // The house number itself, with any letter: "123", "123A", "123 A".
  street = street.replace(/^\d+(\s?[a-z](?=\s))?\s+/i, "");
  street = street.trim();
  return /[a-z]/i.test(street) ? street : "";
}

const on = (street: string) => (street ? ` on ${street}` : "");

export type OutcomeChange =
  | { kind: "qualified"; feeAdded: number | null }
  | { kind: "not_qualified"; reason: string | null; listed: boolean }
  | { kind: "no_show" }
  | { kind: "cancelled_outcome" };

// Keenan marked the booking after its time.
export function outcomeNotice(address: string, change: OutcomeChange, url: string): PushNotice {
  const street = streetOf(address);
  const tag = `booking-${url}`;
  switch (change.kind) {
    case "qualified":
      return {
        title: "Booking qualified",
        body: `Your booking${on(street)} was qualified.${change.feeAdded ? ` ${formatMoney(change.feeAdded)} added to My pay.` : ""}`,
        url,
        tag,
      };
    case "not_qualified":
      return {
        title: "Booking not qualified",
        body:
          change.reason && change.listed
            ? `Your booking${on(street)} wasn't qualified: ${change.reason.replace(/\.$/, "")}.`
            : `Your booking${on(street)} wasn't qualified. The reason is on the lead.`,
        url,
        tag,
      };
    case "no_show":
      return {
        title: "Booking was a no-show",
        body: `Nobody was home for your booking${on(street)}. The lead can be booked again.`,
        url,
        tag,
      };
    case "cancelled_outcome":
      return {
        title: "Booking cancelled",
        body: `Your booking${on(street)} was marked cancelled. The lead can be booked again.`,
        url,
        tag,
      };
  }
}

// Keenan moved the booking to another time, given as "Tue, Nov 4 at
// 6:45 p.m." (the sentence ends once).
export function movedNotice(address: string, when: string, url: string): PushNotice {
  return {
    title: "Booking moved",
    body: sentence(`Keenan moved your booking${on(streetOf(address))} to ${when}`),
    url,
    tag: `booking-${url}`,
  };
}

// Keenan cancelled it before its time: the lead goes to Follow up.
export function cancelledNotice(address: string, url: string): PushNotice {
  return {
    title: "Booking cancelled",
    body: `Keenan cancelled your booking${on(streetOf(address))}. The lead is back in Follow up for tomorrow.`,
    url,
    tag: `booking-${url}`,
  };
}
