import { OFFLINE_CACHES, imageCacheKey, meetingFiles, meetingPageUrl } from "@/lib/offline";

// Browser only. Get tonight ready (Meetings page): put a meeting page and
// every file it names into the caches the service worker reads without
// signal, as opening the meeting once would. The page goes in last, so a
// saved page always means its files are there too.

export async function saveMeetingForOffline(leadId: string): Promise<string> {
  const origin = window.location.origin;
  const pageUrl = meetingPageUrl(origin, leadId);
  const page = await fetch(pageUrl, { credentials: "same-origin", cache: "no-store" });
  if (!page.ok || page.redirected) throw new Error("The meeting page did not load.");
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
    if (!response.ok) throw new Error("A file of the meeting page did not load.");
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

function savedAtOf(response: Response): string {
  const date = Date.parse(response.headers.get("date") ?? "");
  return new Date(Number.isNaN(date) ? Date.now() : date).toISOString();
}
