import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
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
    house_type: optionalEnum(Constants.public.Enums.house_type),
    soffit_colour: optionalEnum(Constants.public.Enums.soffit_colour),
    soffit_note: optionalText(200, "Soffit note"),
    notes: optionalText(4000, "Notes"),
    source: z.enum(Constants.public.Enums.lead_source, { error: "Pick where the lead came from." }),
    photo_paths: z
      .array(z.string().regex(PHOTO_PATH_PATTERN, { error: "A photo did not upload properly." }))
      .max(MAX_PHOTOS_PER_FORM, { error: `At most ${MAX_PHOTOS_PER_FORM} photos at a time.` }),
  })
  .transform((values) => {
    // A map position is all or nothing, and a place id without a position
    // means nothing, so drop both rather than save half a position.
    const hasPosition = values.lat !== null && values.lng !== null;
    return {
      ...values,
      lat: hasPosition ? values.lat : null,
      lng: hasPosition ? values.lng : null,
      place_id: hasPosition ? values.place_id : null,
      soffit_note: values.soffit_colour === "other" ? values.soffit_note : null,
    };
  });

export type LeadFormValues = z.output<typeof leadFormSchema>;
export type LeadFormField = keyof z.input<typeof leadFormSchema>;
export type LeadFormErrors = Partial<Record<LeadFormField, string>>;

export function parseLeadForm(
  input: Record<string, unknown>,
): { ok: true; values: LeadFormValues } | { ok: false; errors: LeadFormErrors } {
  const result = leadFormSchema.safeParse(input);
  if (result.success) return { ok: true, values: result.data };
  const errors: LeadFormErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as LeadFormField | undefined;
    const key: LeadFormField = field === "lat" || field === "lng" || field === "place_id" ? "address_line" : (field ?? "first_name");
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
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
    house_type: text("house_type"),
    soffit_colour: text("soffit_colour"),
    soffit_note: text("soffit_note"),
    notes: text("notes"),
    source: text("source") || "door",
    photo_paths: formData.getAll("photo_paths").map(String),
  };
}

type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

// The columns a form save writes. Status, owner and session are never set
// from the form.
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
    house_type: values.house_type,
    soffit_colour: values.soffit_colour,
    soffit_note: values.soffit_note,
    notes: values.notes,
    source: values.source,
  };
}
