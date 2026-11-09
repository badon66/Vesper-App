import { SOFFIT_LABELS, type SoffitColour } from "@/lib/leads/status";
import {
  CUSTOM_CHOICE,
  ralLabel,
  sortTrackColours,
  trackColourText,
  type TrackColour,
} from "@/lib/leads/track-colour";
import type { PhotoSlot } from "@/lib/leads/door";

// Soffit colour code (Keenan, 2026-11-09). Each lead can carry the soffit's
// own number from the RAL colour book, and a photo of the book held up to
// the soffit, either or both; a split soffit gets one of each for both of
// its colours. Optional everywhere: never needed to save or book, never in
// the six questions, never anything to do with pay. The lead's own setter
// and Keenan add them; every other setter reads them. Keenan's "Use for the
// track" sets the track colour from a code in one tap: the stock colour on
// his list with that RAL code, or Custom with it. Names only, no swatches.

export type SoffitCodeWhich = 1 | 2;

export const SOFFIT_CODE_COLUMN = {
  1: "soffit_ral_code",
  2: "soffit_ral_code_2",
} as const satisfies Record<SoffitCodeWhich, string>;

export const SOFFIT_BOOK_SLOT = {
  1: "soffit_book",
  2: "soffit_book_2",
} as const satisfies Record<SoffitCodeWhich, PhotoSlot>;

export const SOFFIT_CODE_ERROR = "Type the four digits after RAL in the colour book, like 9010.";
export const SOFFIT_CODE_UNKNOWN = "That number isn't on the RAL Classic list. Check it in the colour book.";
export const SOFFIT_CODE_NOT_SPLIT = "This soffit has one colour, so it takes one code.";

// What was typed, as the four digits saved: "RAL 9010", "ral9010" and
// " 9010 " are all 9010. An empty box clears the code.
export function parseSoffitCode(typed: string): { ok: true; code: string | null } | { ok: false; error: string } {
  const text = typed.trim();
  if (text === "") return { ok: true, code: null };
  const match = /^(?:ral[\s-]*)?(\d{4})$/i.exec(text);
  if (!match) return { ok: false, error: SOFFIT_CODE_ERROR };
  return { ok: true, code: match[1] };
}

// "RAL 9010 Pure white", or just "RAL 9010" when the name isn't known.
export function soffitCodeLabel(code: string, ralNames: ReadonlyMap<string, string> | Record<string, string>): string {
  const name = ralNames instanceof Map ? ralNames.get(code) : (ralNames as Record<string, string>)[code];
  return ralLabel(code, name);
}

// What the field says under the box as it is typed: the colour's name once
// four digits are in, so a mistyped number shows at once.
export function soffitCodeReadBack(
  typed: string,
  ralNames: Record<string, string>,
): { tone: "name" | "hint"; text: string } {
  const parsed = parseSoffitCode(typed);
  if (!parsed.ok) return { tone: "hint", text: "Four digits, like 9010." };
  const code = parsed.code;
  if (code === null) return { tone: "hint", text: "The four digits after RAL, like 9010." };
  const name = ralNames[code];
  return name ? { tone: "name", text: ralLabel(code, name) } : { tone: "hint", text: "That number isn't on the RAL Classic list." };
}

// What "Use for the track" would set: the first active colour on Keenan's
// list with that RAL code, in his order, or else Custom with the code.
export type TrackChoice = { kind: "list"; colour: TrackColour } | { kind: "custom"; ralCode: string };

export function trackChoiceFor(code: string, colours: readonly TrackColour[]): TrackChoice {
  const stock = sortTrackColours([...colours]).find((colour) => colour.active && colour.ral_code === code);
  return stock ? { kind: "list", colour: stock } : { kind: "custom", ralCode: code };
}

// The same choice as the track colour form sends it.
export function trackChoiceForm(choice: TrackChoice): { choice: string; ral_code: string } {
  return choice.kind === "list"
    ? { choice: choice.colour.id, ral_code: "" }
    : { choice: CUSTOM_CHOICE, ral_code: choice.ralCode };
}

// Whether the lead's track colour is already exactly what the choice sets.
export function trackChoiceIsSet(
  choice: TrackChoice,
  lead: { track_colour_id: string | null; track_ral_code: string | null },
): boolean {
  return choice.kind === "list"
    ? lead.track_ral_code === null && lead.track_colour_id === choice.colour.id
    : lead.track_ral_code === choice.ralCode;
}

// The choice in the words the track colour card uses.
export function trackChoiceText(choice: TrackChoice, ralNames: ReadonlyMap<string, string>): string {
  if (choice.kind === "custom") {
    return trackColourText({ kind: "custom", ralCode: choice.ralCode, ralName: ralNames.get(choice.ralCode) ?? null });
  }
  const { colour } = choice;
  return trackColourText({
    kind: "list",
    name: colour.name,
    ralCode: colour.ral_code,
    ralName: colour.ral_code ? (ralNames.get(colour.ral_code) ?? null) : null,
    retired: !colour.active,
  });
}

export type SoffitCodeBlock = {
  which: SoffitCodeWhich;
  // The soffit colour's name, only when the soffit is split, so each code
  // and photo says which colour it is.
  colourName: string | null;
  code: string | null;
  codeLabel: string | null;
  slot: PhotoSlot;
  photoUrl: string | null;
  // Owner only, once a code is saved: what Use for the track would set, and
  // whether the track colour is that already.
  track: { set: boolean; text: string; custom: boolean } | null;
};

type SoffitLead = {
  soffit_colour: SoffitColour | null;
  soffit_colour_2?: SoffitColour | null;
  soffit_ral_code?: string | null;
  soffit_ral_code_2?: string | null;
  track_colour_id: string | null;
  track_ral_code: string | null;
};

// One block for the soffit, or two for a split soffit, each with its code,
// its colour book photo and, for Keenan, Use for the track.
export function soffitCodeBlocks(
  lead: SoffitLead,
  {
    isOwner,
    colours,
    ralNames,
    photoUrls,
  }: {
    isOwner: boolean;
    colours: readonly TrackColour[];
    ralNames: ReadonlyMap<string, string>;
    photoUrls: Partial<Record<PhotoSlot, string>>;
  },
): SoffitCodeBlock[] {
  const split = Boolean(lead.soffit_colour && lead.soffit_colour_2);
  const whiches: SoffitCodeWhich[] = split ? [1, 2] : [1];
  return whiches.map((which) => {
    const code = (which === 1 ? lead.soffit_ral_code : lead.soffit_ral_code_2) ?? null;
    const colour = which === 1 ? lead.soffit_colour : (lead.soffit_colour_2 ?? null);
    const choice = isOwner && code ? trackChoiceFor(code, colours) : null;
    return {
      which,
      colourName: split && colour ? SOFFIT_LABELS[colour] : null,
      code,
      codeLabel: code ? soffitCodeLabel(code, ralNames) : null,
      slot: SOFFIT_BOOK_SLOT[which],
      photoUrl: photoUrls[SOFFIT_BOOK_SLOT[which]] ?? null,
      track: choice
        ? { set: trackChoiceIsSet(choice, lead), text: trackChoiceText(choice, ralNames), custom: choice.kind === "custom" }
        : null,
    };
  });
}

// The codes a lead carries, for reading their names.
export function soffitCodes(lead: { soffit_ral_code?: string | null; soffit_ral_code_2?: string | null }): string[] {
  return [lead.soffit_ral_code, lead.soffit_ral_code_2].filter((code): code is string => Boolean(code));
}

// The key for Keenan's track colour form beside these blocks. Use for the
// track changes the saved colour from outside the form, so the form starts
// again from what is saved when a block's "already set" flips. Keyed on the
// saved colour itself, the form would also start again after its own save
// and lose its "Saved."; a lead with no code never restarts it.
export function trackFormKey(blocks: readonly SoffitCodeBlock[]): string {
  return `track-${blocks.map((block) => (block.track?.set ? "1" : "0")).join("")}`;
}
