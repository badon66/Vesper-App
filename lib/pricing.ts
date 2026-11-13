// Quote math (M5). One pure function prices the whole quote, used by the
// iPad live and by the server when a draft is saved, so the number the
// customer watched is the number that is stored. Everything is worked in
// cents and rounded per line, so the breakdown always adds up to the total.
//
// The formula (CLAUDE.md): total = (total feet x price per foot)
// + (boxes x box price) + upper access + the rush fee + extra charges
// - discounts, raised to the minimum job, then GST if enabled. The rush fee
// is an offer's own switch (round 18, Keenan, 2026-11-12), named "Rush fee"
// with nothing about the colour. Upper access (2026-11-04) follows the runs that
// are on: none without an upper run, the upper gable amount when an upper
// gable is on, otherwise the upper amount. A quote made before then has no
// amounts, so neither line.
//
// The quote link (2026-11-02) runs the same function on the customer's
// phone and on the server, over the runs they have switched on: an
// extra-work line marked "only with upper runs" counts only while an
// upper run is in, and when the total before GST falls below the minimum
// job total it rises to the minimum with a line saying so.

// The part of the house a run lights (2026-11-04), beside its level, so the
// house diagram knows what to light and upper access knows an upper gable.
export const RUN_PARTS = ["eave", "gable", "garage", "porch", "sides", "other"] as const;
export type RunPart = (typeof RUN_PARTS)[number];
// Round 11 (quoting by area, Keenan, 2026-11-11): a run is an area of the
// house. area says which view it is on, gable whether it is a gable, rate
// Keenan's own price a foot for it, flat a flat price for it instead; a run
// from before this round has none of them and prices as it always did.
// Track types (Keenan, 2026-11-11): Hat track is the standard (the quote's
// price a foot); an area on Double or J track is priced at that track's
// price a foot, which the quote copies from Settings onto the run
// (trackRate) when Keenan picks it, so a later change in Settings never
// alters the quote. Keenan's own rate or a flat price on the area still
// wins. A run from before this has no track and is Hat track.
export const TRACK_TYPES = ["hat", "double", "j"] as const;
export type TrackType = (typeof TRACK_TYPES)[number];
// Round 18 (Keenan, 2026-11-12): Hat track reads "Standard track", and J
// track is "L track (back track)" everywhere (the stored value stays "j").
export const TRACK_NAMES: Record<TrackType, string> = { hat: "Standard track", double: "Double track", j: "L track (back track)" };

// Round 18 (Keenan, 2026-11-12): Left side and Right side are views of
// their own ("sides" stays for an old quote's one Sides number until Keenan
// splits it); view is the name Keenan gave the run's view on this quote
// ("Street side" for Front), kept on each of its runs; count is how many
// gables a gable line holds (the feet are their total). Neither changes a
// price. The run's name is its line's name: the standard one until Keenan
// renames it (lib/quotes/areas.ts).
export type QuoteRun = {
  name: string;
  feet: number;
  level: "lower" | "upper";
  part?: RunPart | null;
  area?: "front" | "back" | "left" | "right" | "sides" | "other" | null;
  gable?: boolean | null;
  rate?: number | null;
  flat?: number | null;
  track?: TrackType | null;
  trackRate?: number | null;
  view?: string | null;
  count?: number | null;
};

// A run's track: Double or J when set, otherwise Hat track.
export function runTrack(run: Pick<QuoteRun, "track">): TrackType {
  return run.track === "double" || run.track === "j" ? run.track : "hat";
}

// A stored run's track fields, read gently: nothing for Hat track, else
// the track and its price a foot when it has a usable one.
export function trackFields(run: unknown): Pick<QuoteRun, "track" | "trackRate"> {
  if (!run || typeof run !== "object") return {};
  const record = run as Record<string, unknown>;
  const track = record.track === "double" || record.track === "j" ? record.track : null;
  if (track === null) return {};
  const rate = Number(record.trackRate);
  return Number.isFinite(rate) && rate > 0 ? { track, trackRate: Math.round(rate * 100) / 100 } : { track };
}
// percent (Black Friday follows each option, Keenan, 2026-11-11): a
// discount line with a usable percent (more than 0, at most 90) is worked
// out on the selection being priced, so every option gets its own percent
// off; amount then keeps the dollars it came to on the option chosen when
// it was saved, for anything that reads amount alone. Without a percent the
// line is a fixed amount.
export type QuoteLineItem = { label: string; amount: number; percent?: number | null };
// Extra work. upperOnly: the line counts only while an upper run is in.
export type QuoteAdder = QuoteLineItem & { upperOnly?: boolean };
export type ColourTiming = "stock" | "factory_order" | "rush";

export type QuoteInputs = {
  runs: QuoteRun[];
  boxCount: number;
  pricePerFt: number;
  boxPrice: number;
  adders: QuoteAdder[];
  discounts: QuoteLineItem[];
  colourTiming: ColourTiming | null;
  // Round 18 (Keenan, 2026-11-12): the rush fee is an offer's own switch
  // (lib/quotes/offers.ts priceOffer passes it here); more than 0 adds the
  // "Rush fee" line, whatever the colour. Null or 0: no line.
  rushFee: number | null;
  // The two upper access amounts this quote uses; null on a quote made
  // before 2026-11-04, which has no upper access line.
  upperAccessFee?: number | null;
  upperGableAccessFee?: number | null;
  // The least the job can cost before GST; null or 0 means no minimum.
  minJobTotal?: number | null;
  // Round 11: the upper access amount Keenan typed over for this option
  // (0 included), or null for the automatic amount from the runs.
  upperAccess?: number | null;
  gstEnabled: boolean;
  gstRate: number;
  // The track colour's name, for the rush colour line's detail ("Brown
  // track, made to order this season", the colour page's own words, round
  // 9); left out, the detail says less.
  colourName?: string | null;
  // Each area's name on its line; left out, the run's own name. Callers
  // pass lib/quotes/areas.ts runDisplayName, so a quote by area reads
  // "Front lower" and "Front upper", Keenan's own names, and "Upper gables
  // (2)", never two lines both called "Front".
  areaName?: (run: QuoteRun) => string;
  // Round 18: the controller line's words from Settings (deck lines
  // controller_label and controller_detail); left out, the defaults.
  controller?: { label: string; detail: string } | null;
};

export type QuoteLine = {
  label: string;
  detail: string | null;
  // In dollars, already rounded to the cent. Discounts are negative.
  amount: number;
  // Round 18: a track's line ("Standard track") holds every area on that
  // track, each with its feet and price, for the drop-down under it. The
  // line's amount is their sum to the cent.
  track?: TrackType;
  areas?: QuoteLine[];
};

export type QuoteTotals = {
  totalFeet: number;
  lines: QuoteLine[];
  subtotal: number;
  gst: number;
  total: number;
  // True when the total was raised to the minimum job total.
  minimumApplied: boolean;
  // The total before GST and before any rise to the minimum, so a
  // breakdown can show the lines' own sum above the top-up.
  beforeMinimum: number;
};

const toCents = (dollars: number) => Math.round(dollars * 100);
const toDollars = (cents: number) => cents / 100;

// A run's feet: whole feet, measured at the house. Anything unusable is 0.
export function cleanFeet(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(10_000, Math.round(value));
}

export function totalFeet(runs: QuoteRun[]): number {
  return runs.reduce((sum, run) => sum + cleanFeet(run.feet), 0);
}

// Whether any run with feet is on the upper level.
export function hasUpperRun(runs: QuoteRun[]): boolean {
  return runs.some((run) => run.level === "upper" && cleanFeet(run.feet) > 0);
}

// A run's part as stored, or a guess from its name for a run saved before
// parts existed (the quote builder makes the same guess as a starting
// point, and Keenan can change it).
export function guessRunPart(name: string): RunPart {
  const n = name.toLowerCase();
  if (/porch|veranda|entry|entrance/.test(n)) return "porch";
  if (/\bsides?\b/.test(n)) return "sides";
  if (/gable|peak/.test(n)) return "gable";
  if (/garage/.test(n)) return "garage";
  if (/eave|front|back|rear|roofline|fascia/.test(n)) return "eave";
  return "other";
}

export function runPart(run: QuoteRun): RunPart {
  return run.part && (RUN_PARTS as readonly string[]).includes(run.part) ? run.part : guessRunPart(run.name);
}

// The upper access amount for the runs that are on, or null for no line.
export function upperAccessAmount(
  runs: QuoteRun[],
  fees: { upperAccessFee?: number | null; upperGableAccessFee?: number | null },
): number | null {
  const upper = runs.filter((run) => run.level === "upper" && cleanFeet(run.feet) > 0);
  if (upper.length === 0) return null;
  return usable(upper.some((run) => runPart(run) === "gable") ? fees.upperGableAccessFee : fees.upperAccessFee);
}

// The breakdown's names for the two lines added on 2026-11-04, settled in
// the quote link debate (decisions.md): every dollar line says what it is
// for where it appears, and never says "level", which reads as a basement.
export const UPPER_ACCESS_LABEL = "Upper roof access";
// Round 18 (Keenan, 2026-11-12): "Rush fee", with nothing about the colour.
export const RUSH_FEE_LABEL = "Rush fee";
// Round 18: the control box says what it is, in Keenan's words from
// Settings; these are the words until he changes them.
export const CONTROLLER_LABEL = "Smart controller and power supply";
export const CONTROLLER_DETAIL = "600 W, Bluetooth and Wi-Fi, all-weather, installs indoors or outdoors. Run it from the app on your phone.";

const usable = (amount: number | null | undefined): number | null =>
  amount !== null && amount !== undefined && Number.isFinite(amount) && amount > 0 ? amount : null;

// "For work up high: $200, or $400 with an upper gable": why the amount is what it is, so a
// switch that moves it never looks like a trick. Only when both are set.
export function upperAccessDetail(fees: { upperAccessFee?: number | null; upperGableAccessFee?: number | null }): string | null {
  const upper = usable(fees.upperAccessFee);
  const gable = usable(fees.upperGableAccessFee);
  if (upper === null || gable === null || upper === gable) return null;
  return `For work up high: ${formatMoney(upper)}, or ${formatMoney(gable)} with an upper gable`;
}

// The runs a customer has switched on: positions into the quote's runs, in
// the quote's order, or every run when positions is null. Positions that
// aren't on the quote are ignored.
export function selectRuns(runs: QuoteRun[], positions: readonly number[] | null): QuoteRun[] {
  if (positions === null) return runs;
  const wanted = new Set(positions);
  return runs.filter((_, at) => wanted.has(at));
}

// A discount's percent when it is usable: a number more than 0 and at most
// 90. Anything else (none, 0, more than 90, not a number) is a fixed line.
export function usablePercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 90 ? value : null;
}

// "15" or "12.5": a percent as a line says it.
export function percentWords(percent: number): string {
  return Number.isInteger(percent) ? String(percent) : String(Math.round(percent * 10) / 10);
}

// percent of an amount in cents, to the cent, never more than the amount
// and never below zero.
export function percentOfCents(cents: number, percent: number): number {
  if (cents <= 0) return 0;
  return Math.min(cents, Math.max(0, Math.round((cents * percent) / 100)));
}

// Each discount's cents as priceQuote takes it off, in the discounts' own
// order: a fixed line its amount (never below zero), a percent line its
// percent of the gross (lights, boxes, upper access, rush and extra work)
// less the fixed lines, never below zero.
function resolveDiscountCents(discounts: readonly QuoteLineItem[], grossCents: number): number[] {
  const fixedCents = discounts.reduce(
    (sum, discount) => (usablePercent(discount.percent) === null ? sum + toCents(Math.max(0, discount.amount)) : sum),
    0,
  );
  const base = Math.max(0, grossCents - fixedCents);
  return discounts.map((discount) => {
    const percent = usablePercent(discount.percent);
    return percent === null ? toCents(Math.max(0, discount.amount)) : percentOfCents(base, percent);
  });
}

// The quote's discounts with each percent line's amount as priceQuote works
// it out for these inputs (their runs and boxes), keeping its percent; fixed
// lines as they are. What the acceptance stores on the accepted option, and
// what the commission preview reads per option.
export function resolveDiscounts(inputs: QuoteInputs): QuoteLineItem[] {
  if (!inputs.discounts.some((discount) => usablePercent(discount.percent) !== null)) return inputs.discounts.map((d) => ({ ...d }));
  const lines = priceQuote({ ...inputs, minJobTotal: null, gstEnabled: false });
  const gross = lines.lines.reduce((sum, line) => (line.amount > 0 ? sum + toCents(line.amount) : sum), 0);
  const cents = resolveDiscountCents(inputs.discounts, gross);
  return inputs.discounts.map((discount, at) =>
    usablePercent(discount.percent) === null ? { ...discount } : { ...discount, amount: toDollars(cents[at]) },
  );
}

const positive = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value > 0;

// A run's price a foot: Keenan's own rate for it when set (more than 0),
// else its track's price a foot when it is on Double or J track and the
// quote has that price, else the quote's (Hat track).
export function runRateOf(run: Pick<QuoteRun, "rate" | "track" | "trackRate">, pricePerFt: number): number {
  if (positive(run.rate)) return run.rate;
  if (runTrack(run) !== "hat" && positive(run.trackRate)) return run.trackRate;
  return pricePerFt;
}

// A run's flat price when set (0 or more), else null.
export function runFlatOf(run: Pick<QuoteRun, "flat">): number | null {
  return typeof run.flat === "number" && Number.isFinite(run.flat) && run.flat >= 0 ? run.flat : null;
}

// What a run's lights cost, in cents: its flat price, or its feet at its
// rate (its own, or the quote's). The commission counts the same (lib/pay/
// commission.ts and the database's quote_commission_base_boxes).
export function runLightsCents(run: Pick<QuoteRun, "feet" | "rate" | "flat" | "track" | "trackRate">, pricePerFt: number): number {
  const flat = runFlatOf(run);
  if (flat !== null) return toCents(flat);
  return cleanFeet(run.feet) * toCents(runRateOf(run, pricePerFt));
}

// The lights by track (round 18, Keenan, 2026-11-12): one line per track
// the runs use, Standard track first, then Double track, then L track (back
// track). Each says its feet, its price a foot when every area on it shares
// one ("165 ft at $24 a foot", else just the feet), and its total; its areas
// ride along for the drop-down under it, each with its feet (and its price a
// foot when the track's areas differ) and its price. A run with no feet and
// no flat price isn't on the house. A quote with nothing measured still
// shows Standard track at 0 ft, as the old "Track and lights" line did. The
// cents per run are the same as ever (runLightsCents), so no total moves.
export function trackLines(
  runs: QuoteRun[],
  pricePerFt: number,
  nameOf: (run: QuoteRun) => string = (run) => run.name.trim(),
): { lines: QuoteLine[]; cents: number } {
  type Section = { feet: number; cents: number; rates: Set<number>; flat: boolean; runs: { run: QuoteRun; feet: number; flat: number | null; cents: number }[] };
  const sections = new Map<TrackType, Section>();
  let cents = 0;
  for (const run of runs) {
    const feet = cleanFeet(run.feet);
    const flat = runFlatOf(run);
    if (feet <= 0 && flat === null) continue;
    const track = runTrack(run);
    const runCents = runLightsCents(run, pricePerFt);
    cents += runCents;
    const section = sections.get(track) ?? { feet: 0, cents: 0, rates: new Set<number>(), flat: false, runs: [] };
    section.feet += feet;
    section.cents += runCents;
    if (flat !== null) section.flat = true;
    else section.rates.add(runRateOf(run, pricePerFt));
    section.runs.push({ run, feet, flat, cents: runCents });
    sections.set(track, section);
  }
  if (sections.size === 0) {
    return {
      lines: [{ label: TRACK_NAMES.hat, detail: `0 ft at ${formatMoney(pricePerFt)} a foot`, amount: 0, track: "hat", areas: [] }],
      cents: 0,
    };
  }
  const lines = TRACK_TYPES.flatMap((track): QuoteLine[] => {
    const section = sections.get(track);
    if (!section) return [];
    const shared = !section.flat && section.rates.size === 1 ? [...section.rates][0] : null;
    // Where the track line gives no one rate, each area names its own.
    const mixed = shared === null;
    const areas = section.runs.map(({ run, feet, flat, cents: runCents }): QuoteLine => {
      const detail =
        flat !== null ? (feet > 0 ? `${feet} ft, flat price` : "Flat price") : mixed ? `${feet} ft at ${formatMoney(runRateOf(run, pricePerFt))} a foot` : `${feet} ft`;
      return { label: nameOf(run).trim() || "Area", detail, amount: toDollars(runCents) };
    });
    return [
      {
        label: TRACK_NAMES[track],
        detail: shared !== null ? `${section.feet} ft at ${formatMoney(shared)} a foot` : `${section.feet} ft`,
        amount: toDollars(section.cents),
        track,
        areas,
      },
    ];
  });
  return { lines, cents };
}

// The lights lines one area at a time (round 17), kept for anything that
// wants a flat list: every area under its own name, its feet and its track
// when it isn't Standard track, at what it costs. The same cents per run.
export function areaLines(
  runs: QuoteRun[],
  pricePerFt: number,
  nameOf: (run: QuoteRun) => string = (run) => run.name.trim(),
): { lines: QuoteLine[]; cents: number } {
  const lines: QuoteLine[] = [];
  let cents = 0;
  for (const run of runs) {
    const feet = cleanFeet(run.feet);
    const flat = runFlatOf(run);
    if (feet <= 0 && flat === null) continue;
    const runCents = runLightsCents(run, pricePerFt);
    cents += runCents;
    const track = runTrack(run);
    const parts = [feet > 0 ? `${feet} ft` : null, track !== "hat" ? TRACK_NAMES[track] : null, feet <= 0 && flat !== null ? "Flat price" : null].filter(Boolean);
    lines.push({ label: nameOf(run).trim() || "Area", detail: parts.join(", ") || null, amount: toDollars(runCents) });
  }
  return { lines, cents };
}

// Every line of a breakdown with each track's areas in place of the track's
// own line: what a flat list (a change list, a test) compares.
export function flatLines(lines: readonly QuoteLine[]): QuoteLine[] {
  return lines.flatMap((line) => (line.areas ? line.areas : [line]));
}

export function priceQuote(inputs: QuoteInputs): QuoteTotals {
  const feet = totalFeet(inputs.runs);
  const lines: QuoteLine[] = [];

  const lights = trackLines(inputs.runs, inputs.pricePerFt, inputs.areaName);
  const trackCents = lights.cents;
  lines.push(...lights.lines);

  const boxes = Math.max(0, Math.round(inputs.boxCount));
  const boxCents = toCents(inputs.boxPrice) * boxes;
  if (boxes > 0) {
    // Round 18: the controller says what it is, in Keenan's words.
    const label = inputs.controller?.label.trim() || CONTROLLER_LABEL;
    const detail = inputs.controller ? inputs.controller.detail.trim() : CONTROLLER_DETAIL;
    lines.push({
      label: boxes === 1 ? label : `${label} (${boxes})`,
      detail: boxes === 1 ? detail || null : [`${boxes} at ${formatMoney(inputs.boxPrice)}.`, detail].filter(Boolean).join(" "),
      amount: toDollars(boxCents),
    });
  }

  // Upper access: the amount Keenan typed over for this option (round 11;
  // 0 means no line), else the automatic amount from the runs.
  let accessCents = 0;
  const typed = inputs.upperAccess;
  const overridden = typeof typed === "number" && Number.isFinite(typed) && typed >= 0;
  const access = overridden ? (typed > 0 ? typed : null) : upperAccessAmount(inputs.runs, inputs);
  if (access !== null) {
    accessCents = toCents(access);
    lines.push({ label: UPPER_ACCESS_LABEL, detail: overridden ? null : upperAccessDetail(inputs), amount: toDollars(accessCents) });
  }

  // Round 18: an offer's own rush fee, with nothing about the colour.
  let rushCents = 0;
  if (inputs.rushFee !== null && Number.isFinite(inputs.rushFee) && inputs.rushFee > 0) {
    rushCents = toCents(inputs.rushFee);
    lines.push({ label: RUSH_FEE_LABEL, detail: null, amount: toDollars(rushCents) });
  }

  let adderCents = 0;
  const upper = hasUpperRun(inputs.runs);
  for (const adder of inputs.adders) {
    if (adder.upperOnly && !upper) continue;
    const cents = toCents(Math.max(0, adder.amount));
    if (cents === 0 && adder.label.trim() === "") continue;
    adderCents += cents;
    lines.push({ label: adder.label.trim() || "Extra work", detail: null, amount: toDollars(cents) });
  }

  // Fixed discounts first, then each percent line on what is left of the
  // lights, boxes, upper access, rush and extra work after them.
  const resolved = resolveDiscountCents(inputs.discounts, trackCents + boxCents + accessCents + rushCents + adderCents);
  let discountCents = 0;
  inputs.discounts.forEach((discount, at) => {
    const cents = resolved[at];
    if (cents === 0) return;
    discountCents += cents;
    const percent = usablePercent(discount.percent);
    lines.push({
      label: discount.label.trim() || "Discount",
      detail: percent !== null ? `${percentWords(percent)}% off` : null,
      amount: -toDollars(cents),
    });
  });

  // A pile of discounts can never make the house owe less than nothing.
  let subtotalCents = Math.max(0, trackCents + boxCents + accessCents + rushCents + adderCents - discountCents);

  // Below the minimum job total, the total rises to the minimum, and a
  // line says so, so the breakdown still adds up.
  // The line names what the amount is: the top-up to the minimum.
  const minimum = inputs.minJobTotal ?? 0;
  const minCents = Number.isFinite(minimum) && minimum > 0 ? toCents(minimum) : 0;
  const beforeMinimumCents = subtotalCents;
  const minimumApplied = minCents > subtotalCents;
  if (minimumApplied) {
    lines.push({
      label: `To reach our ${formatMoney(toDollars(minCents))} minimum`,
      detail: null,
      amount: toDollars(minCents - subtotalCents),
    });
    subtotalCents = minCents;
  }

  const gstCents = inputs.gstEnabled ? Math.round(subtotalCents * inputs.gstRate) : 0;

  return {
    totalFeet: feet,
    lines,
    subtotal: toDollars(subtotalCents),
    gst: toDollars(gstCents),
    total: toDollars(subtotalCents + gstCents),
    minimumApplied,
    beforeMinimum: toDollars(beforeMinimumCents),
  };
}

// "$3,450" or "$3,427.50": cents show only when they exist.
export function formatMoney(amount: number): string {
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = cents % 100 === 0;
  const text = (cents / 100).toLocaleString("en-CA", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${amount < 0 ? "-" : ""}$${text}`;
}

// What any screen shows for a total: "$3,450 + GST" while GST is enabled,
// the price alone while it is off. No screen ever shows a GST dollar
// figure; that is for the PDF (take 2).
export function screenTotal(subtotal: number, gstEnabled: boolean): string {
  return gstEnabled ? `${formatMoney(subtotal)} + GST` : formatMoney(subtotal);
}

// A new quote's price-held-until date: price_hold_days out (120 since
// 2026-11-04), as a Calgary calendar date (YYYY-MM-DD).
export function defaultValidUntil(today: string, holdDays: number): string {
  const [year, month, day] = today.split("-").map(Number);
  const days = Number.isFinite(holdDays) ? Math.min(365, Math.max(1, Math.round(holdDays))) : 120;
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
