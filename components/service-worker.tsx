"use client";

import { useEffect } from "react";

// Registers the caching service worker (public/sw.js). Production builds
// only: in development a worker serving stale chunks causes ghosts. Never
// on a customer's quote page (/q/...): customers get no app worker.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    if (window.location.pathname.startsWith("/q/")) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // No worker means no offline cache, nothing worse.
    });
  }, []);
  return null;
}
