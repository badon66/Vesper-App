import type { Database } from "@/types/database";

// Three optional answers a setter can note about a person (round 3, Keenan,
// 2026-11-05): one tap each, never required and not part of the "N of 8
// collected" count. Keenan sees the setter's read and hot buttons on his
// Meetings page and Home before he walks in. Internal: never shown in
// meeting mode or on anything a customer sees.

export type SetterRead = Database["public"]["Enums"]["setter_read"];
export type HotButton = Database["public"]["Enums"]["hot_button"];
export type ConfirmBy = Database["public"]["Enums"]["confirm_by"];

export const SETTER_READ_OPTIONS: { value: SetterRead; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "just_curious", label: "Just curious" },
];

// What would make them say yes. Any that apply; Not sure stands alone.
export const HOT_BUTTON_OPTIONS: { value: HotButton; label: string }[] = [
  { value: "no_ladders", label: "No more ladders" },
  { value: "up_for_christmas", label: "Up for Christmas" },
  { value: "curb_appeal", label: "Year-round curb appeal" },
  { value: "safety_security", label: "Safety and security" },
  { value: "not_sure", label: "Not sure" },
];

export const CONFIRM_BY_OPTIONS: { value: ConfirmBy; label: string }[] = [
  { value: "call", label: "Call" },
  { value: "text", label: "Text" },
];

export const SETTER_READ_LABEL = "Setter's read";
export const HOT_BUTTONS_LABEL = "What would make them say yes";
export const CONFIRM_BY_LABEL = "Confirm by";

const labelOf = <T extends string>(options: { value: T; label: string }[], value: T | null | undefined) =>
  options.find((option) => option.value === value)?.label ?? null;

export const setterReadLabel = (value: SetterRead | null | undefined) => labelOf(SETTER_READ_OPTIONS, value);
export const confirmByLabel = (value: ConfirmBy | null | undefined) => labelOf(CONFIRM_BY_OPTIONS, value);

export function hotButtonsLabel(values: readonly HotButton[] | null | undefined): string | null {
  const labels = HOT_BUTTON_OPTIONS.filter((option) => (values ?? []).includes(option.value)).map((option) => option.label);
  return labels.length > 0 ? labels.join(", ") : null;
}

// One line for Keenan's cards: "Hot · No more ladders, Up for Christmas".
// Nothing when the setter noted neither.
export function readLine(lead: { setter_read?: SetterRead | null; hot_buttons?: readonly HotButton[] | null }): string | null {
  const parts = [setterReadLabel(lead.setter_read), hotButtonsLabel(lead.hot_buttons)].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
