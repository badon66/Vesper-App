import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  firstExamples,
  rehearsalHref,
  REHEARSAL_WORDS,
  type RehearsalData,
  type RehearsalExample,
} from "@/app/(app)/app/(owner)/admin/settings/rehearsal/rehearsal";
import type { DeckPayload, MeetingPayload } from "@/lib/meeting/state";
import { REHEARSAL_PAGE } from "@/lib/offline";

// Never in a meeting (round 7, rehearsal_and_references): the examples to
// copy live only in Settings and the rehearsal view. The rehearsal reads
// them through its own server function and hands them over beside the
// meeting's payload, never inside it; nothing a meeting loads, renders or
// keeps for no signal ever touches them; the view is owner only, opened
// only from Settings, and writes nothing.

const REHEARSAL_DIR = "app/(app)/app/(owner)/admin/settings/rehearsal";
const read = (path: string) => readFileSync(path, "utf8");
// The code alone: comments may name the examples to say they are never here.
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((name) => join(dir, name))
    .filter((path) => statSync(path).isFile() && /\.(ts|tsx|js|mjs)$/.test(path));
}

// What a meeting is made of: its pages, its payload, its deck and drawings,
// and what keeps it for no signal.
const MEETING_SOURCES = [
  ...filesUnder("app/(app)/meeting"),
  ...filesUnder("components/meeting"),
  ...filesUnder("lib/meeting"),
  ...filesUnder("components/lights"),
  ...filesUnder("components/drawings"),
  "lib/offline.ts",
  "public/sw.js",
];

describe("the examples never reach a meeting", () => {
  it("nothing a meeting is made of reads them, imports the rehearsal or carries its words", () => {
    expect(MEETING_SOURCES.length).toBeGreaterThan(10);
    for (const path of MEETING_SOURCES) {
      const source = code(path);
      expect(source, path).not.toMatch(/presentation_references/);
      expect(source, path).not.toMatch(/from\s+["'][^"']*settings\/rehearsal/);
      for (const words of [REHEARSAL_WORDS.bar, REHEARSAL_WORDS.tag, REHEARSAL_WORDS.open]) {
        expect(source.includes(words), `${path}: "${words}"`).toBe(false);
      }
    }
  });

  it("the rehearsal reads them through its own server function, beside the meeting's own loaders", () => {
    const data = read(`${REHEARSAL_DIR}/data.ts`);
    expect(data.startsWith('import "server-only";')).toBe(true);
    expect(data).toMatch(/from\("presentation_references"\)/);
    expect(data).toMatch(/import \{ loadDeckPayload, loadMeetingPayload \} from "@\/lib\/meeting\/deck-payload";/);
    // Handed over in their own field, never added into the deck or the meeting.
    expect(data).toMatch(/examples: firstExamples\(references\)/);
    expect(data).not.toMatch(/deck\.\w+\s*=|meeting\.\w+\s*=|\.\.\.examples/);
  });

  it("they sit beside the meeting's payload, never inside it", () => {
    expectTypeOf<RehearsalData["meeting"]>().toEqualTypeOf<MeetingPayload | null>();
    expectTypeOf<RehearsalData["deck"]>().toEqualTypeOf<DeckPayload>();
    expectTypeOf<RehearsalData["examples"]>().toEqualTypeOf<Record<string, RehearsalExample>>();
    expectTypeOf<keyof MeetingPayload>().not.toEqualTypeOf<keyof MeetingPayload | "examples">();
    expectTypeOf<keyof DeckPayload>().not.toEqualTypeOf<keyof DeckPayload | "examples">();
  });

  it("an example is links only: no picture is downloaded, copied or stored", () => {
    const example = firstExamples([
      { slot: "what_vesper_is.hero", rank: 1, image_url: "https://images.example-site.com/a.jpg", page_url: "https://example-site.com/", site: "Example" },
    ])["what_vesper_is.hero"];
    expect(Object.keys(example).sort()).toEqual(["imageUrl", "pageUrl", "site"]);
    const shot = read(`${REHEARSAL_DIR}/example-shot.tsx`);
    // Loaded from where it lives, with no referrer and without CORS, so the
    // service worker (which keeps only signed storage photos asked for in
    // CORS mode) never keeps it.
    expect(shot).toMatch(/<img[\s\S]*?referrerPolicy="no-referrer"[\s\S]*?\/>/);
    expect(shot).not.toMatch(/crossOrigin/);
    expect(shot).not.toMatch(/fetch\(|createObjectURL|canvas|toDataURL|storage\.from/);
    expect(shot).toMatch(/rel="noreferrer noopener"/);
  });
});

// ---------------------------------------------------------------- the service worker

type Rule = "asset" | "image" | "meeting" | "app" | null;
type Request = { url: string; method?: string; mode?: string };
const ORIGIN = "https://vesper.example";

// The worker's rules, run as they stand in public/sw.js.
function swRules(): (request: Request) => Rule {
  const sw = read("public/sw.js");
  const block = sw.slice(sw.indexOf("// RULES START"), sw.indexOf("// RULES END"));
  expect(block).toContain("function cacheRule(");
  const cacheRule = new Function(`${block}\nreturn cacheRule;`)() as (request: Required<Request>, origin: string) => Rule;
  return (request) => cacheRule({ method: "GET", mode: "no-cors", ...request }, ORIGIN);
}

// Every link in the examples, as the migrations store them: the seed, and
// any later migration that changes them (round 7 review).
function seededLinks(): string[] {
  const names = readdirSync("supabase/migrations").filter((file) => /_presentation_references_\w+\.sql$/.test(file));
  expect(names.some((file) => file.endsWith("_presentation_references_seed.sql"))).toBe(true);
  const sql = names.map((name) => read(join("supabase/migrations", name))).join("\n");
  return [...new Set(sql.match(/https?:\/\/[^\s'")]+/g) ?? [])];
}

describe("the service worker never keeps the rehearsal or an example", () => {
  const rule = swRules();

  it("never the rehearsal view, however it is asked for", () => {
    const lead = "3f1c2b7e-8a4d-4c1e-9b2a-1d2e3f4a5b6c";
    for (const path of [REHEARSAL_PAGE, rehearsalHref(lead), `${rehearsalHref(lead)}&_rsc=1x2y3`, `${REHEARSAL_PAGE}?_rsc=1x2y3`, `${REHEARSAL_PAGE}/`]) {
      for (const mode of ["navigate", "cors", "same-origin", "no-cors"]) {
        expect(rule({ url: `${ORIGIN}${path}`, mode }), `${path} ${mode}`).toBeNull();
      }
    }
  });

  it("never a seeded example, as a picture or a page, in any mode", () => {
    const links = seededLinks();
    expect(links.length).toBeGreaterThan(20);
    for (const url of links) {
      for (const mode of ["no-cors", "cors", "navigate"]) {
        expect(rule({ url, mode }), `${url} ${mode}`).toBeNull();
      }
    }
  });
});

// ---------------------------------------------------------------- owner only, from Settings, writes nothing

describe("the rehearsal view itself", () => {
  const sources = filesUnder(REHEARSAL_DIR);

  it("checks the owner before it reads anything", () => {
    const page = read(`${REHEARSAL_DIR}/page.tsx`);
    const gate = page.indexOf('if (me.role !== "owner") return <NotForYourRole />;');
    expect(page.indexOf("await requireProfile()")).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(page.indexOf("await requireProfile()"));
    for (const read of ["await searchParams", "createClient()", "loadRehearsal("]) {
      expect(page.indexOf(read), read).toBeGreaterThan(gate);
    }
  });

  it("is opened only from Settings", () => {
    const linking = [...filesUnder("app"), ...filesUnder("components"), ...filesUnder("lib")].filter(
      (path) => !path.startsWith(REHEARSAL_DIR) && /admin\/settings\/rehearsal|REHEARSAL_PAGE/.test(read(path)),
    );
    expect(linking.length).toBeGreaterThan(0);
    for (const path of linking) {
      expect(path.startsWith("app/(app)/app/(owner)/admin/settings/") || path === "lib/offline.ts", path).toBe(true);
    }
  });

  it("writes nothing and keeps nothing", () => {
    expect(sources.length).toBeGreaterThanOrEqual(5);
    for (const path of sources) {
      const source = read(path);
      expect(source, path).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
      expect(source, path).not.toMatch(/["']use server["']/);
      expect(source, path).not.toMatch(/from\s+["'][^"']*\/actions["']/);
      expect(source, path).not.toMatch(/localStorage|sessionStorage|indexedDB|caches\./);
    }
    // The deck runs in its rehearsal mode: no iPad copy, no history guard,
    // Save and Confirm acted out on screen, no server action.
    expect(read(`${REHEARSAL_DIR}/rehearsal-view.tsx`)).toMatch(/<Deck[\s\S]*?mode="rehearsal"/);
  });

  it("shows the Customer view as a real meeting would: no examples drawn", () => {
    expect(read(`${REHEARSAL_DIR}/rehearsal-view.tsx`)).toMatch(/renderEmptySlot=\{customerView \? undefined : renderEmptySlot\}/);
  });
});
