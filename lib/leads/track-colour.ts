import { z } from "zod";

// Track colour (Keenan, 2026-11-01). White is the only stock track colour.
// Keenan keeps a list of colours, each with a name and an optional RAL code,
// and sets each lead's colour himself: one of the active colours, or Custom,
// a RAL Classic code from his RAL K7 book. Names only: no swatches anywhere,
// because screen colours aren't accurate.

export type TrackColour = {
  id: string;
  name: string;
  ral_code: string | null;
  sort_order: number;
  active: boolean;
};

export type LeadTrackColour =
  | { kind: "none" }
  | { kind: "list"; name: string; ralCode: string | null; ralName: string | null; retired: boolean }
  | { kind: "custom"; ralCode: string; ralName: string | null };

export const RAL_CODE_PATTERN = /^\d{4}$/;

export const CUSTOM_CHOICE = "custom";

export function sortTrackColours<T extends { sort_order: number; name: string }>(colours: T[]): T[] {
  return [...colours].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

export function ralLabel(code: string, name: string | null | undefined): string {
  return name ? `RAL ${code} ${name}` : `RAL ${code}`;
}

export function leadTrackColour(
  lead: { track_colour_id: string | null; track_ral_code: string | null },
  colours: Map<string, TrackColour>,
  ralNames: Map<string, string>,
): LeadTrackColour {
  if (lead.track_ral_code) {
    return {
      kind: "custom",
      ralCode: lead.track_ral_code,
      ralName: ralNames.get(lead.track_ral_code) ?? null,
    };
  }
  const colour = lead.track_colour_id ? colours.get(lead.track_colour_id) : undefined;
  if (!colour) return { kind: "none" };
  return {
    kind: "list",
    name: colour.name,
    ralCode: colour.ral_code,
    ralName: colour.ral_code ? (ralNames.get(colour.ral_code) ?? null) : null,
    retired: !colour.active,
  };
}

// One line for the lead page, and later the quote.
export function trackColourText(colour: LeadTrackColour): string {
  switch (colour.kind) {
    case "none":
      return "Not set yet";
    case "list":
      return colour.ralCode ? `${colour.name}, ${ralLabel(colour.ralCode, colour.ralName)}` : colour.name;
    case "custom":
      return `Custom, ${ralLabel(colour.ralCode, colour.ralName)}`;
  }
}

export function needsPowderCoating(colour: LeadTrackColour): boolean {
  return colour.kind === "custom";
}

// What the owner picked on a lead: nothing, a colour from the list, or a
// custom RAL Classic code. Whether the code exists is the database's check.
export const trackColourChoiceSchema = z
  .object({
    choice: z.string().trim(),
    ral_code: z.string().trim(),
  })
  .transform((value, ctx) => {
    if (value.choice === "") return { track_colour_id: null, track_ral_code: null };
    if (value.choice === CUSTOM_CHOICE) {
      if (!RAL_CODE_PATTERN.test(value.ral_code)) {
        ctx.addIssue({
          code: "custom",
          path: ["ral_code"],
          message: "Enter the four-digit RAL Classic number, like 7016.",
        });
        return z.NEVER;
      }
      return { track_colour_id: null, track_ral_code: value.ral_code };
    }
    if (!z.uuid().safeParse(value.choice).success) {
      ctx.addIssue({ code: "custom", path: ["choice"], message: "Pick a colour from the list." });
      return z.NEVER;
    }
    return { track_colour_id: value.choice, track_ral_code: null };
  });

// A colour on Keenan's list: a name and an optional RAL Classic code.
export const trackColourFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: "Enter a name." })
    .max(40, { error: "Keep the name under 40 characters." }),
  ral_code: z
    .string()
    .trim()
    .refine((code) => code === "" || RAL_CODE_PATTERN.test(code), {
      error: "Enter the four-digit RAL Classic number, like 9016, or leave it blank.",
    })
    .transform((code) => code || null),
});

// The list after moving one colour up or down, as new sort orders. Only the
// colours whose position changed are returned.
export function reorderTrackColours(
  colours: TrackColour[],
  id: string,
  direction: "up" | "down",
): { id: string; sort_order: number }[] {
  const ordered = sortTrackColours(colours);
  const index = ordered.findIndex((colour) => colour.id === id);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= ordered.length) return [];
  const moved = [...ordered];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved.flatMap((colour, position) =>
    colour.sort_order === position + 1 ? [] : [{ id: colour.id, sort_order: position + 1 }],
  );
}
