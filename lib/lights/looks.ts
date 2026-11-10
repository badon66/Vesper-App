import type { Effect, Look } from "@/lib/deck";

// The two whites every drawing is lit with, and the words a screen reader
// hears on the light picker (round 7, light_picker.controls). Pure.
//
// CONTRACT
//   WARM_WHITE, COOL_WHITE      the seeded whites, for the drawings (fallbacks
//                               and prep's See it lit); pass the meeting's own
//                               look instead where one is chosen
//   warmWhiteOf(looks)          the Settings look keyed warm_white, else WARM_WHITE
//   lookLabel(look)             "Game night, red and gold" (each look button)
//   pickerCanvasLabel(look, effect)
//                               "Your house at dusk, lit in Warm white, steady."

export const WARM_WHITE: Look = {
  key: "warm_white",
  name: "Warm white",
  words: "Like a porch light",
  colours: [{ hex: "#FFB46B", name: "Warm white" }],
  block: 1,
  active: true,
};

export const COOL_WHITE: Look = {
  key: "cool_white",
  name: "Cool white",
  words: "Like daylight",
  colours: [{ hex: "#E4EEFF", name: "Cool white" }],
  block: 1,
  active: true,
};

export function warmWhiteOf(looks: Look[]): Look {
  return looks.find((look) => look.key === WARM_WHITE.key) ?? WARM_WHITE;
}

export function coolWhiteOf(looks: Look[]): Look {
  return looks.find((look) => look.key === COOL_WHITE.key) ?? COOL_WHITE;
}

const lowerFirst = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);

// What a look's button says to a screen reader: its name, then its colour
// words ("Game night, red and gold").
export function lookLabel(look: Pick<Look, "name" | "words">): string {
  const words = look.words.trim().replace(/[.]+$/, "");
  return words ? `${look.name}, ${lowerFirst(words)}` : look.name;
}

// What the lit photo says to a screen reader.
export function pickerCanvasLabel(look: Pick<Look, "name">, effect: Effect): string {
  if (effect === "off") return "Your house at dusk, with the lights off.";
  return `Your house at dusk, lit in ${look.name}, ${effect}.`;
}
