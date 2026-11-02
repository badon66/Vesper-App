"use client";

import { useEffect } from "react";

// Registers the caching service worker (public/sw.js). Production builds
// only: in development a worker serving stale chunks causes ghosts.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No worker means no offline cache, nothing worse.
    });
  }, []);
  return null;
}
