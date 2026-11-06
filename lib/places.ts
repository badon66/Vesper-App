// Address search with Google Places API (New), called straight from the
// browser with the public key; Google allows these calls from web pages, so
// no Maps script is loaded. Autocomplete runs as the setter types. Picking a
// suggestion makes one Place Details call with the same session token, so
// Google bills the whole search as one session. Without a key, with a refused
// referrer such as a preview site, or without signal, callers fall back to
// plain text and the lead saves without a map position.

export const CALGARY_CENTRE = { latitude: 51.0447, longitude: -114.0719 };
const AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const DETAILS_URL = "https://places.googleapis.com/v1/places/";
export const DETAILS_FIELD_MASK = "id,formattedAddress,addressComponents,location";

export type AddressSuggestion = {
  placeId: string;
  main: string;
  secondary: string;
};

export type PickedAddress = {
  addressLine: string;
  city: string;
  postalCode: string | null;
  neighbourhood: string | null;
  lat: number;
  lng: number;
  placeId: string;
};

export class PlacesUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlacesUnavailableError";
  }
}

type AutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }>;
};

export function suggestionsFromResponse(json: unknown): AddressSuggestion[] {
  const suggestions = (json as AutocompleteResponse | null)?.suggestions ?? [];
  const out: AddressSuggestion[] = [];
  for (const item of suggestions) {
    const prediction = item.placePrediction;
    if (!prediction?.placeId) continue;
    const main =
      prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? "";
    if (!main) continue;
    out.push({
      placeId: prediction.placeId,
      main,
      secondary: prediction.structuredFormat?.secondaryText?.text ?? "",
    });
  }
  return out;
}

type AddressComponent = { longText?: string; shortText?: string; types?: string[] };
type PlaceDetails = {
  id?: string;
  formattedAddress?: string;
  addressComponents?: AddressComponent[];
  location?: { latitude?: number; longitude?: number };
};

// Turns a Place Details response into the lead's address fields. The street
// uses Google's short route name, like "Evanston Way NW". The neighbourhood
// is Google's neighbourhood, then sublocality, then the fallback (the open
// knock session's neighbourhood); it stays editable in the form.
export function addressFromPlace(
  place: unknown,
  fallbackNeighbourhood?: string | null,
): PickedAddress | null {
  const p = place as PlaceDetails | null;
  const lat = p?.location?.latitude;
  const lng = p?.location?.longitude;
  if (!p?.id || typeof lat !== "number" || typeof lng !== "number") return null;

  const parts = p.addressComponents ?? [];
  const find = (type: string) => parts.find((part) => part.types?.includes(type));
  const longText = (type: string) => find(type)?.longText?.trim() || null;
  const shortText = (type: string) => find(type)?.shortText?.trim() || null;

  const number = longText("street_number");
  const route = shortText("route") ?? longText("route");
  const unit = longText("subpremise");
  let addressLine: string;
  if (number && route) {
    addressLine = `${unit ? `${unit}-` : ""}${number} ${route}`;
  } else if (route) {
    addressLine = route;
  } else {
    addressLine = (p.formattedAddress ?? "").split(",")[0]?.trim() ?? "";
  }
  if (!addressLine) return null;

  const neighbourhood =
    longText("neighborhood") ??
    longText("sublocality_level_1") ??
    longText("sublocality") ??
    (fallbackNeighbourhood?.trim() || null);

  return {
    addressLine,
    city: longText("locality") ?? "Calgary",
    postalCode: longText("postal_code"),
    neighbourhood,
    lat,
    lng,
    placeId: p.id,
  };
}

export async function fetchAddressSuggestions(
  apiKey: string,
  input: string,
  sessionToken: string,
  signal?: AbortSignal,
): Promise<AddressSuggestion[]> {
  const response = await fetch(AUTOCOMPLETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
    body: JSON.stringify({
      input,
      sessionToken,
      includedRegionCodes: ["ca"],
      languageCode: "en",
      locationBias: { circle: { center: CALGARY_CENTRE, radius: 40000 } },
    }),
    signal,
  });
  if (!response.ok) {
    throw new PlacesUnavailableError(`Address suggestions failed with ${response.status}`);
  }
  return suggestionsFromResponse(await response.json());
}

export async function fetchPickedAddress(
  apiKey: string,
  placeId: string,
  sessionToken: string,
  fallbackNeighbourhood?: string | null,
): Promise<PickedAddress> {
  const url = `${DETAILS_URL}${encodeURIComponent(placeId)}?sessionToken=${encodeURIComponent(sessionToken)}&languageCode=en`;
  const response = await fetch(url, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": DETAILS_FIELD_MASK },
  });
  if (!response.ok) {
    throw new PlacesUnavailableError(`Address details failed with ${response.status}`);
  }
  const picked = addressFromPlace(await response.json(), fallbackNeighbourhood);
  if (!picked) throw new PlacesUnavailableError("Google returned no usable address");
  return picked;
}

// A link that opens the address in Google Maps, at the exact spot when the
// lead has a map position.
export function mapsLink(lead: {
  lat: number | null;
  lng: number | null;
  address_line: string;
  city: string;
}): string {
  const query =
    lead.lat !== null && lead.lng !== null
      ? `${lead.lat},${lead.lng}`
      : `${lead.address_line}, ${lead.city}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// "Use where I'm standing" (round 3, 2026-11-05): the nearest street address
// to the phone's GPS position, for the setter to confirm. Geocoding API v4,
// called from the browser with the same key as the address search (it was
// checked to allow it on 2026-11-05). On a street Google doesn't have yet it
// can come back as a neighbour's address or just the street, so it is only
// ever filled in for the setter to check; the map position stays the phone's.
const REVERSE_URL = "https://geocode.googleapis.com/v4/geocode/location/";
export const REVERSE_FIELD_MASK = "results.placeId,results.formattedAddress,results.addressComponents,results.types";

export type NearestAddress = {
  addressLine: string;
  city: string;
  postalCode: string | null;
  neighbourhood: string | null;
  // True for a house address; false when Google only knows the street.
  exact: boolean;
};

type ReverseResponse = {
  results?: Array<{ placeId?: string; formattedAddress?: string; addressComponents?: AddressComponent[]; types?: string[] }>;
};

// The best answer in a reverse lookup: the first house address, or else the
// first answer that names a street.
export function nearestFromReverse(json: unknown, lat: number, lng: number, fallbackNeighbourhood?: string | null): NearestAddress | null {
  const results = (json as ReverseResponse | null)?.results ?? [];
  const isHouse = (types?: string[]) => Boolean(types?.some((type) => type === "street_address" || type === "premise" || type === "subpremise"));
  const hasStreet = (parts?: AddressComponent[]) => Boolean(parts?.some((part) => part.types?.includes("route")));
  const house = results.find((result) => isHouse(result.types) && hasStreet(result.addressComponents));
  const street = house ?? results.find((result) => hasStreet(result.addressComponents));
  if (!street) return null;
  const picked = addressFromPlace(
    { id: street.placeId ?? "reverse", formattedAddress: street.formattedAddress, addressComponents: street.addressComponents, location: { latitude: lat, longitude: lng } },
    fallbackNeighbourhood,
  );
  if (!picked) return null;
  // Exact when the line filled in has a house number, whatever kind of
  // answer it came from (a show home can come back as a point of interest).
  const number = street.addressComponents?.find((part) => part.types?.includes("street_number"))?.longText?.trim();
  return {
    addressLine: picked.addressLine,
    city: picked.city,
    postalCode: picked.postalCode,
    neighbourhood: picked.neighbourhood,
    exact: Boolean(number) && picked.addressLine.startsWith(`${number} `),
  };
}

export async function fetchNearestAddress(
  apiKey: string,
  lat: number,
  lng: number,
  fallbackNeighbourhood?: string | null,
  signal?: AbortSignal,
): Promise<NearestAddress | null> {
  const response = await fetch(`${REVERSE_URL}${lat},${lng}?languageCode=en&regionCode=ca`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": REVERSE_FIELD_MASK },
    signal,
  });
  if (!response.ok) throw new PlacesUnavailableError(`Nearest address failed with ${response.status}`);
  return nearestFromReverse(await response.json(), lat, lng, fallbackNeighbourhood);
}
