"use client";

import { ExternalLink } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import type { DeckSlot } from "@/lib/deck";
import { cn } from "@/lib/utils";

import {
  exampleClearance,
  exampleLayout,
  exampleSide,
  looksLoaded,
  NARROW_PX,
  REHEARSAL_WORDS,
  SCENARIO_LINE_PX,
  scenarioLines,
  type Rect,
  type RehearsalExample,
} from "./rehearsal";

// An empty slot in the rehearsal view (round 7, rehearsal_and_references):
// its first example to copy, in a dashed Night Text frame with a solid
// "Example to copy" tag and "From [site]", so it can never pass for one of
// Keenan's photos. The picture loads in the browser straight from the site
// it lives on, with no referrer and no CORS request, so the service worker
// never keeps it (only signed storage photos asked for in CORS mode are
// kept). When the site won't show it, or the link is a page rather than a
// picture, the frame holds the slot's name, the shot to take and "Open the
// example" instead. Never in a meeting: the deck draws this only through
// the rehearsal's renderEmptySlot.
//
// It fills the box the deck gives it (the deck's SlotExample sets absolute
// inset-0), and lays itself out for that box's size: a band page's photo,
// a split page's left side, half of the warm and cool pair, a contact-sheet
// tile. Where the box starts under the deck's exit, the tags start right of
// it; where it runs under the bottom row, the frame ends above the dots and
// chevrons, as the deck's own pictures do (exampleClearance).

type Box = { width: number; height: number; inButton: boolean; tagsLeft: number; lift: number };

// The deck's own frame: the page this example is on (pages sit side by side
// in the pager, so the page, not the screen, is the frame), or for a layer
// the deck's root, which the layer covers.
function deckFrame(node: HTMLElement): { frame: HTMLElement | null; root: HTMLElement | null } {
  let root: HTMLElement | null = null;
  // The deck's root holds the pager ("Meeting screens") and is its own size
  // container.
  for (let at = node.parentElement; at; at = at.parentElement) {
    if (at.querySelector(':scope > [aria-label="Meeting screens"]') || getComputedStyle(at).containerType === "size") {
      root = at;
      break;
    }
  }
  const page = node.closest<HTMLElement>("section[data-page]");
  return { frame: page ?? root, root };
}

const relative = (rect: DOMRect, to: DOMRect): Rect => ({
  left: rect.left - to.left,
  top: rect.top - to.top,
  right: rect.right - to.left,
  bottom: rect.bottom - to.top,
});

// The bottom row's dots and chevrons, as one box in the deck's frame, or
// null while they are hidden.
function bottomRow(root: HTMLElement): Rect | null {
  const row = root.querySelector('[data-deck-row="nav"]');
  if (!row) return null;
  const to = root.getBoundingClientRect();
  const parts = Array.from(row.children)
    .map((child) => child.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (parts.length === 0) return null;
  return {
    left: Math.min(...parts.map((rect) => rect.left)) - to.left,
    top: Math.min(...parts.map((rect) => rect.top)) - to.top,
    right: Math.max(...parts.map((rect) => rect.right)) - to.left,
    bottom: Math.max(...parts.map((rect) => rect.bottom)) - to.top,
  };
}

function measure(node: HTMLElement, tiny: boolean): Box {
  const own = node.getBoundingClientRect();
  const { frame, root } = deckFrame(node);
  const base = tiny ? 12 : 16;
  const clear = frame
    ? exampleClearance(relative(own, frame.getBoundingClientRect()), root ? bottomRow(root) : null, base)
    : { tagsLeft: base, lift: 0 };
  return {
    width: Math.round(own.width),
    height: Math.round(own.height),
    inButton: Boolean(node.parentElement?.closest("button, a")),
    ...clear,
  };
}

const sameBox = (a: Box | null, b: Box) =>
  a !== null && a.width === b.width && a.height === b.height && a.inButton === b.inButton && a.tagsLeft === b.tagsLeft && a.lift === b.lift;

const noCallout: CSSProperties = { WebkitTouchCallout: "none" };

export function ExampleShot({ slot, example }: { slot: DeckSlot; example: RehearsalExample | null }) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  // The box's own size and where it sits in the deck (it changes with the
  // iPad's rotation, and the deck mounts it inside layers and tiles of every
  // size).
  useEffect(() => {
    if (!node || typeof ResizeObserver === "undefined") return;
    const update = () =>
      setBox((now) => {
        // Its layout at the size it is now, not the size it was.
        const tiny = exampleLayout(node.getBoundingClientRect()) === "tiny";
        const next = measure(node, tiny);
        return sameBox(now, next) ? now : next;
      });
    const observer = new ResizeObserver(update);
    observer.observe(node);
    const { root } = deckFrame(node);
    if (root) observer.observe(root);
    return () => observer.disconnect();
  }, [node]);

  const layout = exampleLayout(box);
  const lift = box?.lift ?? 0;
  const side = exampleSide(slot);
  const image = example?.imageUrl && failedUrl !== example.imageUrl ? example.imageUrl : null;
  // A link can't sit inside the contact sheet's tile, which is itself a button.
  const link = layout === "full" && !box?.inButton ? (example?.pageUrl ?? null) : null;
  const site = layout !== "tiny" ? (example?.site ?? null) : null;
  const lines = layout === "full" && box ? scenarioLines(box.height) : 0;

  return (
    <div
      ref={setNode}
      data-testid="rehearsal-example"
      data-slot={slot.key}
      className="absolute inset-0 overflow-hidden bg-background text-foreground select-none"
    >
      {image ? (
        <div className="absolute inset-[14px] overflow-hidden rounded-sm bg-card" style={{ bottom: 14 + lift }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- another site's photo, hotlinked with no referrer, never stored, proxied or kept offline */}
          <img
            src={image}
            alt={`${REHEARSAL_WORDS.tag}: ${slot.name}${example?.site ? `, from ${example.site}` : ""}`}
            referrerPolicy="no-referrer"
            decoding="async"
            draggable={false}
            onError={() => setFailedUrl(image)}
            onLoad={(event) => {
              if (!looksLoaded(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)) setFailedUrl(image);
            }}
            className="size-full object-cover select-none"
            style={noCallout}
          />
        </div>
      ) : (
        <div
          style={{ bottom: 14 + lift }}
          className={cn(
            "absolute inset-[14px] flex flex-col justify-center gap-4 text-left",
            // Laid out for its box once measured, a moment after it mounts.
            !box && "invisible",
            layout === "full"
              ? box && box.width < NARROW_PX
                ? "px-6 pt-24 pb-10"
                : "px-12 pt-24 pb-10"
              : layout === "compact"
                ? "px-6 pt-20 pb-6"
                : "px-3 pt-12 pb-3",
            // Hidden by day: the words stay on the half that shows, clear of
            // the slider's grip and its Day and Night plates.
            side === "left" && "pr-[calc(50%+7.5rem)]",
            side === "right" && "pl-[calc(50%+7.5rem)]",
          )}
        >
          <p
            className={cn(
              "max-w-[40rem] font-semibold text-pretty",
              layout === "full" ? "line-clamp-2 text-[24px] leading-[1.2]" : layout === "compact" ? "line-clamp-3 text-[20px] leading-[1.25]" : "line-clamp-2 text-[16px] leading-[1.25]",
            )}
          >
            {slot.name}
          </p>
          {lines > 0 ? (
            <p
              className="max-w-[40rem] overflow-hidden text-[20px] text-pretty text-muted-foreground"
              style={{ lineHeight: `${SCENARIO_LINE_PX}px`, display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: lines }}
            >
              {slot.scenario}
            </p>
          ) : null}
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer noopener"
              referrerPolicy="no-referrer"
              // On Hidden by day the picture's own tap moves the line; this
              // tap only opens the example.
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              className="inline-flex min-h-11 w-fit items-center gap-2 rounded-md text-[20px] font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {REHEARSAL_WORDS.open}
              <ExternalLink aria-hidden="true" className="size-5" />
              <span className="sr-only"> (opens a new tab)</span>
            </a>
          ) : null}
        </div>
      )}

      {/* The frame: dashed Night Text, so the example never reads as a photo of ours. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-2 rounded-md border-2 border-dashed border-foreground"
        style={{ bottom: 8 + lift }}
      />

      {/* The tags: right of the deck's exit when the box starts under it. */}
      <div
        // On Hidden by day each example keeps its tags on the half that shows.
        style={
          side === "right"
            ? undefined
            : {
                left: box?.tagsLeft ?? 16,
                maxWidth: `calc(${side === "left" ? "50%" : "100%"} - ${(box?.tagsLeft ?? 16) + (layout === "tiny" ? 12 : 16)}px)`,
              }
        }
        className={cn(
          "pointer-events-none absolute flex flex-col gap-1.5",
          !box && "invisible",
          layout === "tiny"
            ? cn("top-3", side === "right" ? "right-3 max-w-[calc(50%-1.5rem)] items-end" : "items-start")
            : side === "right"
              ? "top-5 right-4 max-w-[calc(50%-2rem)] items-end"
              : "top-5 items-start",
        )}
      >
        <span
          className={cn(
            "rounded-sm bg-foreground px-2.5 py-1 font-bold whitespace-nowrap text-background",
            layout === "tiny" ? "text-[14px] leading-[1.2]" : "text-[18px] leading-[1.2]",
          )}
        >
          {REHEARSAL_WORDS.tag}
        </span>
        {site ? (
          <span className="line-clamp-2 max-w-full rounded-sm bg-background px-2.5 py-1 text-[18px] leading-[1.2] break-words text-foreground" title={site}>
            {REHEARSAL_WORDS.from(site)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
