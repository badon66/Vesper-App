// What the iPad keeps for meetings without signal (M5). The service worker
// (public/sw.js) reads these caches when there is no network; Get tonight
// ready on the Meetings page fills them ahead of time. The names must stay
// equal to the ones in public/sw.js; a unit test holds them together.

export const OFFLINE_CACHES = {
  assets: "vesper-assets-v1",
  images: "vesper-images-v1",
  pages: "vesper-pages-v1",
} as const;

// A signed storage photo is kept under its address without the signature,
// as the service worker does, so a re-signed link still finds it.
export function imageCacheKey(url: string): string {
  const parsed = new URL(url);
  return parsed.origin + parsed.pathname;
}

// The Meetings page, kept too, so the app opened without signal still
// leads to tonight's saved meetings. Must match MEETINGS_PAGE in sw.js.
export const MEETINGS_PAGE = "/app/meetings";

export function meetingPageUrl(origin: string, leadId: string): string {
  return `${origin}/meeting/${leadId}`;
}

// Every file a saved meeting page needs to open without signal: the build's
// scripts, styles and fonts it names, and the signed photos in its data.
// Both appear as plain text in the page, in tags and in the page's data.
export function meetingFiles(html: string, origin: string): { assets: string[]; images: string[] } {
  const text = html.replace(/&amp;/g, "&");
  const assets = new Set<string>();
  for (const match of text.matchAll(/\/_next\/static\/[A-Za-z0-9._~%/@+-]+(?:\?[A-Za-z0-9._~%=&-]+)?/g)) {
    assets.add(origin + match[0]);
  }
  const images = new Set<string>();
  for (const match of text.matchAll(/https:\/\/[A-Za-z0-9.-]+(?::\d+)?\/storage\/v1\/object\/sign\/[A-Za-z0-9._~%/@+-]+\?token=[A-Za-z0-9._~%-]+/g)) {
    images.add(match[0]);
  }
  return { assets: [...assets].sort(), images: [...images].sort() };
}
