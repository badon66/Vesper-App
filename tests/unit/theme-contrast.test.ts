import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Setters read the app in bright daylight and at dusk. Every text colour must
// meet WCAG AA contrast on the surface it sits on, in both themes, and body
// text must reach AAA.

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf("}", start));
  const out: Record<string, string> = {};
  for (const match of block.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)) {
    out[match[1]] = match[2];
  }
  return out;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const pairs: [text: string, surface: string, minimum: number][] = [
  ["foreground", "background", 7],
  ["card-foreground", "card", 7],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "card", 4.5],
  ["foreground", "muted", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["secondary-foreground", "secondary", 4.5],
  ["accent-foreground", "accent", 4.5],
  ["destructive", "background", 4.5],
  ["destructive", "card", 4.5],
  ["destructive-foreground", "destructive", 4.5],
];

describe.each([
  ["light", ":root"],
  ["dark", ".dark"],
])("%s theme", (_name, selector) => {
  const t = { ...tokens(":root"), ...tokens(selector) };
  it.each(pairs)("%s on %s reaches %s:1", (text, surface, minimum) => {
    expect(t[text], text).toBeDefined();
    expect(t[surface], surface).toBeDefined();
    expect(contrast(t[text], t[surface])).toBeGreaterThanOrEqual(minimum);
  });
});
