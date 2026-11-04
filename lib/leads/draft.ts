// A new lead's draft, kept on the phone while it is typed (2026-11-03). An
// iPhone can reload the app after the camera, and a stray tap can leave the
// form: the draft brings back what was typed, the answers and the guided
// photos already uploaded. It lives in this browser only, under the person's
// own key, and is cleared once the lead saves or they choose to start over.
// Kept pure so it is unit tested; the form does the storage.

import type { LeadFormDefaults } from "@/components/leads/lead-form";
import { FIND_OUT_QUESTIONS, PHOTO_SLOTS, slotFieldName, type FindOutField, type PhotoSlot } from "@/lib/leads/door";
import { HOUSE_TYPE_OPTIONS, SOURCE_OPTIONS, type HouseType, type LeadSource } from "@/lib/leads/status";

export const DRAFT_HOURS = 12;

const FIND_OUT_FIELDS: FindOutField[] = FIND_OUT_QUESTIONS.map((question) => question.field);

export const draftKey = (userId: string) => `vesper:new-lead-draft:${userId}`;

export type LeadDraft = {
  savedAt: number;
  values: Record<string, string>;
  // Extra photos (beyond the four guided ones) aren't brought back; the
  // notice says how many to add again.
  extraPhotos: number;
  // Handed over by the booking sheet's Keep as a lead, so New lead says so.
  from?: "sheet";
};

// What is typed by hand or chosen: the neighbourhood (filled in from the
// knock session) and where the lead came from (Door unless changed) don't
// count on their own.
const COUNTED = [
  "first_name",
  "last_name",
  "phone",
  "email",
  "notes",
  "address_line",
  "house_type",
  "soffit_note",
  "both_decision_makers",
  "phone_not_collected",
  ...FIND_OUT_FIELDS,
  ...PHOTO_SLOTS.map(({ slot }) => slotFieldName(slot)),
];

const SKIPPED = new Set(["id", "intent", "photo_paths"]);

export function draftFromFormData(formData: FormData, now: number): LeadDraft {
  const values: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (SKIPPED.has(name) || typeof value !== "string") continue;
    values[name] = value;
  }
  const extraPhotos = formData.getAll("photo_paths").filter((value) => typeof value === "string" && value !== "").length;
  return { savedAt: now, values, extraPhotos };
}

export function draftHasContent(draft: Pick<LeadDraft, "values" | "extraPhotos">): boolean {
  return draft.extraPhotos > 0 || COUNTED.some((name) => (draft.values[name] ?? "").trim() !== "");
}

// A stored draft, if it is one, it is this person's and it is recent.
export function readDraft(raw: string | null, now: number): LeadDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LeadDraft>;
    if (typeof parsed.savedAt !== "number" || !parsed.values || typeof parsed.values !== "object") return null;
    if (now - parsed.savedAt > DRAFT_HOURS * 3600 * 1000 || parsed.savedAt > now + 60_000) return null;
    const values: Record<string, string> = {};
    for (const [name, value] of Object.entries(parsed.values)) {
      if (typeof value === "string" && value.length <= 4000) values[name] = value;
    }
    const draft: LeadDraft = { savedAt: parsed.savedAt, values, extraPhotos: typeof parsed.extraPhotos === "number" ? parsed.extraPhotos : 0 };
    if (parsed.from === "sheet") draft.from = "sheet";
    return draftHasContent(draft) ? draft : null;
  } catch {
    return null;
  }
}

const number = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const oneOf = <T extends string>(options: readonly { value: T }[], value: string | undefined): T | null =>
  options.find((option) => option.value === value)?.value ?? null;

// The form's starting values from a draft.
export function defaultsFromDraft(draft: LeadDraft): LeadFormDefaults {
  const v = draft.values;
  const source = v.position_source === "picked" || v.position_source === "device" ? v.position_source : null;
  return {
    first_name: v.first_name ?? "",
    last_name: v.last_name ?? "",
    phone: v.phone ?? "",
    email: v.email ?? "",
    neighbourhood: v.neighbourhood ?? "",
    house_type: oneOf<HouseType>(HOUSE_TYPE_OPTIONS, v.house_type),
    questions: {
      ...(Object.fromEntries(FIND_OUT_FIELDS.map((field) => [field, v[field] ? v[field] : null])) as Record<FindOutField, string | null>),
      both_decision_makers: v.both_decision_makers ? v.both_decision_makers : null,
    },
    phone_not_collected: v.phone_not_collected === "1",
    soffit_note: v.soffit_note ?? "",
    notes: v.notes ?? "",
    source: oneOf<LeadSource>(SOURCE_OPTIONS, v.source) ?? "door",
    saveKey: v.save_key ? v.save_key : null,
    address: {
      addressLine: v.address_line ?? "",
      city: v.city ?? "",
      postalCode: v.postal_code ? v.postal_code : null,
      lat: number(v.lat),
      lng: number(v.lng),
      placeId: v.place_id ? v.place_id : null,
      positionSource: source,
      accuracy: number(v.position_accuracy_m),
    },
  };
}

// The guided photos a draft already uploaded, by slot.
export function draftPhotoPaths(draft: LeadDraft): Partial<Record<PhotoSlot, string>> {
  const paths: Partial<Record<PhotoSlot, string>> = {};
  for (const { slot } of PHOTO_SLOTS) {
    const path = draft.values[slotFieldName(slot)];
    if (path) paths[slot] = path;
  }
  return paths;
}
