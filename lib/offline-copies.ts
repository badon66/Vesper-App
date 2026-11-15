// Round 22 (Keenan, 2026-11-15): what the phone or iPad keeps of the app for
// working without signal, taken off when someone signs out, so a shared or
// handed-over device keeps no customer's meeting pages or photos:
//   - the service worker's saved pages (vesper-pages) and photos
//     (vesper-images), whatever their version;
//   - meeting mode's copy of each meeting (localStorage vesper.meeting.*),
//     which holds the customer's quote.
// The build's own files (vesper-assets) stay: they hold nothing about
// anyone. A setter's unfinished leads stay too: they're kept per person, so
// the next person to sign in never sees them, and the setter gets them back.
const CACHES = ["vesper-pages", "vesper-images"];
const MEETING_COPY = "vesper.meeting.";

export async function clearOfflineCopies(): Promise<void> {
  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => CACHES.some((prefix) => name.startsWith(prefix))).map((name) => caches.delete(name)));
    }
  } catch {
    // Nothing kept, or the browser won't say: nothing to take off.
  }
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(MEETING_COPY)) window.localStorage.removeItem(key);
    }
  } catch {
    // Private browsing: nothing was kept.
  }
}
