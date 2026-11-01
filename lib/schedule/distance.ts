// Straight-line distances between meetings (Keenan, 2026-11-01: straight
// line plus a Navigate link; no driving times). Booking warns, and never
// blocks, when the address is further than the setting from the meeting
// before or after it that evening.

export type Point = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

export function kmBetween(a: Point, b: Point): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatKm(km: number): string {
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export type EveningMeeting = {
  startsAt: string;
  lat: number | null;
  lng: number | null;
  neighbourhood: string | null;
};

export type DistanceWarning = { side: "before" | "after"; km: number; meeting: EveningMeeting };

// The meetings just before and just after a time, when further than the
// limit from the lead.
export function distanceWarnings(
  lead: Point | null,
  startsAt: string,
  evening: EveningMeeting[],
  limitKm: number,
): DistanceWarning[] {
  if (!lead) return [];
  const at = new Date(startsAt).getTime();
  const sorted = [...evening].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const before = sorted.filter((meeting) => new Date(meeting.startsAt).getTime() < at).at(-1);
  const after = sorted.find((meeting) => new Date(meeting.startsAt).getTime() > at);
  const warnings: DistanceWarning[] = [];
  for (const [side, meeting] of [["before", before], ["after", after]] as const) {
    if (!meeting || meeting.lat === null || meeting.lng === null) continue;
    const km = kmBetween(lead, { lat: meeting.lat, lng: meeting.lng });
    if (km > limitKm) warnings.push({ side, km, meeting });
  }
  return warnings;
}

// How far each meeting is from the one before it, for Tonight.
export function legs(meetings: EveningMeeting[]): (number | null)[] {
  return meetings.map((meeting, index) => {
    const previous = meetings[index - 1];
    if (!previous || previous.lat === null || previous.lng === null || meeting.lat === null || meeting.lng === null) {
      return null;
    }
    return kmBetween({ lat: previous.lat, lng: previous.lng }, { lat: meeting.lat, lng: meeting.lng });
  });
}

// Opens Google Maps with directions to the house from wherever the phone is.
export function navigateUrl(lead: { lat: number | null; lng: number | null; address_line: string; city: string }): string {
  const destination =
    lead.lat !== null && lead.lng !== null ? `${lead.lat},${lead.lng}` : `${lead.address_line}, ${lead.city}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}
