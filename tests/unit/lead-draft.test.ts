import { describe, expect, it } from "vitest";
import { defaultsFromDraft, draftFromFormData, draftHasContent, draftKey, draftPhotoPaths, readDraft, DRAFT_HOURS } from "@/lib/leads/draft";

// A new lead's draft on the phone (2026-11-03): what was entered comes back
// after a reload, and nothing else does.

const form = (entries: [string, string | Blob][]) => {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
};
const NOW = Date.parse("2026-11-03T23:00:00Z");

describe("a new lead's draft", () => {
  it("keeps every typed field and answer, never the intent, the id or a file", () => {
    const draft = draftFromFormData(
      form([
        ["first_name", "Zane"],
        ["phone", "(403) 555-0199"],
        ["owns_home", "yes"],
        ["photo_slot_front", "u1/front.jpg"],
        ["photo_paths", "u1/extra.jpg"],
        ["intent", "save"],
        ["id", "x"],
        ["upload", new Blob(["x"])],
      ]),
      NOW,
    );
    expect(draft.values).toEqual({ first_name: "Zane", phone: "(403) 555-0199", owns_home: "yes", photo_slot_front: "u1/front.jpg" });
    expect(draft.extraPhotos).toBe(1);
    expect(draft.savedAt).toBe(NOW);
  });

  it("counts only what was entered: the session's neighbourhood and Door alone are nothing", () => {
    expect(draftHasContent({ values: { neighbourhood: "Aspen Woods", source: "door", first_name: " " }, extraPhotos: 0 })).toBe(false);
    expect(draftHasContent({ values: { phone: "403" }, extraPhotos: 0 })).toBe(true);
    expect(draftHasContent({ values: { soffit_colour: "white" }, extraPhotos: 0 })).toBe(true);
    expect(draftHasContent({ values: {}, extraPhotos: 2 })).toBe(true);
  });

  it("is read back only while recent, well formed and not empty", () => {
    const stored = JSON.stringify({ savedAt: NOW - 3600_000, values: { first_name: "Zane", odd: 4 }, extraPhotos: 0 });
    expect(readDraft(stored, NOW)?.values).toEqual({ first_name: "Zane" });
    expect(readDraft(JSON.stringify({ savedAt: NOW - (DRAFT_HOURS + 1) * 3600_000, values: { first_name: "Zane" } }), NOW)).toBeNull();
    expect(readDraft(JSON.stringify({ savedAt: NOW, values: { neighbourhood: "Aspen Woods" } }), NOW)).toBeNull();
    for (const junk of [null, "", "not json", "[]", JSON.stringify({ values: {} }), JSON.stringify({ savedAt: "x", values: {} })]) {
      expect(readDraft(junk, NOW)).toBeNull();
    }
  });

  it("fills the form back in, with the map position and the answers", () => {
    const defaults = defaultsFromDraft({
      savedAt: NOW,
      extraPhotos: 0,
      values: {
        first_name: "Zane",
        address_line: "12 Critique Way SW",
        city: "Calgary",
        lat: "51.04",
        lng: "-114.07",
        place_id: "abc",
        position_source: "picked",
        owns_home: "yes",
        house_type: "bungalow",
        source: "nonsense",
      },
    });
    expect(defaults.first_name).toBe("Zane");
    expect(defaults.address).toEqual({
      addressLine: "12 Critique Way SW",
      city: "Calgary",
      postalCode: null,
      lat: 51.04,
      lng: -114.07,
      placeId: "abc",
      positionSource: "picked",
      accuracy: null,
    });
    expect(defaults.find_out.owns_home).toBe("yes");
    expect(defaults.find_out.wants_price).toBeNull();
    expect(defaults.house_type).toBe("bungalow");
    expect(defaults.source).toBe("door");
  });

  it("finds the guided photos already uploaded, and keys the draft by person", () => {
    expect(draftPhotoPaths({ savedAt: NOW, extraPhotos: 0, values: { photo_slot_front: "u1/a.jpg", photo_slot_soffit: "" } })).toEqual({ front: "u1/a.jpg" });
    expect(draftKey("u1")).not.toBe(draftKey("u2"));
  });
});
