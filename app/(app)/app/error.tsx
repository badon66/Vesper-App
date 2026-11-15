"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

// Round 22 (Keenan, 2026-11-15): when an app page can't load, most often a
// page opened without signal that needs files the phone hasn't got yet, this
// takes the place of Next.js's own "This page couldn't load", inside the app
// with its tabs, and says plainly what happened. Nothing typed is lost:
// New lead and the booking sheet keep what was entered on the phone, and a
// save that worked stands. Try again reloads the page once there's signal.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const check = () => setOffline(navigator.onLine === false || /chunk|fetch|network|load/i.test(error.message));
    check();
    window.addEventListener("online", check);
    window.addEventListener("offline", check);
    return () => {
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col gap-3 py-10" data-testid="app-error">
      <h1 className="text-xl font-bold">{offline ? "No signal" : "This page didn't load"}</h1>
      <p className="text-pretty text-muted-foreground">
        {offline
          ? "This page needs signal to open. Anything you saved is saved, and a lead you were typing is still kept on this phone. Try again once you have signal."
          : "Something went wrong opening it. Try again, or go back."}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            start(() => {
              router.refresh();
              reset();
            })
          }
          data-testid="app-error-retry"
        >
          {busy ? "Trying" : "Try again"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Back
        </Button>
      </div>
    </div>
  );
}
