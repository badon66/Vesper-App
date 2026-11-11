// Mockups per house (round 10): what the lead page's Mockups section shows
// and the same rules the database keeps, so a tap shows at once. Shared by
// the page (server) and the section (client); nothing here reads or writes.

export type MockupRole = "main" | "day" | "night" | "scene";

export type LeadMockupItem = {
  id: string;
  // Signed for an hour; null when it couldn't be signed.
  url: string | null;
  name: string;
  main: boolean;
  day: boolean;
  night: boolean;
  scene: boolean;
  // quotes.offers ids this picture shows.
  offers: string[];
};

// hidden: an offer Keenan doesn't show the customer (round 13).
export type MockupOffer = { id: string; name: string; hidden?: boolean };

export const MOCKUP_ROLES: readonly { role: MockupRole; label: string; hint: string }[] = [
  { role: "main", label: "Main", hint: "Lights on, the house as they'll see it" },
  { role: "day", label: "Day", hint: "By day, for the slider" },
  { role: "night", label: "Night", hint: "At night, for the slider" },
  { role: "scene", label: "Phone scene", hint: "A button on the phone page, and a look on their link" },
];

export const MOCKUP_NAME_MAX = 40;
export const MOCKUP_OFFERS_MAX = 8;

// One Main, one Day and one Night per house; scenes are many.
export function onePerHouse(role: MockupRole): boolean {
  return role !== "scene";
}

// The list after a role tap: turning Main, Day or Night on takes it off the
// picture that had it.
export function withRole(list: readonly LeadMockupItem[], id: string, role: MockupRole, on: boolean): LeadMockupItem[] {
  return list.map((item) => {
    if (item.id === id) return { ...item, [role]: on };
    if (on && onePerHouse(role) && item[role]) return { ...item, [role]: false };
    return item;
  });
}

// Which offers use a picture (round 13, Keenan, 2026-11-11): an offer's
// picture is set in one place, the photo spot on its card in the quote
// editor; the Mockups section only shows the result. An offer uses the
// first picture picked for it, else the Main (the same rule the deck, the
// link and the photo spot read: lib/quotes/editor.ts offerPhoto).
export function offersUsing(item: LeadMockupItem, all: readonly LeadMockupItem[], offers: readonly MockupOffer[]): MockupOffer[] {
  return offers.filter((offer) => {
    const own = all.find((picture) => picture.offers.includes(offer.id));
    return own ? own.id === item.id : item.main;
  });
}

// "Used by Full wrap and Front lower (hidden)", or that no offer uses it.
export function usedByWords(item: LeadMockupItem, all: readonly LeadMockupItem[], offers: readonly MockupOffer[]): string {
  const names = offersUsing(item, all, offers).map((offer) => (offer.hidden ? `${offer.name} (hidden)` : offer.name));
  if (names.length === 0) return "No offer uses it.";
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `Used by ${list}.`;
}

// What a picture does, in words, for its card: "Main, Phone scene, Front lower".
export function mockupJobs(item: LeadMockupItem, offers: readonly MockupOffer[]): string[] {
  const roles = MOCKUP_ROLES.filter(({ role }) => item[role]).map(({ label }) => label);
  const names = new Map(offers.map((offer) => [offer.id, offer.name]));
  return [...roles, ...item.offers.flatMap((id) => (names.has(id) ? [names.get(id) as string] : []))];
}
