import { MEETINGS_PAGE, OFFLINE_CACHES, imageCacheKey, meetingFiles, meetingPageUrl } from "@/lib/offline";

// Browser only. Get tonight ready (Meetings page): put a page and every
// file it names into the caches the service worker reads without signal,
// as opening it once would. The page goes in last, so a saved page always
// means its files are there too.

async function savePage(pageUrl: string): Promise<string> {
  const origin = window.location.origin;
  const page = await fetch(pageUrl, { credentials: "same-origin", cache: "no-store" });
  if (!page.ok || page.redirected) throw new Error("The page did not load.");
  const html = await page.clone().text();
  const { assets, images } = meetingFiles(html, origin);
  const [pages, assetCache, imageCache] = await Promise.all([
    caches.open(OFFLINE_CACHES.pages),
    caches.open(OFFLINE_CACHES.assets),
    caches.open(OFFLINE_CACHES.images),
  ]);
  for (const url of assets) {
    if (await assetCache.match(url)) continue;
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error("A file of the page did not load.");
    await assetCache.put(url, response);
  }
  for (const url of images) {
    const key = imageCacheKey(url);
    if (await imageCache.match(key)) continue;
    const response = await fetch(url, { mode: "cors", credentials: "omit" });
    if (!response.ok) throw new Error("A photo did not load.");
    await imageCache.put(key, response);
  }
  await pages.put(pageUrl, page);
  return savedAtOf(page);
}

export function saveMeetingForOffline(leadId: string): Promise<string> {
  return savePage(meetingPageUrl(window.location.origin, leadId));
}

// The Meetings page itself, so the app opened from the home screen without
// signal still leads to tonight's saved meetings (public/sw.js).
export function saveMeetingsPageForOffline(): Promise<string> {
  return savePage(`${window.location.origin}${MEETINGS_PAGE}`);
}

// When the meeting's saved copy was fetched, if it is all there; else null.
export async function savedMeetingCopy(leadId: string): Promise<string | null> {
  const origin = window.location.origin;
  const pages = await caches.open(OFFLINE_CACHES.pages);
  const hit = await pages.match(meetingPageUrl(origin, leadId));
  if (!hit) return null;
  const { assets, images } = meetingFiles(await hit.clone().text(), origin);
  const [assetCache, imageCache] = await Promise.all([
    caches.open(OFFLINE_CACHES.assets),
    caches.open(OFFLINE_CACHES.images),
  ]);
  for (const url of assets) if (!(await assetCache.match(url))) return null;
  for (const url of images) if (!(await imageCache.match(imageCacheKey(url)))) return null;
  return savedAtOf(hit);
}

// Whether this browser has the service worker that opens saved pages
// without signal.
export async function canOpenWithoutSignal(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  return Boolean(await navigator.serviceWorker.getRegistration());
}

function savedAtOf(response: Response): string {
  const date = Date.parse(response.headers.get("date") ?? "");
  return new Date(Number.isNaN(date) ? Date.now() : date).toISOString();
}
