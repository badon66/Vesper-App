"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { releaseMyHold, renewMyHold } from "@/app/(app)/app/schedule/actions";
import { Button } from "@/components/ui/button";
import { holdStore, isBookingPath, useHeldTime } from "@/lib/schedule/hold-store";
import { formatTime } from "@/lib/time";

const CHECK_IN_MS = 20_000;

// Keeps this phone's hold alive while the person is booking (Keenan,
// 2026-11-01): it checks in every 20 seconds and the moment the phone wakes
// or comes back online. A locked phone, a closed app or no signal stops the
// check-ins, and the database lets the hold go after the grace period.
// Leaving the booking screens lets it go at once. Mounted once, in the app
// layout, and off while the owner views the app as someone.
export function HoldKeeper({ enabled }: { enabled: boolean }) {
  const held = useHeldTime();
  const pathname = usePathname();
  const [lost, setLost] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !held || isBookingPath(pathname)) return;
    holdStore.set(null);
    void releaseMyHold();
  }, [enabled, held, pathname]);

  useEffect(() => {
    if (!enabled || !held) return;
    let stopped = false;
    async function checkIn() {
      if (document.visibilityState !== "visible") return;
      const result = await renewMyHold();
      if (stopped || holdStore.get()?.startsAt !== held?.startsAt) return;
      if (result.status !== "held") {
        holdStore.set(null);
        setLost(held?.startsAt ?? null);
      }
    }
    const timer = window.setInterval(() => void checkIn(), CHECK_IN_MS);
    const wake = () => void checkIn();
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [enabled, held]);

  if (!lost || !isBookingPath(pathname)) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-28 z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-md border border-destructive bg-background px-4 py-3 text-sm font-semibold shadow-sm lg:bottom-8"
    >
      <span>Your hold on {formatTime(lost)} let go. Pick the time again.</span>
      <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={() => setLost(null)}>
        OK
      </Button>
    </div>
  );
}

// Tells the keeper about a hold the server already knows of, for example
// after the booking screen is reloaded.
export function HoldSync({ startsAt }: { startsAt: string | null }) {
  useEffect(() => {
    if (startsAt) holdStore.set({ startsAt });
  }, [startsAt]);
  return null;
}
