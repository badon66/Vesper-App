// Vesper's service worker: caching only, never offline writes (CLAUDE.md).
// It exists for meeting mode (M5): a house with weak signal must not take
// the presentation down mid-meeting. It keeps three kinds of things:
//   - hashed build assets (/_next/static/), cache-first: immutable by name;
//   - signed storage images, cache-first by path with the signature
//     stripped, so a re-signed URL for the same photo still hits the cache;
//   - the meeting document itself, network-first with the last good copy
//     as the fallback, so an iPad reload in a dead spot still opens;
//   - the Meetings page the same way (Get tonight ready saves it too), and
//     any other app page that can't load without signal sends the iPad to
//     that saved Meetings page, so the app opened from the home screen, or
//     the way out of a meeting, still leads back to tonight's meetings.
// Everything else goes straight to the network, untouched.

const VERSION = "v1";
const ASSETS = `vesper-assets-${VERSION}`;
const IMAGES = `vesper-images-${VERSION}`;
const PAGES = `vesper-pages-${VERSION}`;
const KEEP = new Set([ASSETS, IMAGES, PAGES]);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !KEEP.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

// A signed storage object's cache key: the URL without its token, so the
// same photo matches across signatures.
function imageKey(url) {
  return url.origin + url.pathname;
}

async function cacheFirstAsset(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function cacheFirstImage(request, url) {
  const cache = await caches.open(IMAGES);
  const key = imageKey(url);
  const hit = await cache.match(key);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && (response.type === "basic" || response.type === "cors")) {
    cache.put(key, response.clone());
  }
  return response;
}

const MEETINGS_PAGE = "/app/meetings";

async function meetingDocument(request) {
  const cache = await caches.open(PAGES);
  try {
    const response = await fetch(request);
    // Only a signed-in, successful page is worth keeping; a redirect to
    // /login must never become the offline copy.
    if (response.ok && !response.redirected) {
      cache.put(request.url, response.clone());
    }
    return response;
  } catch {
    const hit = await cache.match(request.url);
    if (hit) return hit;
    throw new Error("offline");
  }
}

// Any other app page: straight to the network. Without signal, the saved
// Meetings page, if there is one.
async function appDocument(request, url) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(PAGES);
    if (await cache.match(url.origin + MEETINGS_PAGE)) {
      return Response.redirect(url.origin + MEETINGS_PAGE, 302);
    }
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirstAsset(request));
    return;
  }

  // Supabase storage: signed object reads only.
  if (url.pathname.includes("/storage/v1/object/sign/")) {
    event.respondWith(cacheFirstImage(request, url));
    return;
  }

  if (url.origin === self.location.origin && request.mode === "navigate") {
    if (url.pathname.startsWith("/meeting/") || url.pathname === MEETINGS_PAGE) {
      event.respondWith(meetingDocument(request));
      return;
    }
    if (url.pathname === "/app" || url.pathname.startsWith("/app/")) {
      event.respondWith(appDocument(request, url));
      return;
    }
  }
});
