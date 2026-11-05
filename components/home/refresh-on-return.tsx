"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Home is read once when it opens. An installed app can sit in the
// background for hours, so when the person comes back to it after more than
// a minute away, Home reads again: the team's schedule, who's out and how
// meetings went are as of now, not as of lunch. Reading only; never writes.
const AWAY_MS = 60_000;

export function RefreshOnReturn() {
  const router = useRouter();
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null && Date.now() - hiddenAt > AWAY_MS) {
        hiddenAt = null;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [router]);
  return null;
}
