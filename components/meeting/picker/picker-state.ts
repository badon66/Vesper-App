import { EFFECTS, MAX_ACTIVE_LOOKS, type Effect, type Look } from "@/lib/deck";
import { effectAnimates } from "@/lib/lights/effects";
import { WARM_WHITE } from "@/lib/lights/looks";
import { MOTION } from "@/lib/motion";

// The light picker's state, kept pure (round 7, light_picker.effects and
// controls, and the motion section's picker rules), so every rule is unit
// tested: which look and effect the page opens on, what a tap changes, the
// first arrival's light-up, when Twinkle and Chase may run, and which touch
// turns the page. components/meeting/picker-page.tsx is its only user.
//
// CONTRACT
//   PickerChoice                 { look, effect, played }: what MeetingStored.picker holds
//   pickerLooks(looks)           the looks on offer: on, in order, at most six
//                                (Warm white alone if Settings has none)
//   initialChoice(looks, stored) Warm white, Steady, unplayed, unless the iPad
//                                holds this meeting's own choice
//   resolveLook(looks, key)      the look a key names, else the opening look
//   chooseLook(choice, key)      the effect carries over; Off turns back on, Steady
//   chooseEffect(choice, effect) applies at once
//   arrivalPhase(played, reduced), phaseTimer(phase, at), phaseView(phase, opts)
//                                the first arrival: a 500 ms day hold, a 1.2 s
//                                dusk fall, a 400 ms fade-up; later arrivals,
//                                and Reduce Motion, open lit
//   shouldPlay(state)            Twinkle and Chase run only while the page is
//                                current, the app visible, no layer open
//   swipeDelta(move, area), swipePointer(type), isControlTarget(target)
//                                a one-finger swipe turns the page (on the
//                                photo only a real flick or a long drag); a
//                                touch that starts on a button never does

export type PickerChoice = { look: string; effect: Effect; played: boolean };

const EFFECT_KEYS = new Set<Effect>(EFFECTS.map((effect) => effect.key));

export function isEffect(value: unknown): value is Effect {
  return typeof value === "string" && EFFECT_KEYS.has(value as Effect);
}

// The looks a meeting offers: on, in Keenan's order, at most six. A deck
// with none still has something to light (the seeded Warm white), so the
// page never shows an empty row.
export function pickerLooks(looks: Look[]): Look[] {
  const on = looks.filter((look) => look.active).slice(0, MAX_ACTIVE_LOOKS);
  return on.length > 0 ? on : [WARM_WHITE];
}

// Every meeting opens on Warm white (the look keyed warm_white), or the
// first look on when Keenan has turned it off.
export function openingLook(looks: Look[]): Look {
  const list = pickerLooks(looks);
  return list.find((look) => look.key === WARM_WHITE.key) ?? list[0];
}

export function resolveLook(looks: Look[], key: string): Look {
  return pickerLooks(looks).find((look) => look.key === key) ?? openingLook(looks);
}

// Warm white, Steady, every meeting; the iPad's own copy of this meeting
// (a page change, a reload, auto-lock) wins while its look is still on.
export function initialChoice(looks: Look[], stored: Partial<PickerChoice> | null | undefined): PickerChoice {
  const list = pickerLooks(looks);
  const look = stored && list.some((item) => item.key === stored.look) ? (stored.look as string) : openingLook(looks).key;
  return {
    look,
    effect: stored && isEffect(stored.effect) ? stored.effect : "steady",
    played: stored?.played === true,
  };
}

// A tap on a look keeps the effect the customer chose (Chase, then
// Halloween, is Halloween chasing). While Off it turns the lights back on,
// Steady, even on the look already chosen. Otherwise the chosen look stays
// chosen: one look is always on the house.
export function chooseLook(choice: PickerChoice, key: string): PickerChoice {
  const effect: Effect = choice.effect === "off" ? "steady" : choice.effect;
  if (key === choice.look && effect === choice.effect) return choice;
  return { ...choice, look: key, effect };
}

export function chooseEffect(choice: PickerChoice, effect: Effect): PickerChoice {
  return effect === choice.effect ? choice : { ...choice, effect };
}

// ---------------------------------------------------------------- the first arrival

// day: the photo as taken ("that's our house"); dusk: falling; lit: every
// light up together.
export type Phase = "day" | "dusk" | "lit";

// The first time the page is current in a meeting it plays the light-up;
// after that, after a reload, and with Reduce Motion on, it opens lit.
export function arrivalPhase(played: boolean, reduced: boolean): Phase {
  return played || reduced ? "lit" : "day";
}

// The light-up's next step: after how long, into which phase, and whether
// the light-up now counts as played (once the hold ends and dusk starts to
// fall). null: nothing to wait for.
// - The day hold waits until the page is on screen with its photo loaded
//   (after the scroll settles, never while off screen). Leaving during the
//   hold stops it, so the next arrival plays it whole.
// - Leaving during the dusk fall finishes it at once, so the next arrival
//   opens lit, with no replay.
// - A light-up already played never plays again (Reduce Motion turned off
//   mid-meeting, say), and with Reduce Motion on nothing waits at all.
export function phaseTimer(
  phase: Phase,
  { played, current, ready, reduced }: { played: boolean; current: boolean; ready: boolean; reduced: boolean },
): { afterMs: number; next: Phase; markPlayed: boolean } | null {
  if (reduced || phase === "lit") return null;
  if (phase === "day") {
    if (played) return { afterMs: 0, next: "lit", markPlayed: false };
    if (!current || !ready) return null;
    return { afterMs: MOTION.dayHoldMs, next: "dusk", markPlayed: true };
  }
  return { afterMs: current ? MOTION.duskFallMs : 0, next: "lit", markPlayed: false };
}

// What the lit photo is told in each phase (LitPhoto's dusk, duskMs, lit,
// fadeMs and lookFadeMs). Only opacity ever moves.
export type PhaseView = { dusk: number; duskMs: number; lit: number; fadeMs: number; lookFadeMs: number };

export function phaseView(phase: Phase, { reduced, ready }: { reduced: boolean; ready: boolean }): PhaseView {
  // With Reduce Motion on, a fade that remains is 100 ms or less.
  const fadeMs = reduced ? MOTION.reducedFadeMs : MOTION.fadeUpMs;
  const lookFadeMs = reduced ? MOTION.reducedFadeMs : MOTION.lookFadeMs;
  if (phase === "day") return { dusk: 0, duskMs: 0, lit: 0, fadeMs: 0, lookFadeMs };
  if (phase === "dusk") return { dusk: 1, duskMs: MOTION.duskFallMs, lit: 0, fadeMs: 0, lookFadeMs };
  // Lit. Dusk only ever moves here when a tap cut the light-up short (it
  // then comes down with the lights, over 400 ms); a photo that has only
  // just loaded opens at dusk at once, never fading in.
  return { dusk: 1, duskMs: ready && !reduced ? MOTION.fadeUpMs : 0, lit: 1, fadeMs, lookFadeMs };
}

// Twinkle and Chase start only from a tap (the effect is only ever set by
// one), and run only while the page is current, the app is visible, no
// layer is open and the lights are up. Reduce Motion never stops them: the
// tap is the request.
export function shouldPlay(state: {
  effect: Effect;
  current: boolean;
  visible: boolean;
  layerOpen: boolean;
  phase: Phase;
  ready: boolean;
}): boolean {
  return (
    effectAnimates(state.effect) &&
    state.current &&
    state.visible &&
    !state.layerOpen &&
    state.phase === "lit" &&
    state.ready
  );
}

// ---------------------------------------------------------------- touches

// A swipe: far enough, or a quick flick, and clearly sideways.
// On the tray: 60 px, or a 24 px flick.
export const SWIPE_MIN_PX = 60;
export const FLICK_MIN_PX = 24;
export const FLICK_PX_PER_MS = 0.45;
export const SWIPE_SIDEWAYS_RATIO = 1.5;
// On the photo (round 7 review): customers point at and trace their own
// roofline ("could we do just this part?"), so only a real flick (40 px at
// 0.45 px/ms or faster) or a long drag (a quarter of the page's width)
// turns the page. A slow trace along an eave never does.
export const PHOTO_FLICK_MIN_PX = 40;
export const PHOTO_DRAG_SHARE = 0.25;

// Where the finger came down: the photo (with the page's width), or the tray.
export type SwipeArea = { on: "photo"; width: number } | { on: "tray" };

// The page to turn to after a one-finger swipe from (0, 0) to (dx, dy) over
// `ms`: 1 (the next page, a swipe to the left), -1 (the previous), or null.
export function swipeDelta(
  { dx, dy, ms }: { dx: number; dy: number; ms: number },
  area: SwipeArea = { on: "tray" },
): 1 | -1 | null {
  const across = Math.abs(dx);
  if (!Number.isFinite(across) || across === 0) return null;
  if (across < SWIPE_SIDEWAYS_RATIO * Math.abs(dy)) return null;
  const fast = ms > 0 && across / ms >= FLICK_PX_PER_MS;
  if (area.on === "photo") {
    const flick = fast && across >= PHOTO_FLICK_MIN_PX;
    const long = area.width > 0 && across >= PHOTO_DRAG_SHARE * area.width;
    if (!flick && !long) return null;
  } else {
    const flick = fast && across >= FLICK_MIN_PX;
    if (across < SWIPE_MIN_PX && !flick) return null;
  }
  return dx < 0 ? 1 : -1;
}

// A finger (or a pencil) turns the page; a mouse uses the chevrons and keys,
// so a click and drag on the photo while rehearsing never does.
export function swipePointer(pointerType: string): boolean {
  return pointerType === "touch" || pointerType === "pen";
}

const CONTROLS = "button, a, input, select, textarea, label, [role='button'], [data-picker-control]";

// Whether a touch began on something tappable: then it never turns the
// page, however far it slides.
export function isControlTarget(target: unknown): boolean {
  if (!target || typeof target !== "object") return false;
  const closest = (target as { closest?: unknown }).closest;
  if (typeof closest !== "function") return false;
  return closest.call(target, CONTROLS) !== null;
}
