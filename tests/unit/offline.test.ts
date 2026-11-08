import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MEETINGS_PAGE, OFFLINE_CACHES, REHEARSAL_PAGE, imageCacheKey, meetingFiles, meetingPageUrl } from "@/lib/offline";

const ORIGIN = "https://vesper.example";
const SIGNED = "https://abcd.supabase.co/storage/v1/object/sign/lead-photos/u1/p1.jpg?token=eyJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ4In0.sig-_x";

// Shaped like a real meeting page from the build: tags for scripts, styles
// and the font, and the page's data (with the photo link) inside a script.
const HTML = `<!DOCTYPE html><html><head>
<link rel="stylesheet" href="/_next/static/chunks/3x0fgeylw--zy.css" data-precedence="next"/>
<link rel="preload" href="/_next/static/media/82450a180bcad83c-s.p.0p-wng2nn8o-p.woff2" as="font" crossorigin=""/>
<script src="/_next/static/chunks/turbopack-3-ry682tkyiqk.js" async=""></script>
<script src="/_next/static/chunks/06gqozprsba3m.js?dpl=dpl_AbC123" async=""></script>
</head><body>
<script>self.__next_f.push([1,"5:I[\\"/_next/static/chunks/2y1z1te2hqr66.js\\",\\"default\\"]"])</script>
<script>self.__next_f.push([1,"{\\"mockupUrl\\":\\"${SIGNED}\\",\\"other\\":\\"/_next/static/chunks/2y1z1te2hqr66.js\\"}"])</script>
</body></html>`;

describe("what a saved meeting page needs", () => {
  it("names every script, style and font in the page once, with the site's address", () => {
    expect(meetingFiles(HTML, ORIGIN).assets).toEqual([
      `${ORIGIN}/_next/static/chunks/06gqozprsba3m.js?dpl=dpl_AbC123`,
      `${ORIGIN}/_next/static/chunks/2y1z1te2hqr66.js`,
      `${ORIGIN}/_next/static/chunks/3x0fgeylw--zy.css`,
      `${ORIGIN}/_next/static/chunks/turbopack-3-ry682tkyiqk.js`,
      `${ORIGIN}/_next/static/media/82450a180bcad83c-s.p.0p-wng2nn8o-p.woff2`,
    ]);
  });

  it("finds the signed photo links in the page's data, whole, and stops at the quote", () => {
    expect(meetingFiles(HTML, ORIGIN).images).toEqual([SIGNED]);
  });

  it("finds nothing in a page without them", () => {
    expect(meetingFiles("<html><body>Sign in</body></html>", ORIGIN)).toEqual({ assets: [], images: [] });
  });

  it("keeps a photo under its address without the signature, as the service worker does", () => {
    expect(imageCacheKey(SIGNED)).toBe("https://abcd.supabase.co/storage/v1/object/sign/lead-photos/u1/p1.jpg");
    expect(imageCacheKey(SIGNED.replace("sig-_x", "another"))).toBe(imageCacheKey(SIGNED));
  });

  it("keys the meeting page by its plain address", () => {
    expect(meetingPageUrl(ORIGIN, "lead-1")).toBe(`${ORIGIN}/meeting/lead-1`);
  });
});

describe("the caches the service worker reads", () => {
  it("are the ones Get tonight ready fills", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    const version = sw.match(/const VERSION = "([^"]+)"/)?.[1];
    expect(version).toBeTruthy();
    expect(OFFLINE_CACHES).toEqual({
      assets: `vesper-assets-${version}`,
      images: `vesper-images-${version}`,
      pages: `vesper-pages-${version}`,
    });
    expect(sw).toContain("const ASSETS = `vesper-assets-${VERSION}`;");
    expect(sw).toContain("const IMAGES = `vesper-images-${VERSION}`;");
    expect(sw).toContain("const PAGES = `vesper-pages-${VERSION}`;");
    expect(sw).toContain(`const MEETINGS_PAGE = "${MEETINGS_PAGE}";`);
    expect(sw).toContain(`const REHEARSAL_PAGE = "${REHEARSAL_PAGE}";`);
  });
});

// The service worker's rules, run as they stand in public/sw.js.
type Rule = "asset" | "image" | "meeting" | "app" | null;
type Request = { url: string; method?: string; mode?: string };
function swRules(): (request: Request) => Rule {
  const sw = readFileSync("public/sw.js", "utf8");
  const block = sw.slice(sw.indexOf("// RULES START"), sw.indexOf("// RULES END"));
  expect(block).toContain("function cacheRule(");
  const cacheRule = new Function(`${block}\nreturn cacheRule;`)() as (request: Required<Request>, origin: string) => Rule;
  return (request) => cacheRule({ method: "GET", mode: "no-cors", ...request }, ORIGIN);
}

describe("what the service worker keeps", () => {
  const rule = swRules();

  it("never the rehearsal view, nor anything under it", () => {
    expect(rule({ url: `${ORIGIN}${REHEARSAL_PAGE}`, mode: "navigate" })).toBeNull();
    expect(rule({ url: `${ORIGIN}${REHEARSAL_PAGE}?lead=lead-1`, mode: "navigate" })).toBeNull();
    expect(rule({ url: `${ORIGIN}${REHEARSAL_PAGE}/anything`, mode: "navigate" })).toBeNull();
    // Settings itself is an ordinary app page.
    expect(rule({ url: `${ORIGIN}/app/admin/settings`, mode: "navigate" })).toBe("app");
  });

  it("never another site's image: an example hotlinked from where it lives, in either mode", () => {
    expect(rule({ url: "https://images.example-site.com/house-at-dusk.jpg" })).toBeNull();
    expect(rule({ url: "https://images.example-site.com/house-at-dusk.jpg", mode: "cors" })).toBeNull();
    expect(rule({ url: "https://abcd.supabase.co/storage/v1/object/public/presentation/deck/a.jpg", mode: "cors" })).toBeNull();
    expect(rule({ url: `https://abcd.supabase.co/storage/v1/object/sign/presentation/deck/a.jpg`, mode: "cors" })).toBeNull();
  });

  it("the meeting's own photos: signed storage links asked for in CORS mode", () => {
    expect(rule({ url: SIGNED, mode: "cors" })).toBe("image");
    expect(rule({ url: SIGNED, mode: "no-cors" })).toBeNull();
    expect(rule({ url: SIGNED, mode: "cors", method: "POST" })).toBeNull();
  });

  it("the build's files, the meeting pages and the Meetings page", () => {
    expect(rule({ url: `${ORIGIN}/_next/static/chunks/a.js` })).toBe("asset");
    expect(rule({ url: "https://elsewhere.example/_next/static/chunks/a.js" })).toBeNull();
    expect(rule({ url: `${ORIGIN}/meeting/lead-1`, mode: "navigate" })).toBe("meeting");
    expect(rule({ url: `${ORIGIN}${MEETINGS_PAGE}`, mode: "navigate" })).toBe("meeting");
    expect(rule({ url: `${ORIGIN}/app/leads/lead-1`, mode: "navigate" })).toBe("app");
    expect(rule({ url: `${ORIGIN}/q/token`, mode: "navigate" })).toBeNull();
    expect(rule({ url: `${ORIGIN}/meeting/lead-1`, mode: "cors" })).toBeNull();
  });
});
