"use client";

import { Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { DeckImage, PhotoFrame, say, useDeck, useImageAspect } from "@/components/meeting/deck-parts";
import { PinchZoom } from "@/components/meeting/pinch-zoom";
import type { MeetingMockup } from "@/lib/meeting/state";
import { cn } from "@/lib/utils";

// The house's pictures in the deck (Keenan, 2026-11-11): framed on the
// page, a tap opens the picture full screen on black, and where the house
// has phone scenes a small phone icon opens the selector (the scenes by the
// names Keenan gave them; a tap swaps the picture with a gentle fade, a tap
// on the icon closes it). Full screen has the same icon and buttons, pinch
// to zoom, and closes on a tap, a swipe down, Escape or its X. The deck
// stays on the same page underneath.

export type HousePicture = { id: string; name: string; url: string };

// The house's pictures for HousePhoto: the Main first, then each scene
// once, by the names Keenan gave them.
export function housePictures(main: MeetingMockup | null, scenes: readonly MeetingMockup[]): HousePicture[] {
  const list = [...(main ? [main] : []), ...scenes.filter((scene) => scene.id !== main?.id)];
  return list.map((item) => ({ id: item.id, name: item.name.trim() || (item.main ? "Lights on" : "Look"), url: item.url }));
}

// The phone icon and its list of scenes, over a picture's top right corner.
export function ScenePicker({
  scenes,
  shownId,
  onPick,
  testId = "scene-picker",
  className,
}: {
  scenes: HousePicture[];
  shownId: string;
  onPick: (id: string) => void;
  testId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (scenes.length < 2) return null;
  return (
    <div
      className={cn("absolute top-4 right-4 z-10 flex flex-col items-end gap-2", className)}
      data-testid={testId}
      // Taps here never reach the picture under it (which opens or closes full screen).
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close the looks" : "Show the looks"}
        onClick={() => setOpen((now) => !now)}
        className={cn(
          "flex size-14 touch-manipulation items-center justify-center rounded-full border outline-none focus-visible:ring-2 focus-visible:ring-ring",
          open ? "border-white bg-white text-navy" : "border-white/40 bg-navy text-white",
        )}
        data-testid="scene-picker-toggle"
      >
        <Smartphone aria-hidden="true" className="size-6" strokeWidth={1.75} />
      </button>
      {open ? (
        <div
          role="group"
          aria-label="Looks"
          className="flex w-60 flex-col gap-2 rounded-2xl border border-white/20 bg-navy p-3 animate-in fade-in duration-200 motion-reduce:animate-none"
        >
          {scenes.map((scene) => {
            const on = scene.id === shownId;
            return (
              <button
                key={scene.id}
                type="button"
                aria-pressed={on}
                onClick={() => onPick(scene.id)}
                className={cn(
                  "flex min-h-12 w-full touch-manipulation items-center rounded-xl border px-4 text-left text-[20px] leading-tight font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-white bg-white text-navy" : "border-white/30 bg-transparent text-white active:bg-white/10",
                )}
                data-testid="scene-picker-option"
                data-scene={scene.id}
              >
                {say(scene.name.trim() || "Lights on")}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

// The pictures stacked, the shown one on top, fading between them.
function Stack({ pictures, shownId, alt, fit = "contain" }: { pictures: HousePicture[]; shownId: string; alt: string; fit?: "contain" | "cover" }) {
  const { reduced } = useDeck();
  return (
    <>
      {pictures.map((picture) => (
        <DeckImage
          key={picture.id}
          photo={{ url: picture.url, focus: [0.5, 0.5] }}
          alt={picture.id === shownId ? alt : ""}
          fit={fit}
          className={cn(!reduced && "transition-opacity duration-300", picture.id === shownId ? "opacity-100" : "opacity-0")}
        />
      ))}
    </>
  );
}

// Full screen on black, in the deck's overlay, over whatever page is on.
export function FullScreenHouse({
  pictures,
  shownId,
  onPick,
  onClose,
  alt,
}: {
  pictures: HousePicture[];
  shownId: string;
  onPick: (id: string) => void;
  onClose: () => void;
  alt: string;
}) {
  const { overlay, reduced, setFullScreen } = useDeck();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setFullScreen?.(true);
    return () => setFullScreen?.(false);
  }, [setFullScreen]);
  const shown = pictures.find((picture) => picture.id === shownId) ?? pictures[0];
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
    // Escape closes it; the arrow keys never turn the deck's page under it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  if (!overlay || !shown) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      data-deck-layer=""
      className={cn("absolute inset-0 z-40 bg-black text-white", !reduced && "animate-in fade-in duration-200")}
      data-testid="deck-full"
    >
      {/* Keyed by the picture, so a new look fades in and starts unzoomed. */}
      <PinchZoom
        key={shown.id}
        src={shown.url}
        alt={alt}
        onTap={onClose}
        onSwipeDown={onClose}
        className={cn(!reduced && "animate-in fade-in duration-300")}
      />
      <button
        ref={close}
        type="button"
        aria-label="Close full screen"
        onClick={onClose}
        className="absolute top-5 left-5 flex size-14 touch-manipulation items-center justify-center rounded-full border border-white/40 bg-black text-white outline-none focus-visible:ring-2 focus-visible:ring-white"
        data-testid="deck-full-close"
      >
        <X aria-hidden="true" className="size-6" strokeWidth={1.75} />
      </button>
      <ScenePicker scenes={pictures} shownId={shown.id} onPick={onPick} className="top-5 right-5" testId="deck-full-picker" />
    </div>,
    overlay,
  );
}

// A house picture on a page: framed, its scenes behind the phone icon when
// it has them (picker), and a tap opens it full screen with the selector.
// shownId/onShow make it follow a page's own choice (the phone page);
// resetOnClose puts it back on the first picture when full screen closes
// (Your price, where the page's picture is the option's).
export function HousePhoto({
  pictures,
  alt,
  picker = true,
  shownId: controlledId,
  onShow,
  resetOnClose = false,
  frameClassName,
  frameTestId,
  children,
}: {
  pictures: HousePicture[];
  alt: string;
  picker?: boolean;
  shownId?: string;
  onShow?: (id: string) => void;
  resetOnClose?: boolean;
  frameClassName?: string;
  frameTestId?: string;
  // In place of the stacked pictures (the slider on Hidden by day).
  children?: ReactNode;
}) {
  const first = pictures[0]?.id ?? "";
  const [ownId, setOwnId] = useState(first);
  const [firstSeen, setFirstSeen] = useState(first);
  if (firstSeen !== first) {
    setFirstSeen(first);
    setOwnId(first);
  }
  const shownId = pictures.some((picture) => picture.id === (controlledId ?? ownId)) ? (controlledId ?? ownId) : first;
  const show = (id: string) => (onShow ? onShow(id) : setOwnId(id));
  const shown = pictures.find((picture) => picture.id === shownId) ?? pictures[0];
  const aspect = useImageAspect(shown?.url);
  const [full, setFull] = useState(false);
  if (!shown) return null;
  return (
    <>
      <PhotoFrame aspect={aspect} className={frameClassName} testId={frameTestId}>
        {children ?? <Stack pictures={pictures} shownId={shownId} alt={alt} />}
        {children ? null : (
          <button
            type="button"
            aria-label="Open the picture full screen"
            onClick={() => setFull(true)}
            className="absolute inset-0 touch-manipulation outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-inset"
            data-testid="house-photo-open"
          />
        )}
        {picker ? <ScenePicker scenes={pictures} shownId={shownId} onPick={show} /> : null}
      </PhotoFrame>
      {full ? (
        <FullScreenHouse
          pictures={pictures}
          shownId={shownId}
          onPick={show}
          alt={alt}
          onClose={() => {
            setFull(false);
            if (resetOnClose) show(first);
          }}
        />
      ) : null}
    </>
  );
}

// Just the open button and the full-screen view, for a picture whose taps
// already mean something on the page (Hidden by day's slider).
export function FullScreenButton({ pictures, alt }: { pictures: HousePicture[]; alt: string }) {
  const [full, setFull] = useState(false);
  const [shownId, setShownId] = useState(pictures[0]?.id ?? "");
  if (pictures.length === 0) return null;
  return (
    <>
      <button
        type="button"
        aria-label="Open the pictures full screen"
        onClick={(event) => {
          event.stopPropagation();
          setFull(true);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="absolute top-4 right-4 z-10 flex size-14 touch-manipulation items-center justify-center rounded-full border border-white/40 bg-navy text-white outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="house-photo-expand"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
      </button>
      {full ? <FullScreenHouse pictures={pictures} shownId={shownId} onPick={setShownId} alt={alt} onClose={() => setFull(false)} /> : null}
    </>
  );
}
