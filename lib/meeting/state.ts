// Meeting mode's state (M5), kept pure: the payload the page hands the
// iPad, the quote as the controls hold it, and where a meeting starts when
// the iPad already holds a copy. No React and no network, so it is unit
// tested like the pricing it feeds.

import type { SoffitColour } from "@/lib/leads/status";
import type { TrackColour } from "@/lib/leads/track-colour";
import { defaultValidUntil, guessRunPart, RUN_PARTS, type ColourTiming, type QuoteInputs, type QuoteRun, type RunPart } from "@/lib/pricing";
import { EFFECTS, type DeckWords, type Effect, type Look, type Trace } from "@/lib/deck";
import { cleanPositions, offersForSave, parseOffers, type QuoteOffer } from "@/lib/quotes/offers";

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
  // Round 9: their Front photo, signed, for Your house when the roofline
  // isn't traced and there is no mockup; null otherwise.
  frontPhotoUrl?: string | null;
  pricing: {
    pricePerFt: number;
    boxPrice: number;
    neighbourDiscount: number;
    gstEnabled: boolean;
    gstRate: number;
    gstNumber: string | null;
    // Settings' flat rush colour fee and upper access amounts (2026-11-04),
    // copied onto each new quote.
    rushFee: number | null;
    upperAccessFee: number | null;
    upperGableAccessFee: number | null;
    // How many days a new quote's prices are held (120).
    priceHoldDays: number;
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
    // The draft's own flat rush colour fee and upper access amounts; null
    // on a quote made before 2026-11-04.
    rushFee: number | null;
    upperAccessFee: number | null;
    upperGableAccessFee: number | null;
    financingOffered: boolean;
    validUntil: string | null;
    // Round 9 (2026-11-10): the offers (quotes.offers, raw), the option
    // chosen at the table (quotes.meeting_offer) and the install day picked
    // at the table (quotes.meeting_install_on).
    offers: unknown;
    meetingOffer: string | null;
    meetingInstallOn: string | null;
    // The quote's own minimum job total (quotes.min_job_total), so a later
    // change in Settings never alters it; left out, Settings' minimum.
    minJobTotal?: number | null;
    // Round 9: the lead's accepted quote stands in for the draft while it is
    // accepted, read only (its prices are locked until the acceptance is
    // undone on the lead page), with the option they said yes to.
    accepted?: boolean;
    acceptedOffer?: string | null;
    // The database's updated_at for the draft.
    updatedAt: string;
  } | null;
  today: string;
};

export type QuoteDraft = NonNullable<MeetingPayload["draft"]>;

// What a quote needs from the meeting's payload: the prices from Settings,
// today, and the lead's track colour. The lead page's quote editor builds
// the same from its own reads (lib/quotes/editor-data.ts), so both open the
// same quote the same way.
export type QuoteContext = {
  pricing: MeetingPayload["pricing"];
  today: string;
  lead: Pick<MeetingPayload["lead"], "colourKind" | "colourText">;
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
  // This quote's own flat rush colour fee and upper access amounts, as
  // typed; "" is none (a quote made before 2026-11-04, or cleared).
  rushFee: string;
  upperAccessFee: string;
  upperGableAccessFee: string;
  financingOffered: boolean;
  validUntil: string;
  // Round 9 (Keenan, 2026-11-10): the offers on this quote, each picking
  // which runs it covers (lib/quotes/offers.ts). Empty means one full wrap
  // covering every run; read them through quoteOffers().
  offers: QuoteOffer[];
  // The option the customer chose at the table (an offer id), or null; it
  // saves as quotes.meeting_offer and prefills round 8's Accepted sheet.
  chosenOffer: string | null;
  // The install day picked at the table (YYYY-MM-DD), or null; it saves as
  // quotes.meeting_install_on and is never written to the lead before
  // Accepted.
  installOn: string | null;
  // This quote's own minimum job total, as typed ("" is none). Left out
  // (a new quote, or an iPad copy from before round 9), Settings' minimum.
  minJobTotal?: string;
};

// The offers as shown: an empty list is one full wrap over every run.
export function quoteOffers(state: Pick<QuoteUIState, "offers" | "runs">): QuoteOffer[] {
  return parseOffers(state.offers, state.runs.length);
}

// One colour rule (CLAUDE.md, and the five seats, 2026-11-10): White is the
// only stock colour. Any other list colour, and Custom, is made to order:
// spring (factory_order) unless rush was already chosen. No colour: none.
export function colourTimingFor(
  kind: "list" | "custom" | "none",
  colourText: string,
  current: ColourTiming | null,
): ColourTiming | null {
  if (kind === "none") return null;
  if (kind === "list" && /^white\b/i.test(colourText.trim())) return "stock";
  return current === "rush" ? "rush" : "factory_order";
}

const moneyString = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));
const parseMoney = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : 0;
};
// A fee that may be unset: "" (or a copy from before it existed) is none.
const moneyOrNone = (value: string | undefined) => ((value ?? "").trim() === "" ? null : parseMoney(value ?? ""));
const feeString = (value: number | null | undefined) => (value === null || value === undefined ? "" : moneyString(value));

// This quote's flat rush colour fee as typed, whatever the colour timing:
// the quote keeps it either way, so the customer's link can name it and
// switching to rush at the table finds it. Null: none.
export function quoteRushFee(state: QuoteUIState): number | null {
  return moneyOrNone(state.rushFee);
}

// A run's part as stored, or the guess from its name.
function partOf(value: unknown, name: string): RunPart {
  return typeof value === "string" && (RUN_PARTS as readonly string[]).includes(value) ? (value as RunPart) : guessRunPart(name);
}

export function defaultQuoteState(payload: QuoteContext): QuoteUIState {
  return {
    runs: [{ name: "Front", feet: 0, level: "lower", part: "eave" }],
    boxCount: 1,
    pricePerFt: moneyString(payload.pricing.pricePerFt),
    boxPrice: moneyString(payload.pricing.boxPrice),
    adders: [],
    neighbourOn: false,
    neighbourAmount: moneyString(payload.pricing.neighbourDiscount),
    customDiscounts: [],
    colourTiming: colourTimingFor(payload.lead.colourKind, payload.lead.colourText, null),
    rushFee: feeString(payload.pricing.rushFee),
    upperAccessFee: feeString(payload.pricing.upperAccessFee),
    upperGableAccessFee: feeString(payload.pricing.upperGableAccessFee),
    financingOffered: false,
    validUntil: defaultValidUntil(payload.today, payload.pricing.priceHoldDays),
    offers: [],
    chosenOffer: null,
    installOn: null,
  };
}

// A saved draft, back into the controls. Unknown jsonb is handled gently:
// anything unreadable becomes an empty list, never a crash at the table.
export function quoteStateFromDraft(draft: QuoteDraft, payload: QuoteContext): QuoteUIState {
  const runs: QuoteRun[] = Array.isArray(draft.runs)
    ? draft.runs.flatMap((run) =>
        run && typeof run === "object" && typeof (run as QuoteRun).name === "string"
          ? [
              {
                name: String((run as QuoteRun).name).slice(0, 60),
                feet: Number((run as QuoteRun).feet) || 0,
                level: (run as QuoteRun).level === "upper" ? ("upper" as const) : ("lower" as const),
                part: partOf((run as QuoteRun).part, String((run as QuoteRun).name)),
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
    runs: runs.length > 0 ? runs : [{ name: "Front", feet: 0, level: "lower", part: "eave" }],
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
    rushFee: feeString(draft.rushFee),
    upperAccessFee: feeString(draft.upperAccessFee),
    upperGableAccessFee: feeString(draft.upperGableAccessFee),
    financingOffered: draft.financingOffered,
    validUntil: draft.validUntil ?? defaultValidUntil(payload.today, payload.pricing.priceHoldDays),
    // Saved offers as they are; an empty list stays empty (one full wrap).
    offers: Array.isArray(draft.offers) && draft.offers.length > 0 ? parseOffers(draft.offers, runs.length) : [],
    // An accepted quote shows the option they said yes to as the choice.
    chosenOffer: chosenFromDraft(draft),
    installOn: typeof draft.meetingInstallOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(draft.meetingInstallOn) ? draft.meetingInstallOn : null,
    ...(draft.minJobTotal !== undefined ? { minJobTotal: feeString(draft.minJobTotal) } : {}),
  };
}

function chosenFromDraft(draft: QuoteDraft): string | null {
  const id = draft.accepted && draft.acceptedOffer ? draft.acceptedOffer : draft.meetingOffer;
  return typeof id === "string" && id !== "" ? id : null;
}

// The quote meeting mode and the lead page's editor open (round 9): the
// lead's accepted quote while it has one (read only), otherwise its newest
// draft. One draft per lead: every save reuses it. Rows come newest first.
export function pickEditableQuote<T extends { status: string }>(rows: readonly T[]): T | null {
  return rows.find((row) => row.status === "accepted") ?? rows.find((row) => row.status === "draft") ?? null;
}

// An iPad copy as it is read back: one written before round 9 has no
// offers, choice or install day, and is read as one full wrap with neither.
export function storedQuote(quote: QuoteUIState): QuoteUIState {
  return {
    ...quote,
    offers: Array.isArray(quote.offers) ? quote.offers : [],
    chosenOffer: typeof quote.chosenOffer === "string" && quote.chosenOffer !== "" ? quote.chosenOffer : null,
    installOn: typeof quote.installOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(quote.installOn) ? quote.installOn : null,
  };
}

// The minimum job total a quote prices with: its own once it has one, else
// Settings'.
export function quoteMinimum(state: Pick<QuoteUIState, "minJobTotal">, pricing: Pick<MeetingPayload["pricing"], "minJobTotal">): number | null {
  return state.minJobTotal === undefined ? pricing.minJobTotal : moneyOrNone(state.minJobTotal);
}

// The quote as one stable string, so "changed since the last save" is a
// single comparison. Only what the quote would save counts: an empty row
// or a run with no feet yet is not a change.
export function quoteFingerprint(state: QuoteUIState): string {
  return JSON.stringify([
    state.runs.filter((run) => run.feet > 0).map((run) => [run.name.trim(), Math.round(run.feet), run.level, run.part ?? guessRunPart(run.name)]),
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
    moneyOrNone(state.rushFee),
    moneyOrNone(state.upperAccessFee),
    moneyOrNone(state.upperGableAccessFee),
    state.financingOffered,
    state.validUntil,
    offersForSave(state.offers, state.runs.length).map((offer) => [offer.id, offer.name, cleanPositions(state.runs.length, offer.runs), offer.boxes ?? null]),
    state.chosenOffer,
    state.installOn,
    state.minJobTotal === undefined ? "settings" : moneyOrNone(state.minJobTotal),
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
    rushFee: state.colourTiming === "rush" ? moneyOrNone(state.rushFee) : null,
    upperAccessFee: moneyOrNone(state.upperAccessFee),
    upperGableAccessFee: moneyOrNone(state.upperGableAccessFee),
    minJobTotal: quoteMinimum(state, pricing),
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

  // An accepted quote is locked: the server's copy always, whatever the
  // iPad holds, so the room sees what was agreed.
  if (stored && !serverNewer && !draft?.accepted) {
    return {
      quote: storedQuote(stored.quote),
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
