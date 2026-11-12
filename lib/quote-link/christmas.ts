// The Christmas banner by Keenan's dates (round 17, Keenan, 2026-11-12),
// kept pure: the customer's link and the meeting's Your price both read it.
//
// Keenan sets three dates in Settings, Pricing: book by for white track
// (December 15 this year), book by for a colour-matched track (December 8)
// and the end of the season (December 24). Each customer sees the date for
// their own track colour, never both:
//   - before it: "Book by Tuesday, December 15 to be lit up for Christmas.",
//     one line about their track, and how many days are left;
//   - after it, until the season ends: a line that promises nothing;
//   - from the day after the season ends: no banner at all.
// No colour set yet reads the white date, with a note that a custom colour
// needs about a week more. Every word is Keenan's, from Settings.

import { formatLongDay } from "@/lib/time";

export type ChristmasWords = {
  // "Book by {date} to be lit up for Christmas."
  bookBy: string;
  white: string;
  colour: string;
  noColour: string;
  after: string;
};

export const CHRISTMAS_WORD_DEFAULTS: ChristmasWords = {
  bookBy: "Book by {date} to be lit up for Christmas.",
  white: "White track is in stock and we install on any good-weather day.",
  colour: "Your colour-matched track takes about a week to prepare, and we install on any good-weather day.",
  noColour: "A custom track colour needs about a week more.",
  after: "We can't promise Christmas now, but we install on every good-weather day all winter. Book now and we'll get you lit up as soon as we can.",
};

// What Settings gives the banner while it is on: the dates as YYYY-MM-DD
// and the words. Null while it is off or the season has ended.
export type ChristmasSettings = {
  bookByWhite: string;
  bookByColour: string;
  seasonEnd: string;
  words: ChristmasWords;
};

// The customer's track, as far as the dates go: white is the stock track,
// any other colour (a listed one or a Custom RAL code) is colour-matched.
export type TrackColourKind = "white" | "colour" | "none";

// The same test meeting mode uses for the stock colour: a listed colour
// whose name starts with "White" ("Off-white" is made to order).
export function isWhiteTrack(name: string): boolean {
  return /^white\b/i.test(name.trim());
}

export function trackColourKind({ name, custom }: { name: string | null | undefined; custom: boolean }): TrackColourKind {
  const named = (name ?? "").trim();
  if (custom) return "colour";
  if (named === "") return "none";
  return isWhiteTrack(named) ? "white" : "colour";
}

// Meeting mode names the lead's colour by kind: none, one from the list, or Custom.
export function trackColourKindOf(kind: "none" | "list" | "custom", text: string): TrackColourKind {
  if (kind === "none") return "none";
  if (kind === "custom") return "colour";
  return trackColourKind({ name: text, custom: false });
}

export type ChristmasBanner =
  | {
      state: "before";
      // The book-by date for their track, YYYY-MM-DD, and as words.
      date: string;
      headline: string;
      line: string | null;
      // Only with no colour set yet: a custom colour needs about a week more.
      note: string | null;
      daysLeft: number;
      countdown: string;
    }
  | { state: "after"; text: string };

const DAY_MS = 86_400_000;
const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

// Whole days from one calendar date to another (both YYYY-MM-DD).
export function daysBetween(from: string, to: string): number {
  const at = (day: string) => {
    const [year, month, date] = day.split("-").map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((at(to) - at(from)) / DAY_MS);
}

// "9 days left", "1 day left", and on the day itself "Last day to book".
export function countdownWords(daysLeft: number): string {
  if (daysLeft <= 0) return "Last day to book";
  return daysLeft === 1 ? "1 day left" : `${daysLeft} days left`;
}

// The book-by headline with the date filled in, "Tuesday, December 15".
export function bookByHeadline(template: string, date: string): string {
  const words = template.trim() || CHRISTMAS_WORD_DEFAULTS.bookBy;
  return words.includes("{date}") ? words.replaceAll("{date}", formatLongDay(date)) : words;
}

// The banner for one customer on one day, or null when there is none.
export function christmasBanner({
  today,
  christmas,
  track,
}: {
  today: string | null;
  christmas: ChristmasSettings | null | undefined;
  track: TrackColourKind;
}): ChristmasBanner | null {
  if (!christmas || !today || !isDay(today)) return null;
  const { bookByWhite, bookByColour, seasonEnd, words } = christmas;
  if (!isDay(seasonEnd) || !isDay(bookByWhite) || today > seasonEnd) return null;
  const date = track === "colour" && isDay(bookByColour) ? bookByColour : bookByWhite;
  if (today > date) {
    const text = words.after.trim();
    return text ? { state: "after", text } : null;
  }
  const daysLeft = Math.max(0, daysBetween(today, date));
  const line = (track === "colour" ? words.colour : words.white).trim() || null;
  const note = track === "none" ? words.noColour.trim() || null : null;
  return { state: "before", date, headline: bookByHeadline(words.bookBy, date), line, note, daysLeft, countdown: countdownWords(daysLeft) };
}

// The one quiet line on Your price in the meeting: the book-by date for the
// lead's track while it is ahead, nothing once it has passed.
export function christmasPriceLine(input: Parameters<typeof christmasBanner>[0]): string | null {
  const banner = christmasBanner(input);
  return banner?.state === "before" ? banner.headline : null;
}
