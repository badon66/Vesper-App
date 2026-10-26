import { randomInt } from "node:crypto";

// Letters and digits that are hard to confuse when read off a phone screen:
// no 0 or O, no 1, l or I. Three groups of four is easy to text and to type.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTempPassword(groups = 3, groupLength = 4): string {
  const parts: string[] = [];
  for (let g = 0; g < groups; g += 1) {
    let part = "";
    for (let i = 0; i < groupLength; i += 1) {
      part += ALPHABET[randomInt(ALPHABET.length)];
    }
    parts.push(part);
  }
  return parts.join("-");
}

export const TEMP_PASSWORD_PATTERN = /^[a-km-zA-HJ-NP-Z2-9]{4}(-[a-km-zA-HJ-NP-Z2-9]{4}){2}$/;
