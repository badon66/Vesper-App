"use client";

import { ChevronLeft, CircleAlert } from "lucide-react";
import { useEffect, useRef } from "react";
import { useBoxSize } from "@/components/lights/light-canvas";
import { LitPhoto } from "@/components/lights/lit-photo";
import { bandShare } from "@/components/roofline/view";
import { Button } from "@/components/ui/button";
import type { Look } from "@/lib/deck";
import { TOO_DARK_LINE } from "@/lib/lights/dusk";
import { pickerCanvasLabel } from "@/lib/lights/looks";
import type { TraceGeometry } from "@/lib/lights/place";

// See it lit (round 7, light_picker.tracing): exactly the customer's view,
// in the same frame as the light picker: the photo dimmed to dusk, lit in
// Warm white, steady, framed to the trace's bounds plus 10%, in the space
// above the deck's band (about 30% of the height at 1180x820, 28% at
// 1366x1024). It opens already lit, like a later arrival on the picker:
// prep tracing has no animation. The words under it are for Keenan only,
// with "Not saved yet" after the count while the trace on screen isn't the
// one saved.

export function SeeItLit({
  photoUrl,
  trace,
  look,
  tooDark,
  readBack,
  unsaved = false,
  onClose,
}: {
  photoUrl: string;
  // Stable while open: a new object would place the lights again.
  trace: TraceGeometry & { duskBrightness: number };
  look: Look;
  tooDark: boolean;
  readBack: string | null;
  unsaved?: boolean;
  onClose: () => void;
}) {
  const [boxRef, box] = useBoxSize<HTMLDivElement>();
  const back = useRef<HTMLButtonElement>(null);
  const photoHeight = box.height > 0 ? Math.round(box.height * (1 - bandShare(box.height))) : null;

  useEffect(() => {
    back.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-label="See it lit"
      className="dark fixed inset-0 z-[60] flex flex-col bg-background text-foreground"
      data-testid="roofline-see-it-lit"
    >
      <div className="relative shrink-0" style={{ height: photoHeight ?? "70%" }}>
        <LitPhoto
          photoUrl={photoUrl}
          trace={trace}
          look={look}
          effect="steady"
          dusk={1}
          lit={1}
          label={pickerCanvasLabel(look, "steady")}
          className="absolute inset-0"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-lg font-semibold">What the customer sees</p>
          <p className="text-pretty text-muted-foreground">
            At dusk, in {look.name}, steady, framed as the light picker frames it.
            {readBack ? ` ${readBack}.${unsaved ? " Not saved yet." : ""}` : ""}
          </p>
          {tooDark ? (
            <p className="flex items-center gap-2 font-semibold" role="alert">
              <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
              {TOO_DARK_LINE}
            </p>
          ) : null}
        </div>
        <Button ref={back} type="button" variant="outline" size="lg" onClick={onClose} data-testid="roofline-see-it-lit-back">
          <ChevronLeft aria-hidden="true" />
          Back to the trace
        </Button>
      </div>
    </div>
  );
}
