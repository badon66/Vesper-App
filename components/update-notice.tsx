"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { liveBuildFrom, newerBuildLive, noticeAllowed, UPDATE_MIN_GAP_MS, UPDATE_POLL_MS, UPDATE_WORDS } from "@/lib/update-notice";

// A quiet line under the header when a newer build is live (Keenan,
// 2026-11-11). Tapping it reloads, which is what reopening does. It asks
// /api/version when the app comes back to the foreground and every ten
// minutes while open, and never shows while the booking sheet is open.
export function UpdateNotice() {
  const pathname = usePathname();
  const [stale, setStale] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const lastAsked = useRef(0);

  useEffect(() => {
    const current = process.env.NEXT_PUBLIC_APP_BUILD ?? null;
    if (!current) return;
    let gone = false;
    const ask = async () => {
      const now = Date.now();
      if (now - lastAsked.current < UPDATE_MIN_GAP_MS) return;
      lastAsked.current = now;
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok) return;
        const live = liveBuildFrom(await response.json());
        if (!gone && newerBuildLive(current, live)) setStale(true);
      } catch {
        // No signal: nothing to say.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void ask();
    };
    void ask();
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => void ask(), UPDATE_POLL_MS);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, []);

  // While the line is due, keep an eye on the booking sheet: the line
  // never shows over a booking.
  useEffect(() => {
    if (!stale) return;
    const look = () => setSheetOpen(document.querySelector('[data-testid="booking-sheet"]') !== null);
    look();
    const observer = new MutationObserver(look);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [stale]);

  if (!stale || !noticeAllowed({ path: pathname ?? "", sheetOpen })) return null;
  return (
    <div className="border-b bg-background" data-testid="update-notice">
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="mx-auto flex min-h-11 w-full max-w-5xl items-center px-4 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {UPDATE_WORDS}
      </button>
    </div>
  );
}
