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
// Everything else goes straight to the network, untouched: above all the
// rehearsal view (Settings, round 7), whose example shots live on other
// sites and must never reach a meeting, and any other site's image.

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

// RULES START: which requests the worker answers, and how. Pure, so a unit
// test (tests/unit/offline.test.ts) runs this block as it stands.
const MEETINGS_PAGE = "/app/meetings";
const REHEARSAL_PAGE = "/app/admin/settings/rehearsal";

// "asset", "image", "meeting", "app", or null for the network untouched.
function cacheRule(request, origin) {
  if (request.method !== "GET") return null;
  const url = new URL(request.url);
  const own = url.origin === origin;
  // The rehearsal view is never kept, nor answered from a copy.
  if (own && (url.pathname === REHEARSAL_PAGE || url.pathname.startsWith(REHEARSAL_PAGE + "/"))) return null;
  if (own && url.pathname.startsWith("/_next/static/")) return "asset";
  // Another site's image is only ever kept when it is a signed storage
  // object asked for in CORS mode (meeting mode's photos): never a picture
  // hotlinked from elsewhere, like the rehearsal's examples.
  if (url.pathname.includes("/storage/v1/object/sign/") && url.searchParams.has("token") && request.mode === "cors") {
    return "image";
  }
  if (own && request.mode === "navigate") {
    if (url.pathname.startsWith("/meeting/") || url.pathname === MEETINGS_PAGE) return "meeting";
    if (url.pathname === "/app" || url.pathname.startsWith("/app/")) return "app";
  }
  return null;
}
// RULES END

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const rule = cacheRule(request, self.location.origin);
  if (rule === "asset") event.respondWith(cacheFirstAsset(request));
  else if (rule === "image") event.respondWith(cacheFirstImage(request, new URL(request.url)));
  else if (rule === "meeting") event.respondWith(meetingDocument(request));
  else if (rule === "app") event.respondWith(appDocument(request, new URL(request.url)));
});

// Push (2026-11-02): Book my install now, other alerts later. The server
// sends {title, body, url, tag}; the notice shows on the lock screen and a
// tap opens that page in the app, never another site.
self.addEventListener("push", (event) => {
  let notice = { title: "Vesper", body: "", url: "/app", tag: undefined };
  try {
    notice = { ...notice, ...(event.data ? event.data.json() : {}) };
  } catch {
    // A push without a readable payload still shows something.
  }
  event.waitUntil(
    self.registration.showNotification(notice.title, {
      body: notice.body,
      tag: notice.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: notice.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const asked = new URL((event.notification.data && event.notification.data.url) || "/app", self.location.origin);
  const target = asked.origin === self.location.origin ? asked.href : self.location.origin + "/app";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin)) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
