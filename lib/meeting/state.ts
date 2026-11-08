// Meeting mode's state (M5), kept pure: the payload the page hands the
// iPad, the quote as the controls hold it, and where a meeting starts when
// the iPad already holds a copy. No React and no network, so it is unit
// tested like the pricing it feeds.

import type { SoffitColour } from "@/lib/leads/status";
import type { TrackColour } from "@/lib/leads/track-colour";
import { defaultValidUntil, type ColourTiming, type QuoteInputs, type QuoteRun } from "@/lib/pricing";
import { EFFECTS, type DeckWords, type Effect, type Look, type Trace } from "@/lib/deck";

// Round 7 (Keenan, 2026-11-08): the deck's own part of the payload. Keenan's
// photos come as short-lived signed storage links, so Get tonight ready keeps
// them for a meeting without signal. Never a reference shot: those live only
// in Settings and the rehearsal view (lib/deck.ts, presentation_references),
// and this type has no field that could carry one (a unit test holds it).
export type DeckPhoto = {
  url: string;
  // The 640 px copy, for the gallery's contact sheet; null elsewhere.
  thumbUrl: string | null;
  // The focus point every crop keeps in view, 0 to 1 across and down.
  focus: [number, number];
  // The gallery's caption (the look only); null elsewhere.
  caption: string | null;
};
export type DeckPayload = {
  words: DeckWords;
  // Keenan's photos by slot key (lib/deck.ts DECK_SLOTS), in his order
  // within each slot.
  photos: Record<string, DeckPhoto[]>;
  // The gallery's photos across its slots, in Keenan's one order (warm
  // whites first, the holiday look last).
  gallery: DeckPhoto[];
  // The looks on offer, in order, at most six.
  looks: Look[];
  // The light picker: the photo the roofline was traced on and the trace;
  // null when the page is skipped (not traced, or that photo changed).
  picker: { photoUrl: string; trace: Trace } | null;
  // The warranty page's company line: "Vesper Lighting, Inc., Calgary" and
  // the phone number. place is the town from the company's address.
  company: { name: string; place: string | null; phone: string };
  // settings.warranty_text word for word, and the service call fee for
  // The full warranty (null: not set, so its line is hidden).
  warranty: { text: string; serviceCallFee: number | null; gstEnabled: boolean };
};

export type MeetingPayload = {
  lead: {
    id: string;
    name: string;
    firstName: string;
    addressLine: string;
    neighbourhood: string | null;
    soffitColour: SoffitColour | null;
    // The split soffit's second colour. The setter's which-is-where note is
    // never sent to meeting mode (a field that isn't sent can't show).
    soffitColour2: SoffitColour | null;
    colourKind: "none" | "list" | "custom";
    colourText: string;
    initials: string | null;
    initialledAt: string | null;
  };
  // The deck's words, Keenan's photos, the looks and the picker (round 7).
  deck: DeckPayload;
  // For changing the colour at the table: Keenan's list (retired ones too,
  // so the lead's own still names itself), the RAL Classic names, and the
  // lead's choice as the lead page's form takes it.
  colours: {
    list: TrackColour[];
    ralNames: Record<string, string>;
    choice: string | null;
    ralCode: string | null;
  };
  mockupUrl: string | null;
  pricing: {
    pricePerFt: number;
    boxPrice: number;
    neighbourDiscount: number;
    gstEnabled: boolean;
    gstRate: number;
    gstNumber: string | null;
    rushFeePerFt: number | null;
    quoteValidDays: number;
    // The least a job can cost before GST (Settings); null = no minimum.
    minJobTotal: number | null;
  };
  draft: {
    quoteId: string;
    runs: unknown;
    boxCount: number;
    pricePerFt: number;
    boxPrice: number;
    adders: unknown;
    discounts: unknown;
    colourTiming: string | null;
    financingOffered: boolean;
    validUntil: string | null;
    // The database's updated_at for the draft.
    updatedAt: string;
  } | null;
  today: string;
};

// ---------------------------------------------------------------- the quote

export type QuoteUIState = {
  runs: QuoteRun[];
  boxCount: number;
  pricePerFt: string;
  boxPrice: string;
  // upperOnly: the line counts only while an upper run is in (quote link).
  adders: { label: string; amount: string; upperOnly?: boolean }[];
  neighbourOn: boolean;
  neighbourAmount: string;
  customDiscounts: { label: string; amount: string }[];
  colourTiming: ColourTiming | null;
  financingOffered: boolean;
  validUntil: string;
};

const moneyString = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
const parseMoney = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
};

export function defaultQuoteState(payload: MeetingPayload): QuoteUIState {
  return {
    runs: [{ name: "Front", feet: 0, level: "lower" }],
    boxCount: 1,
    pricePerFt: moneyString(payload.pricing.pricePerFt),
    boxPrice: moneyString(payload.pricing.boxPrice),
    adders: [],
    neighbourOn: false,
    neighbourAmount: moneyString(payload.pricing.neighbourDiscount),
    customDiscounts: [],
    colourTiming: payload.lead.colourKind === "custom" ? "factory_order" : payload.lead.colourKind === "list" ? "stock" : null,
    financingOffered: false,
    validUntil: defaultValidUntil(payload.today, payload.pricing.quoteValidDays),
  };
}

// A saved draft, back into the controls. Unknown jsonb is handled gently:
// anything unreadable becomes an empty list, never a crash at the table.
export function quoteStateFromDraft(draft: NonNullable<MeetingPayload["draft"]>, payload: MeetingPayload): QuoteUIState {
  const runs: QuoteRun[] = Array.isArray(draft.runs)
    ? draft.runs.flatMap((run) =>
        run && typeof run === "object" && typeof (run as QuoteRun).name === "string"
          ? [
              {
                name: String((run as QuoteRun).name).slice(0, 60),
                feet: Number((run as QuoteRun).feet) || 0,
                level: (run as QuoteRun).level === "upper" ? ("upper" as const) : ("lower" as const),
              },
            ]
          : [],
      )
    : [];
  const items = (value: unknown) =>
    Array.isArray(value)
      ? value.flatMap((item) =>
          item && typeof item === "object" && typeof (item as { label?: unknown }).label === "string"
            ? [{ label: String((item as { label: string }).label), amount: moneyString(Number((item as { amount?: unknown }).amount) || 0) }]
            : [],
        )
      : [];
  const discounts = items(draft.discounts);
  const upperOnly = new Map(
    (Array.isArray(draft.adders) ? draft.adders : []).map((item, at) => [
      at,
      Boolean(item && typeof item === "object" && (item as { upper_only?: unknown }).upper_only === true),
    ]),
  );
  const adders = items(draft.adders).map((item, at) => (upperOnly.get(at) ? { ...item, upperOnly: true } : item));
  const neighbour = discounts.find((item) => item.label === "Neighbour discount");
  return {
    runs: runs.length > 0 ? runs : [{ name: "Front", feet: 0, level: "lower" }],
    boxCount: draft.boxCount,
    pricePerFt: moneyString(draft.pricePerFt),
    boxPrice: moneyString(draft.boxPrice),
    adders,
    neighbourOn: Boolean(neighbour),
    neighbourAmount: neighbour?.amount ?? moneyString(payload.pricing.neighbourDiscount),
    customDiscounts: discounts.filter((item) => item.label !== "Neighbour discount"),
    colourTiming:
      draft.colourTiming === "stock" || draft.colourTiming === "factory_order" || draft.colourTiming === "rush"
        ? draft.colourTiming
        : defaultQuoteState(payload).colourTiming,
    financingOffered: draft.financingOffered,
    validUntil: draft.validUntil ?? defaultValidUntil(payload.today, payload.pricing.quoteValidDays),
  };
}

// The quote as one stable string, so "changed since the last save" is a
// single comparison. Only what the quote would save counts: an empty row
// or a run with no feet yet is not a change.
export function quoteFingerprint(state: QuoteUIState): string {
  return JSON.stringify([
    state.runs.filter((run) => run.feet > 0).map((run) => [run.name.trim(), Math.round(run.feet), run.level]),
    state.boxCount,
    parseMoney(state.pricePerFt),
    parseMoney(state.boxPrice),
    state.adders
      .filter((item) => item.label.trim() !== "" || parseMoney(item.amount) > 0)
      .map((item) => [item.label.trim(), parseMoney(item.amount), Boolean(item.upperOnly)]),
    state.neighbourOn ? parseMoney(state.neighbourAmount) : null,
    state.customDiscounts
      .filter((item) => parseMoney(item.amount) > 0)
      .map((item) => [item.label.trim(), parseMoney(item.amount)]),
    state.colourTiming,
    state.financingOffered,
    state.validUntil,
  ]);
}

// The UI state as the pure pricing inputs.
export function quoteInputs(state: QuoteUIState, pricing: MeetingPayload["pricing"]): QuoteInputs {
  const discounts = [
    ...(state.neighbourOn ? [{ label: "Neighbour discount", amount: parseMoney(state.neighbourAmount) }] : []),
    ...state.customDiscounts
      .filter((item) => parseMoney(item.amount) > 0)
      .map((item) => ({ label: item.label.trim() || "Discount", amount: parseMoney(item.amount) })),
  ];
  return {
    runs: state.runs,
    boxCount: state.boxCount,
    pricePerFt: parseMoney(state.pricePerFt),
    boxPrice: parseMoney(state.boxPrice),
    adders: state.adders
      .filter((item) => item.label.trim() !== "" || parseMoney(item.amount) > 0)
      .map((item) => ({
        label: item.label.trim() || "Extra work",
        amount: parseMoney(item.amount),
        ...(item.upperOnly ? { upperOnly: true } : {}),
      })),
    discounts,
    colourTiming: state.colourTiming,
    rushFeePerFt: state.colourTiming === "rush" ? pricing.rushFeePerFt : null,
    minJobTotal: pricing.minJobTotal,
    gstEnabled: pricing.gstEnabled,
    gstRate: pricing.gstRate,
  };
}

// ---------------------------------------------------------------- the iPad's copy

// The light picker's state as the meeting keeps it (round 7): the look and
// effect on screen, and whether the first light-up has played.
export type PickerStored = { look: string; effect: Effect; played: boolean };

// What the iPad keeps between reloads: the quote as it stands, when and
// in what shape it was last saved, the initials typed but not yet saved,
// and the screen it was on. Weak signal never loses any of it.
export type MeetingStored = {
  version: 1;
  quote: QuoteUIState;
  quoteId: string | null;
  savedAt: string | null;
  initialsDraft: string;
  // Optional: copies written before these existed lack them.
  savedQuote?: string | null;
  // key (round 7): the page's own key, so a reload finds the same page even
  // when the pages before it changed.
  screen?: { index: number; at: number; key?: string };
  // Round 7: the light picker's look and effect, and whether the light-up
  // has played this meeting, so a reload or auto-lock keeps them.
  picker?: PickerStored;
};

// A meeting reopened within this long picks up on the screen it left,
// so an iPad that reloads mid-meeting does not send Keenan back nine swipes.
export const RESUME_MS = 3 * 60 * 60 * 1000;

export type MeetingStart = {
  quote: QuoteUIState;
  quoteId: string | null;
  savedAt: string | null;
  // The fingerprint of the quote as last saved; null when never saved.
  savedQuote: string | null;
  initialsDraft: string;
  index: number;
  // The page the iPad was on, by key, when it picks up where it left off.
  screenKey: string | null;
  // The light picker as it was this meeting; null for a fresh open or a
  // new meeting (Warm white, Steady, the light-up to play).
  picker: PickerStored | null;
};

// The picker's stored state, kept only while it still makes sense: an
// effect the control offers and a look still on offer. Otherwise the page
// opens as every meeting does, on its first look, Steady.
export function pickerFromStored(value: unknown, looks: Pick<Look, "key">[]): PickerStored | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const effect = EFFECTS.find((item) => item.key === raw.effect)?.key;
  if (typeof raw.look !== "string" || !effect || !looks.some((look) => look.key === raw.look)) return null;
  return { look: raw.look, effect, played: raw.played === true };
}

// Where the meeting starts: the iPad's own copy, which may hold edits made
// without signal, unless the server has a save the iPad never saw (made on
// another device). Then the server's, so the price in the room is current.
// Opened fresh from Tonight or the lead page, it starts at the cover; only
// a reload mid-meeting picks up on the screen it left. The light picker
// does the same (round 7 review, Keenan): a fresh open (#start) opens it on
// Warm white, Steady, with the light-up to play the first time the page is
// reached, so a check from prep or the truck before the visit never spends
// the reveal; only a reload or auto-lock mid-meeting (within RESUME_MS of
// the last screen) keeps its look, effect and played light-up.
export function startingPoint(
  payload: MeetingPayload,
  stored: MeetingStored | null,
  now: number,
  fresh = false,
): MeetingStart {
  const { draft } = payload;
  const fromServer = draft ? quoteStateFromDraft(draft, payload) : null;
  const serverNewer =
    draft !== null && (!stored?.savedAt || Date.parse(draft.updatedAt) > Date.parse(stored.savedAt));
  const sameMeeting = Boolean(stored?.screen && now - stored.screen.at < RESUME_MS);
  const index = !fresh && sameMeeting && stored?.screen ? stored.screen.index : 0;
  const screenKey = !fresh && sameMeeting && typeof stored?.screen?.key === "string" ? stored.screen.key : null;
  const picker = !fresh && sameMeeting ? pickerFromStored(stored?.picker, payload.deck.looks) : null;
  const initialsDraft = stored?.initialsDraft ?? "";
  const where = { index, screenKey, picker };

  if (stored && !serverNewer) {
    return {
      quote: stored.quote,
      quoteId: stored.quoteId ?? draft?.quoteId ?? null,
      savedAt: stored.savedAt,
      savedQuote: stored.savedQuote ?? (fromServer ? quoteFingerprint(fromServer) : null),
      initialsDraft,
      ...where,
    };
  }
  if (draft && fromServer) {
    return {
      quote: fromServer,
      quoteId: draft.quoteId,
      savedAt: draft.updatedAt,
      savedQuote: quoteFingerprint(fromServer),
      initialsDraft,
      ...where,
    };
  }
  return { quote: defaultQuoteState(payload), quoteId: null, savedAt: null, savedQuote: null, initialsDraft, ...where };
}
