// The welcome's steps (Keenan, 2026-11-03), kept pure so they are unit
// tested: three that get a setter's phone ready, then how a door goes.

export const WELCOME_STEPS = [
  { key: "home", label: "Home screen" },
  { key: "location", label: "Location" },
  { key: "notifications", label: "Notifications" },
  { key: "tour", label: "How a door goes" },
] as const;

export type WelcomeStepKey = (typeof WELCOME_STEPS)[number]["key"];

// ?step=2 -> 2. Anything else starts at the first step.
export function welcomeStep(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const step = Number(raw);
  return Number.isInteger(step) && step >= 1 && step <= WELCOME_STEPS.length ? step : 1;
}

export function welcomeHref(step: number): string {
  return step <= 1 ? "/app/welcome" : `/app/welcome?step=${step}`;
}

// Which phone the steps are for, from the browser's user agent.
export type Platform = "iphone" | "iphone-other-browser" | "android" | "computer";

export function platformOf(userAgent: string, maxTouchPoints: number): Platform {
  const apple = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (apple) return /CriOS|FxiOS|EdgiOS/.test(userAgent) ? "iphone-other-browser" : "iphone";
  if (/Android/.test(userAgent)) return "android";
  return "computer";
}
