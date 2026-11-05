"use client";

import { LoaderCircle, LocateFixed } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DevicePosition } from "@/lib/geo";
import {
  atDeadline,
  FINDING,
  failureMessage,
  findingText,
  IDLE,
  LOCATE_WINDOW_MS,
  withError,
  withReading,
  type LocateState,
} from "@/lib/locate";

// "Use where I'm standing": the phone's GPS position, for a brand-new
// street Google doesn't have yet. Only read when tapped, at the door.
// Round 3 (Keenan, 2026-11-05: in the field it seemed to do nothing): it
// says "Finding where you are..." at once, listens for up to 15 seconds and
// takes the first reading within 50 m, shows how close it is getting, and
// ends with a clear result or a clear reason, with the iPhone steps when
// location is off. The result line comes into view, so it's never hidden
// below the fold of a step.
export function UseMyPosition({
  onPosition,
  label = "Use where I'm standing",
  place = "door",
}: {
  onPosition: (position: DevicePosition) => void;
  label?: string;
  // A setter's phone at the door, or Keenan's device at the house.
  place?: "door" | "house";
}) {
  const [state, setState] = useState<LocateState>(IDLE);
  const watch = useRef<number | null>(null);
  const deadline = useRef<number | null>(null);
  const live = useRef<LocateState>(IDLE);
  const statusRef = useRef<HTMLDivElement>(null);
  const deliver = useRef(onPosition);
  useEffect(() => {
    deliver.current = onPosition;
  });
  const device = place === "house" ? "device" : "phone";

  function stop() {
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    if (deadline.current !== null) window.clearTimeout(deadline.current);
    watch.current = null;
    deadline.current = null;
  }

  function apply(next: LocateState) {
    if (next === live.current) return;
    live.current = next;
    setState(next);
    if (next.kind === "found") {
      stop();
      deliver.current(next.position);
    } else if (next.kind === "failed") {
      stop();
    }
  }

  // Location stops on an iPhone while the app is in the background: say so
  // rather than wait out the 15 seconds. Nothing keeps listening once the
  // button is gone.
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden" && live.current.kind === "finding") {
        apply({ kind: "failed", reason: "background", best: live.current.best });
      }
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      stop();
    };
    // apply and stop only touch refs and setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The line that says what's happening comes into view as it changes.
  useEffect(() => {
    if (state.kind !== "idle") statusRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [state.kind]);

  function locate() {
    stop();
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      apply({ kind: "failed", reason: "unsupported", best: null });
      return;
    }
    live.current = IDLE;
    apply(FINDING);
    deadline.current = window.setTimeout(() => apply(atDeadline(live.current)), LOCATE_WINDOW_MS);
    watch.current = navigator.geolocation.watchPosition(
      (found) => apply(withReading(live.current, { lat: found.coords.latitude, lng: found.coords.longitude, accuracy: found.coords.accuracy })),
      (problem) => apply(withError(live.current, problem.code)),
      { enableHighAccuracy: true, maximumAge: 0 },
    );
  }

  const finding = state.kind === "finding";
  const failed = state.kind === "failed" ? failureMessage(state.reason, state.best, device) : null;

  return (
    <div className="flex flex-col gap-2" data-testid="use-my-position" data-state={state.kind}>
      <Button type="button" variant="outline" className="min-h-11 w-full sm:w-fit" disabled={finding} onClick={locate}>
        {finding ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <LocateFixed aria-hidden="true" />}
        {finding ? "Finding where you are" : failed ? "Try again" : label}
      </Button>
      <div ref={statusRef} aria-live="polite" className="scroll-mb-24" data-testid="position-status">
        {finding ? <p className="text-sm font-semibold text-pretty">{findingText(state.best)}</p> : null}
        {failed ? (
          <div className="flex flex-col gap-1 rounded-md border border-foreground/60 px-3 py-2 text-sm" data-testid="position-problem">
            <p className="font-semibold text-pretty">{failed.title}</p>
            {failed.detail ? <p className="text-pretty text-muted-foreground">{failed.detail}</p> : null}
            {failed.steps ? (
              <ol className="ml-4 flex list-decimal flex-col gap-1 text-pretty">
                {failed.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
