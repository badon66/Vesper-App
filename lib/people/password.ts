import { randomInt } from "node:crypto";
import { PASSWORD_WORDS } from "./password-words";

// Every non-owner password is generated here, shown once to the owner, and
// texted. Three distinct common words and four digits, joined by hyphens, like
// maple-river-stone-4821: easy to read off a phone and to type on one.
export function generatePassword(): string {
  const words: string[] = [];
  while (words.length < 3) {
    const word = PASSWORD_WORDS[randomInt(PASSWORD_WORDS.length)];
    if (!words.includes(word)) words.push(word);
  }
  const digits = String(randomInt(10_000)).padStart(4, "0");
  return `${words.join("-")}-${digits}`;
}

export const PASSWORD_PATTERN = /^[a-z]{4,7}-[a-z]{4,7}-[a-z]{4,7}-\d{4}$/;
