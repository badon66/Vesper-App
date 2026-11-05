import { describe, expect, it } from "vitest";
import { atDeadline, FINDING, failureMessage, findingText, IDLE, LOCATION_ON_STEPS, PRECISE_STEPS, withError, withReading } from "@/lib/locate";
import { nearestFromReverse } from "@/lib/places";

// "Use where I'm standing" (round 3, Keenan, 2026-11-05): it listens for up
// to 15 seconds and takes the first reading within 50 m.
const calgary = { lat: 51.05, lng: -114.07 };

describe("Finding where the setter is standing", () => {
  it("keeps listening past rough readings, showing the best so far, and takes the first within 50 m", () => {
    let state = FINDING;
    state = withReading(state, { ...calgary, accuracy: 1800 });
    expect(state).toEqual({ kind: "finding", best: 1800 });
    state = withReading(state, { ...calgary, accuracy: 120 });
    expect(state).toEqual({ kind: "finding", best: 120 });
    state = withReading(state, { ...calgary, accuracy: 300 });
    expect(state).toEqual({ kind: "finding", best: 120 });
    state = withReading(state, { ...calgary, accuracy: 12.34 });
    expect(state).toEqual({ kind: "found", position: { ...calgary, accuracy: 12.3 } });
    // Once found, later readings change nothing.
    expect(withReading(state, { ...calgary, accuracy: 5 })).toBe(state);
  });

  it("takes exactly 50 m, and turns away a good reading outside Calgary", () => {
    expect(withReading(FINDING, { ...calgary, accuracy: 50 }).kind).toBe("found");
    expect(withReading(FINDING, { lat: 49.28, lng: -123.12, accuracy: 10 })).toMatchObject({ kind: "failed", reason: "outside" });
  });

  it("stops at once when location is off, but keeps waiting through 'not found yet'", () => {
    expect(withError(FINDING, 1)).toEqual({ kind: "failed", reason: "denied", best: null });
    expect(withError(FINDING, 2)).toBe(FINDING);
    expect(withError(FINDING, 3)).toBe(FINDING);
    expect(withError(IDLE, 1)).toBe(IDLE);
  });

  it("ends the 15 seconds with the reason: no answer, too rough, or Precise Location off", () => {
    expect(atDeadline(FINDING)).toEqual({ kind: "failed", reason: "no_answer", best: null });
    expect(atDeadline({ kind: "finding", best: 87.6 })).toEqual({ kind: "failed", reason: "rough", best: 88 });
    expect(atDeadline({ kind: "finding", best: 3200 })).toEqual({ kind: "failed", reason: "approximate", best: 3200 });
  });

  it("says something at once, then how close it is", () => {
    expect(findingText(null)).toBe("Finding where you are...");
    expect(findingText(88.2)).toBe("Finding where you are... about 88 m so far, getting closer.");
    expect(findingText(3200)).toBe("Finding where you are... only a rough area so far (about 3.2 km).");
  });

  it("gives the iPhone steps when location is off, and the Precise Location steps when it's rough", () => {
    expect(failureMessage("denied", null, "phone")).toMatchObject({ title: "Location is off for Vesper.", steps: LOCATION_ON_STEPS });
    expect(failureMessage("approximate", 3200, "phone").steps).toBe(PRECISE_STEPS);
    expect(failureMessage("rough", 88, "phone").title).toBe("It only got to about 88 m. It needs 50 m or better.");
    expect(failureMessage("no_answer", null, "device").title).toBe("This device didn't answer with a position.");
    expect(LOCATION_ON_STEPS.join(" ")).toMatch(/Privacy & Security.*Location Services.*Safari Websites.*While Using the App.*Precise Location/);
  });

  it("writes every message without em dashes", () => {
    for (const reason of ["unsupported", "denied", "no_answer", "rough", "approximate", "outside", "background"] as const) {
      const message = failureMessage(reason, 120, "phone");
      expect(JSON.stringify(message)).not.toMatch(/—/);
    }
  });
});

describe("The nearest address to a position", () => {
  const component = (types: string[], longText: string, shortText = longText) => ({ types, longText, shortText });
  const house = {
    placeId: "house",
    formattedAddress: "123 Evanston Way NW, Calgary, AB T3P 0A1, Canada",
    types: ["street_address"],
    addressComponents: [
      component(["street_number"], "123"),
      component(["route"], "Evanston Way Northwest", "Evanston Way NW"),
      component(["neighborhood", "political"], "Evanston"),
      component(["locality", "political"], "Calgary"),
      component(["postal_code"], "T3P 0A1"),
    ],
  };
  const street = {
    placeId: "street",
    formattedAddress: "Evanston Way NW, Calgary, AB, Canada",
    types: ["route"],
    addressComponents: [component(["route"], "Evanston Way Northwest", "Evanston Way NW"), component(["locality", "political"], "Calgary")],
  };

  it("takes the first house address, with the short street name", () => {
    expect(nearestFromReverse({ results: [street, house] }, 51.17, -114.11)).toEqual({
      addressLine: "123 Evanston Way NW",
      city: "Calgary",
      postalCode: "T3P 0A1",
      neighbourhood: "Evanston",
      exact: true,
    });
  });

  it("falls back to the street alone, marked as not exact", () => {
    expect(nearestFromReverse({ results: [street] }, 51.17, -114.11, "Evanston")).toMatchObject({ addressLine: "Evanston Way NW", exact: false, neighbourhood: "Evanston" });
  });

  it("calls a numbered answer exact even when Google files it as a place, like a show home", () => {
    const showHome = { ...house, placeId: "show", types: ["establishment", "point_of_interest"] };
    expect(nearestFromReverse({ results: [showHome] }, 51.17, -114.11)).toMatchObject({ addressLine: "123 Evanston Way NW", exact: true });
  });

  it("gives nothing when no answer names a street", () => {
    expect(nearestFromReverse({ results: [{ placeId: "x", types: ["locality"], addressComponents: [component(["locality"], "Calgary")] }] }, 51, -114)).toBeNull();
    expect(nearestFromReverse({}, 51, -114)).toBeNull();
    expect(nearestFromReverse(null, 51, -114)).toBeNull();
  });
});
