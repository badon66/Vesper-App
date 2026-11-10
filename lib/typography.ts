// Display-time typography for customer words (round 7 review): an
// apostrophe between letters reads as a typewriter tick at 32 to 60 px in
// Manrope, so the deck shows the typographic one. What Settings stores
// stays exactly as Keenan typed it; only what is drawn changes.
export function smartApostrophes(text: string): string {
  return text.replace(/(\p{L})'(?=\p{L})/gu, "$1’");
}
