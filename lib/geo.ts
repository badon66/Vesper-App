// The phone's own position, for a brand-new street Google doesn't have yet
// (Keenan, 2026-11-01): taken at the door, accurate to 50 m or better, and
// inside the Calgary area. The database checks the same box.
export const GPS_MAX_ACCURACY_M = 50;
export const NEARBY_LEAD_M = 25;

const CALGARY_AREA = { minLat: 50.5, maxLat: 51.6, minLng: -114.95, maxLng: -113.2 };

export function inCalgaryArea(lat: number, lng: number): boolean {
  return lat >= CALGARY_AREA.minLat && lat <= CALGARY_AREA.maxLat && lng >= CALGARY_AREA.minLng && lng <= CALGARY_AREA.maxLng;
}

export type DevicePosition = { lat: number; lng: number; accuracy: number };
