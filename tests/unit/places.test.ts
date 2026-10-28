import { describe, expect, it } from "vitest";
import { addressFromPlace, mapsLink, suggestionsFromResponse } from "@/lib/places";

// Shaped like Places API (New) responses for Calgary homes.
const component = (longText: string, types: string[], shortText = longText) => ({ longText, shortText, types });

const evanston = {
  id: "ChIJevanston123",
  formattedAddress: "123 Evanston Way NW, Calgary, AB T3P 0A1, Canada",
  location: { latitude: 51.17421, longitude: -114.10533 },
  addressComponents: [
    component("123", ["street_number"]),
    component("Evanston Way Northwest", ["route"], "Evanston Way NW"),
    component("Evanston", ["neighborhood", "political"]),
    component("Calgary", ["locality", "political"]),
    component("Alberta", ["administrative_area_level_1", "political"], "AB"),
    component("Canada", ["country", "political"], "CA"),
    component("T3P 0A1", ["postal_code"]),
  ],
};

describe("addressFromPlace", () => {
  it("fills the street with Google's short route name, the city, postal code, neighbourhood and position", () => {
    expect(addressFromPlace(evanston)).toEqual({
      addressLine: "123 Evanston Way NW",
      city: "Calgary",
      postalCode: "T3P 0A1",
      neighbourhood: "Evanston",
      lat: 51.17421,
      lng: -114.10533,
      placeId: "ChIJevanston123",
    });
  });

  it("puts a unit number in front the Canadian way", () => {
    const withUnit = {
      ...evanston,
      addressComponents: [component("5", ["subpremise"]), ...evanston.addressComponents],
    };
    expect(addressFromPlace(withUnit)?.addressLine).toBe("5-123 Evanston Way NW");
  });

  it("falls back from neighbourhood to sublocality to the knock session's neighbourhood", () => {
    const noNeighbourhood = {
      ...evanston,
      addressComponents: evanston.addressComponents.filter((c) => !c.types.includes("neighborhood")),
    };
    const withSublocality = {
      ...noNeighbourhood,
      addressComponents: [...noNeighbourhood.addressComponents, component("Northwest Calgary", ["sublocality_level_1", "sublocality"])],
    };
    expect(addressFromPlace(withSublocality)?.neighbourhood).toBe("Northwest Calgary");
    expect(addressFromPlace(noNeighbourhood, "Evanston North")?.neighbourhood).toBe("Evanston North");
    expect(addressFromPlace(noNeighbourhood, "  ")?.neighbourhood).toBeNull();
    expect(addressFromPlace(noNeighbourhood)?.neighbourhood).toBeNull();
  });

  it("uses the first part of the formatted address when there is no street number", () => {
    const noStreet = {
      ...evanston,
      formattedAddress: "Evanston Towne Centre, Calgary, AB, Canada",
      addressComponents: evanston.addressComponents.filter((c) => !c.types.includes("street_number") && !c.types.includes("route")),
    };
    expect(addressFromPlace(noStreet)?.addressLine).toBe("Evanston Towne Centre");
    const routeOnly = {
      ...evanston,
      addressComponents: evanston.addressComponents.filter((c) => !c.types.includes("street_number")),
    };
    expect(addressFromPlace(routeOnly)?.addressLine).toBe("Evanston Way NW");
  });

  it("defaults the city to Calgary and refuses a place without a position", () => {
    const noCity = { ...evanston, addressComponents: evanston.addressComponents.filter((c) => !c.types.includes("locality")) };
    expect(addressFromPlace(noCity)?.city).toBe("Calgary");
    expect(addressFromPlace({ ...evanston, location: undefined })).toBeNull();
    expect(addressFromPlace({ ...evanston, id: undefined })).toBeNull();
    expect(addressFromPlace(null)).toBeNull();
  });
});

describe("suggestionsFromResponse", () => {
  it("keeps predictions with a place id and splits main and secondary text", () => {
    const json = {
      suggestions: [
        {
          placePrediction: {
            placeId: "ChIJa",
            text: { text: "123 Evanston Way NW, Calgary, AB, Canada" },
            structuredFormat: { mainText: { text: "123 Evanston Way NW" }, secondaryText: { text: "Calgary, AB, Canada" } },
          },
        },
        { placePrediction: { text: { text: "No id" } } },
        { queryPrediction: { text: { text: "a query" } } },
        { placePrediction: { placeId: "ChIJb", text: { text: "45 Bridgeland Pl NE" } } },
      ],
    };
    expect(suggestionsFromResponse(json)).toEqual([
      { placeId: "ChIJa", main: "123 Evanston Way NW", secondary: "Calgary, AB, Canada" },
      { placeId: "ChIJb", main: "45 Bridgeland Pl NE", secondary: "" },
    ]);
    expect(suggestionsFromResponse({})).toEqual([]);
    expect(suggestionsFromResponse(null)).toEqual([]);
  });
});

describe("mapsLink", () => {
  it("points at the exact spot when there is a position, and at the address otherwise", () => {
    expect(mapsLink({ lat: 51.1, lng: -114.2, address_line: "1 Main St", city: "Calgary" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=51.1%2C-114.2",
    );
    expect(mapsLink({ lat: null, lng: null, address_line: "1 Main St", city: "Calgary" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=1%20Main%20St%2C%20Calgary",
    );
  });
});
