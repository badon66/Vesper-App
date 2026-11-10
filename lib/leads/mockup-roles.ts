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

export type MockupOffer = { id: string; name: string };

export const MOCKUP_ROLES: readonly { role: MockupRole; label: string; hint: string }[] = [
  { role: "main", label: "Main", hint: "Lights on, the house as they'll see it" },
  { role: "day", label: "Day", hint: "By day, for the slider" },
  { role: "night", label: "Night", hint: "At night, for the slider" },
  { role: "scene", label: "Phone scene", hint: "A button on the phone page" },
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

// The list after an offer tap.
export function withOffer(list: readonly LeadMockupItem[], id: string, offerId: string, on: boolean): LeadMockupItem[] {
  return list.map((item) => {
    if (item.id !== id) return item;
    const without = item.offers.filter((offer) => offer !== offerId);
    return { ...item, offers: on ? [...without, offerId] : without };
  });
}

// What a picture does, in words, for its card: "Main, Phone scene, Front lower".
export function mockupJobs(item: LeadMockupItem, offers: readonly MockupOffer[]): string[] {
  const roles = MOCKUP_ROLES.filter(({ role }) => item[role]).map(({ label }) => label);
  const names = new Map(offers.map((offer) => [offer.id, offer.name]));
  return [...roles, ...item.offers.flatMap((id) => (names.has(id) ? [names.get(id) as string] : []))];
}
