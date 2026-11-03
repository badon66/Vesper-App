import { z } from "zod";
import { PHOTO_SLOTS, slotFieldName, type PhotoSlot } from "@/lib/leads/door";
import { GPS_MAX_ACCURACY_M, inCalgaryArea } from "@/lib/geo";
import { OFFERED_SOFFIT_COLOURS } from "@/lib/leads/status";
import { normalizePhone } from "@/lib/phone";
import { COUNTED_QUESTIONS, NOT_COLLECTED, type CountedQuestion } from "@/lib/leads/questions";
import { MAX_PHOTOS_PER_FORM, PHOTO_PATH_PATTERN } from "@/lib/photos";
import { Constants, type Database } from "@/types/database";

// The New lead and Edit lead forms: validation and conversion from what the
// inputs hold to the columns the database stores. Blank optional fields
// become null. The server action is the authority; the form only helps.

const blankToNull = (value: string) => (value === "" ? null : value);

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, { error: `${label} is too long.` })
    .transform(blankToNull);

const coordinate = (min: number, max: number) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      if (value === "") return null;
      const number = Number(value);
      if (!Number.isFinite(number) || number < min || number > max) {
        ctx.addIssue({
          code: "custom",
          message: "The map position was not valid. Pick the address again.",
        });
        return z.NEVER;
      }
      return number;
    });

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .string()
    .transform(blankToNull)
    .pipe(z.enum(values, { error: "Pick one of the choices." }).nullable());

// A yes or no question: the yes word, the no word, or nothing when it was
// not asked.
const optionalYesNo = (no: string) =>
  z
    .string()
    .transform(blankToNull)
    .pipe(z.enum(["yes", no], { error: "Pick one of the choices." }).nullable())
    .transform((value) => (value === null ? null : value === "yes"));

const photoPathField = z
  .string()
  .transform(blankToNull)
  .pipe(z.string().regex(PHOTO_PATH_PATTERN, { error: "A photo did not upload properly." }).nullable());

export const leadFormSchema = z
  .object({
    first_name: z
      .string()
      .trim()
      .min(1, { error: "Enter a first name." })
      .max(80, { error: "First name is too long." }),
    last_name: optionalText(80, "Last name"),
    phone: z.string().transform((value, ctx) => {
      const result = normalizePhone(value);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: result.error });
        return z.NEVER;
      }
      return result.e164;
    }),
    email: z
      .string()
      .trim()
      .max(254, { error: "Email is too long." })
      .transform(blankToNull)
      .pipe(z.union([z.null(), z.email({ error: "That email address doesn't look right." })])),
    address_line: z
      .string()
      .trim()
      .min(1, { error: "Enter the address." })
      .max(200, { error: "Address is too long." }),
    city: z
      .string()
      .trim()
      .max(80, { error: "City is too long." })
      .transform((value) => value || "Calgary"),
    postal_code: optionalText(12, "Postal code"),
    neighbourhood: optionalText(80, "Neighbourhood"),
    lat: coordinate(-90, 90),
    lng: coordinate(-180, 180),
    place_id: optionalText(300, "Place"),
    position_source: z.enum(["", "picked", "device"]),
    position_accuracy_m: z
      .string()
      .trim()
      .transform((value, ctx) => {
        if (value === "") return null;
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0 || number > GPS_MAX_ACCURACY_M) {
          ctx.addIssue({ code: "custom", message: "The phone's position wasn't accurate enough. Take it again at the door." });
          return z.NEVER;
        }
        return number;
      }),
    house_type: optionalEnum(Constants.public.Enums.house_type),
    soffit_colour: optionalEnum(OFFERED_SOFFIT_COLOURS),
    soffit_note: optionalText(200, "Soffit note"),
    owns_home: optionalYesNo("no"),
    wants_price: optionalYesNo("not_yet"),
    // Round 2: "Everyone who decides will be there".
    both_decision_makers: optionalYesNo("no"),
    christmas_lights_now: optionalEnum(Constants.public.Enums.christmas_lights_now),
    looked_into_before: optionalEnum(Constants.public.Enums.looked_into_before),
    areas_wanted: optionalEnum(Constants.public.Enums.roofline_areas),
    install_timing: optionalEnum(Constants.public.Enums.install_timing),
    notes: optionalText(4000, "Notes"),
    source: z.enum(Constants.public.Enums.lead_source, { error: "Pick where the lead came from." }),
    photo_paths: z
      .array(z.string().regex(PHOTO_PATH_PATTERN, { error: "A photo did not upload properly." }))
      .max(MAX_PHOTOS_PER_FORM, { error: `At most ${MAX_PHOTOS_PER_FORM} photos at a time.` }),
    photo_slot_front: photoPathField,
    photo_slot_left_corner: photoPathField,
    photo_slot_right_corner: photoPathField,
    photo_slot_soffit: photoPathField,
  })
  .transform((values, ctx) => {
    // A map position is all or nothing, and a place id without a position
    // means nothing, so drop both rather than save half a position. A
    // phone position must be accurate enough and inside the Calgary area.
    const hasPosition = values.lat !== null && values.lng !== null;
    const device = hasPosition && values.position_source === "device";
    if (device && (values.position_accuracy_m === null || !inCalgaryArea(values.lat as number, values.lng as number))) {
      ctx.addIssue({ code: "custom", path: ["lat"], message: "The phone's position wasn't usable. Take it again at the door." });
      return z.NEVER;
    }
    const {
      photo_slot_front,
      photo_slot_left_corner,
      photo_slot_right_corner,
      photo_slot_soffit,
      ...rest
    } = values;
    // The lead form carries the four guided slots; the mockup (M5) is
    // uploaded by the owner on the lead page, never through this form.
    const slotPaths: Partial<Record<PhotoSlot, string | null>> = {
      front: photo_slot_front,
      left_corner: photo_slot_left_corner,
      right_corner: photo_slot_right_corner,
      soffit: photo_slot_soffit,
    };
    return {
      ...rest,
      lat: hasPosition ? values.lat : null,
      lng: hasPosition ? values.lng : null,
      place_id: hasPosition && !device ? values.place_id : null,
      position_source: hasPosition ? (device ? ("device" as const) : ("picked" as const)) : null,
      position_accuracy_m: device ? values.position_accuracy_m : null,
      soffit_note: values.soffit_colour === "other" ? values.soffit_note : null,
      slot_photos: PHOTO_SLOTS.flatMap(({ slot }) => {
        const path = slotPaths[slot];
        return path ? [{ slot, path }] : [];
      }),
    };
  });

// Round 2 (Keenan, 2026-11-03): every counted question needs an answer or
// Not collected before a lead saves, and what was marked Not collected is
// stored as such.
export type LeadFormValues = z.output<typeof leadFormSchema> & { not_collected: CountedQuestion[] };
export type LeadFormField = keyof z.input<typeof leadFormSchema>;
export type LeadFormErrors = Partial<Record<LeadFormField, string>>;

export const ANSWER_OR_NOT_COLLECTED = "Answer this, or mark it Not collected.";

export function parseLeadForm(
  input: Record<string, unknown>,
): { ok: true; values: LeadFormValues } | { ok: false; errors: LeadFormErrors } {
  // Not collected travels as its own word (and the phone as its own flag):
  // it becomes an empty answer plus a mark, before the answers are checked.
  const marked = new Set<CountedQuestion>();
  const cleaned: Record<string, unknown> = { ...input };
  for (const question of COUNTED_QUESTIONS) {
    if (question === "phone") continue;
    if (cleaned[question] === NOT_COLLECTED) {
      marked.add(question);
      cleaned[question] = "";
    }
  }
  const phoneMarked = input.phone_not_collected === "1" || input.phone_not_collected === true;
  if (phoneMarked && String(input.phone ?? "").trim() === "") marked.add("phone");
  delete cleaned.phone_not_collected;

  const result = leadFormSchema.safeParse(cleaned);
  if (result.success) {
    const values = result.data;
    const errors: LeadFormErrors = {};
    for (const question of COUNTED_QUESTIONS) {
      const value = values[question];
      if ((value === null || value === undefined) && !marked.has(question)) errors[question] = ANSWER_OR_NOT_COLLECTED;
    }
    if (Object.keys(errors).length > 0) return { ok: false, errors };
    const notCollected = COUNTED_QUESTIONS.filter((question) => marked.has(question) && (values[question] === null || values[question] === undefined));
    return { ok: true, values: { ...values, not_collected: notCollected } };
  }
  const errors: LeadFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as LeadFormField | undefined;
    const key: LeadFormField =
      field === "lat" || field === "lng" || field === "place_id"
        ? "address_line"
        : typeof field === "string" && field.startsWith("photo_slot_")
          ? "photo_paths"
          : (field ?? "first_name");
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

// The counted questions a form's input leaves with neither an answer nor
// Not collected, in the order they're asked. The form checks this before
// sending; the server checks it again in parseLeadForm.
export function unansweredQuestions(input: Record<string, unknown>): CountedQuestion[] {
  return COUNTED_QUESTIONS.filter((question) => {
    if (question === "phone") {
      const marked = input.phone_not_collected === "1" || input.phone_not_collected === true;
      return String(input.phone ?? "").trim() === "" && !marked;
    }
    return String(input[question] ?? "").trim() === "";
  });
}

export function leadFormDataToInput(formData: FormData): Record<string, unknown> {
  const text = (name: string) => String(formData.get(name) ?? "");
  return {
    first_name: text("first_name"),
    last_name: text("last_name"),
    phone: text("phone"),
    email: text("email"),
    address_line: text("address_line"),
    city: text("city"),
    postal_code: text("postal_code"),
    neighbourhood: text("neighbourhood"),
    lat: text("lat"),
    lng: text("lng"),
    place_id: text("place_id"),
    position_source: text("position_source"),
    position_accuracy_m: text("position_accuracy_m"),
    house_type: text("house_type"),
    soffit_colour: text("soffit_colour"),
    soffit_note: text("soffit_note"),
    owns_home: text("owns_home"),
    wants_price: text("wants_price"),
    both_decision_makers: text("both_decision_makers"),
    phone_not_collected: text("phone_not_collected"),
    christmas_lights_now: text("christmas_lights_now"),
    looked_into_before: text("looked_into_before"),
    areas_wanted: text("areas_wanted"),
    install_timing: text("install_timing"),
    notes: text("notes"),
    source: text("source") || "door",
    photo_paths: formData.getAll("photo_paths").map(String),
    ...Object.fromEntries(PHOTO_SLOTS.map(({ slot }) => [slotFieldName(slot), text(slotFieldName(slot))])),
  };
}

type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

// The columns a form save writes. Status, owner, session and track colour
// are never set from the form.
export function leadColumnsFromValues(values: LeadFormValues): LeadUpdate {
  return {
    first_name: values.first_name,
    last_name: values.last_name,
    phone: values.phone,
    email: values.email,
    address_line: values.address_line,
    city: values.city,
    postal_code: values.postal_code,
    neighbourhood: values.neighbourhood,
    lat: values.lat,
    lng: values.lng,
    place_id: values.place_id,
    position_source: values.position_source,
    position_accuracy_m: values.position_accuracy_m,
    house_type: values.house_type,
    soffit_colour: values.soffit_colour,
    soffit_note: values.soffit_note,
    owns_home: values.owns_home,
    wants_price: values.wants_price,
    both_decision_makers: values.both_decision_makers,
    christmas_lights_now: values.christmas_lights_now,
    looked_into_before: values.looked_into_before,
    areas_wanted: values.areas_wanted,
    install_timing: values.install_timing,
    not_collected: values.not_collected,
    notes: values.notes,
    source: values.source,
  };
}
