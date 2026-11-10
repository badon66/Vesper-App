import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLICK_MIN_PX,
  PHOTO_DRAG_SHARE,
  PHOTO_FLICK_MIN_PX,
  SWIPE_MIN_PX,
  arrivalPhase,
  chooseEffect,
  chooseLook,
  initialChoice,
  isControlTarget,
  isEffect,
  openingLook,
  phaseTimer,
  phaseView,
  pickerLooks,
  resolveLook,
  shouldPlay,
  swipeDelta,
  swipePointer,
  type Phase,
  type PickerChoice,
} from "@/components/meeting/picker/picker-state";
import { EFFECTS, parseLooks, type Effect, type Look } from "@/lib/deck";
import { MOTION } from "@/lib/motion";

// The seeded looks, read from the seed migration itself.
function seededLooks(): Look[] {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261108080527_round7_deck_words_and_looks.sql"), "utf8");
  const match = sql.match(/light_looks = \$looks\$([\s\S]*?)\$looks\$/);
  if (!match) throw new Error("seeded looks not found");
  return parseLooks(JSON.parse(match[1]));
}

const LOOKS = seededLooks();
const look = (key: string, extra: Partial<Look> = {}): Look => ({
  key,
  name: key,
  words: "",
  colours: [{ hex: "#FFFFFF", name: "White" }],
  block: 1,
  active: true,
  ...extra,
});

describe("the looks on offer", () => {
  it("are the seeded five, in order", () => {
    expect(pickerLooks(LOOKS).map((item) => item.key)).toEqual(["warm_white", "cool_white", "christmas", "game_night", "halloween"]);
  });

  it("leave out looks that are off and stop at six", () => {
    const many = Array.from({ length: 8 }, (_, at) => look(`l${at}`, { active: at !== 1 }));
    expect(pickerLooks(many).map((item) => item.key)).toEqual(["l0", "l2", "l3", "l4", "l5", "l6"]);
  });

  it("fall back to Warm white when Settings has none on", () => {
    expect(pickerLooks([]).map((item) => item.key)).toEqual(["warm_white"]);
    expect(pickerLooks([look("x", { active: false })]).map((item) => item.key)).toEqual(["warm_white"]);
  });

  it("open on Warm white, or the first look on when it is off", () => {
    expect(openingLook(LOOKS).key).toBe("warm_white");
    const noWarm = LOOKS.map((item) => (item.key === "warm_white" ? { ...item, active: false } : item));
    expect(openingLook(noWarm).key).toBe("cool_white");
  });

  it("resolve a key that is no longer on to the opening look", () => {
    expect(resolveLook(LOOKS, "halloween").key).toBe("halloween");
    expect(resolveLook(LOOKS, "gone").key).toBe("warm_white");
  });
});

describe("where a meeting opens", () => {
  it("opens on Warm white, Steady, not yet played, every new meeting", () => {
    expect(initialChoice(LOOKS, undefined)).toEqual({ look: "warm_white", effect: "steady", played: false });
    expect(initialChoice(LOOKS, null)).toEqual({ look: "warm_white", effect: "steady", played: false });
  });

  it("keeps this meeting's own choice after a page change, a reload or auto-lock", () => {
    expect(initialChoice(LOOKS, { look: "halloween", effect: "chase", played: true })).toEqual({
      look: "halloween",
      effect: "chase",
      played: true,
    });
  });

  it("drops a stored look Keenan has since turned off, and a nonsense effect", () => {
    const stored = { look: "retired", effect: "strobe" as Effect, played: true };
    expect(initialChoice(LOOKS, stored)).toEqual({ look: "warm_white", effect: "steady", played: true });
  });

  it("knows the four effects", () => {
    for (const { key } of EFFECTS) expect(isEffect(key)).toBe(true);
    expect(isEffect("strobe")).toBe(false);
    expect(isEffect(undefined)).toBe(false);
  });
});

describe("a tap", () => {
  const start: PickerChoice = { look: "warm_white", effect: "steady", played: true };

  it("on a look keeps the effect the customer chose", () => {
    const chasing = chooseEffect(start, "chase");
    expect(chooseLook(chasing, "halloween")).toEqual({ look: "halloween", effect: "chase", played: true });
    const twinkling = chooseEffect(start, "twinkle");
    expect(chooseLook(twinkling, "christmas").effect).toBe("twinkle");
  });

  it("on a look while Off turns the lights back on, Steady", () => {
    const off = chooseEffect(start, "off");
    expect(chooseLook(off, "game_night")).toEqual({ look: "game_night", effect: "steady", played: true });
    expect(chooseLook(off, "warm_white")).toEqual({ look: "warm_white", effect: "steady", played: true });
  });

  it("on the chosen look changes nothing: one look is always on the house", () => {
    expect(chooseLook(start, "warm_white")).toBe(start);
  });

  it("on an effect applies it, and on the chosen effect changes nothing", () => {
    expect(chooseEffect(start, "twinkle").effect).toBe("twinkle");
    expect(chooseEffect(start, "steady")).toBe(start);
  });
});

describe("the first arrival", () => {
  const at = (over: Partial<{ played: boolean; current: boolean; ready: boolean; reduced: boolean }> = {}) => ({
    played: false,
    current: true,
    ready: true,
    reduced: false,
    ...over,
  });

  it("plays only the first time, and never with Reduce Motion on", () => {
    expect(arrivalPhase(false, false)).toBe("day");
    expect(arrivalPhase(true, false)).toBe("lit");
    expect(arrivalPhase(false, true)).toBe("lit");
  });

  it("holds the photo as taken for 500 ms, then dusk falls over 1.2 s, then the lights come up", () => {
    expect(phaseTimer("day", at())).toEqual({ afterMs: 500, next: "dusk", markPlayed: true });
    expect(phaseTimer("dusk", at({ played: true }))).toEqual({ afterMs: 1200, next: "lit", markPlayed: false });
    expect(phaseTimer("lit", at({ played: true }))).toBeNull();
  });

  it("walks day, dusk, lit, adding up to the spec's timings", () => {
    let phase: Phase = arrivalPhase(false, false);
    let played = false;
    let elapsed = 0;
    for (let guard = 0; guard < 5; guard++) {
      const step = phaseTimer(phase, at({ played }));
      if (!step) break;
      elapsed += step.afterMs;
      phase = step.next;
      played = played || step.markPlayed;
    }
    expect(phase).toBe("lit");
    expect(played).toBe(true);
    expect(elapsed).toBe(MOTION.dayHoldMs + MOTION.duskFallMs);
  });

  it("never starts while the page is off screen or its photo is loading", () => {
    expect(phaseTimer("day", at({ current: false }))).toBeNull();
    expect(phaseTimer("day", at({ ready: false }))).toBeNull();
  });

  it("finishes at once when the page is left during the dusk fall", () => {
    expect(phaseTimer("dusk", at({ played: true, current: false }))).toEqual({ afterMs: 0, next: "lit", markPlayed: false });
  });

  it("never replays once played, and waits for nothing with Reduce Motion on", () => {
    expect(phaseTimer("day", at({ played: true }))).toEqual({ afterMs: 0, next: "lit", markPlayed: false });
    expect(phaseTimer("day", at({ reduced: true }))).toBeNull();
    expect(phaseTimer("dusk", at({ reduced: true }))).toBeNull();
  });
});

describe("what the lit photo is told", () => {
  it("starts as the photo as taken, lights down", () => {
    expect(phaseView("day", { reduced: false, ready: true })).toMatchObject({ dusk: 0, lit: 0 });
  });

  it("lets dusk fall over 1.2 s by opacity, lights still down", () => {
    expect(phaseView("dusk", { reduced: false, ready: true })).toMatchObject({ dusk: 1, duskMs: 1200, lit: 0 });
  });

  it("fades every light up together over 400 ms; Off takes 400 ms; a look cross-fades over 300 ms", () => {
    expect(phaseView("lit", { reduced: false, ready: true })).toEqual({ dusk: 1, duskMs: 400, lit: 1, fadeMs: 400, lookFadeMs: 300 });
  });

  it("opens a photo that has only just loaded at dusk at once, never fading in", () => {
    expect(phaseView("lit", { reduced: false, ready: false }).duskMs).toBe(0);
  });

  it("with Reduce Motion: no dusk fall, and fades of 100 ms or less", () => {
    const view = phaseView("lit", { reduced: true, ready: true });
    expect(view).toMatchObject({ dusk: 1, duskMs: 0, lit: 1 });
    expect(view.fadeMs).toBeLessThanOrEqual(100);
    expect(view.lookFadeMs).toBeLessThanOrEqual(100);
  });
});

describe("when Twinkle and Chase run", () => {
  const on = { effect: "twinkle" as Effect, current: true, visible: true, layerOpen: false, phase: "lit" as Phase, ready: true };

  it("run only for Twinkle and Chase", () => {
    expect(shouldPlay(on)).toBe(true);
    expect(shouldPlay({ ...on, effect: "chase" })).toBe(true);
    expect(shouldPlay({ ...on, effect: "steady" })).toBe(false);
    expect(shouldPlay({ ...on, effect: "off" })).toBe(false);
  });

  it("pause when the page is left, the app is hidden or a layer is open", () => {
    expect(shouldPlay({ ...on, current: false })).toBe(false);
    expect(shouldPlay({ ...on, visible: false })).toBe(false);
    expect(shouldPlay({ ...on, layerOpen: true })).toBe(false);
  });

  it("wait for the lights to be up", () => {
    expect(shouldPlay({ ...on, phase: "dusk" })).toBe(false);
    expect(shouldPlay({ ...on, ready: false })).toBe(false);
  });
});

describe("a swipe", () => {
  it("to the left turns to the next page, to the right the previous", () => {
    expect(swipeDelta({ dx: -120, dy: 10, ms: 300 })).toBe(1);
    expect(swipeDelta({ dx: 120, dy: -10, ms: 300 })).toBe(-1);
  });

  it("on the tray needs to travel, unless it is a quick flick", () => {
    expect(swipeDelta({ dx: -(SWIPE_MIN_PX - 1), dy: 0, ms: 1000 })).toBeNull();
    expect(swipeDelta({ dx: -SWIPE_MIN_PX, dy: 0, ms: 1000 })).toBe(1);
    expect(swipeDelta({ dx: -40, dy: 0, ms: 60 })).toBe(1);
    expect(swipeDelta({ dx: -(FLICK_MIN_PX - 1), dy: 0, ms: 10 })).toBeNull();
  });

  describe("on the photo", () => {
    const photo = { on: "photo" as const, width: 1180 };

    it("never turns the page on a slow trace along the roofline", () => {
      // A customer tracing 200 px of their eave over a second and a half.
      expect(swipeDelta({ dx: -200, dy: 6, ms: 1500 }, photo)).toBeNull();
      expect(swipeDelta({ dx: 200, dy: -4, ms: 900 }, photo)).toBeNull();
      // 60 px is a page turn on the tray, never on the photo.
      expect(swipeDelta({ dx: -SWIPE_MIN_PX, dy: 0, ms: 1000 }, photo)).toBeNull();
    });

    it("turns on a real flick: 40 px or more at 0.45 px/ms or faster", () => {
      expect(swipeDelta({ dx: -PHOTO_FLICK_MIN_PX, dy: 0, ms: 80 }, photo)).toBe(1);
      expect(swipeDelta({ dx: 160, dy: 10, ms: 200 }, photo)).toBe(-1);
      expect(swipeDelta({ dx: -(PHOTO_FLICK_MIN_PX - 1), dy: 0, ms: 20 }, photo)).toBeNull();
      expect(swipeDelta({ dx: -100, dy: 0, ms: 300 }, photo)).toBeNull();
    });

    it("turns on a long drag: a quarter of the page's width, however slow", () => {
      expect(PHOTO_DRAG_SHARE).toBe(0.25);
      expect(swipeDelta({ dx: -295, dy: 0, ms: 2000 }, photo)).toBe(1);
      expect(swipeDelta({ dx: -294, dy: 0, ms: 2000 }, photo)).toBeNull();
      expect(swipeDelta({ dx: -342, dy: 0, ms: 2000 }, { on: "photo", width: 1366 })).toBe(1);
      expect(swipeDelta({ dx: -342, dy: 0, ms: 2000 }, { on: "photo", width: 1400 })).toBeNull();
    });

    it("is still clearly sideways", () => {
      expect(swipeDelta({ dx: -300, dy: 250, ms: 2000 }, photo)).toBeNull();
    });
  });

  it("is clearly sideways: a tap, or a drag up or down, never turns the page", () => {
    expect(swipeDelta({ dx: 0, dy: 0, ms: 80 })).toBeNull();
    expect(swipeDelta({ dx: -80, dy: 70, ms: 300 })).toBeNull();
    expect(swipeDelta({ dx: 3, dy: 200, ms: 300 })).toBeNull();
  });

  it("comes from a finger or a pencil, never a mouse", () => {
    expect(swipePointer("touch")).toBe(true);
    expect(swipePointer("pen")).toBe(true);
    expect(swipePointer("mouse")).toBe(false);
  });

  it("never starts on a button", () => {
    const element = (onControl: boolean) => ({ closest: (selector: string) => (onControl && selector.includes("button") ? {} : null) });
    expect(isControlTarget(element(true))).toBe(true);
    expect(isControlTarget(element(false))).toBe(false);
    expect(isControlTarget(null)).toBe(false);
    expect(isControlTarget({})).toBe(false);
  });
});
