"use client";

import { Check } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type JSX,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { LitPhoto } from "@/components/lights/lit-photo";
import { DOTS_RESERVE_CSS, TRAY, TRAY_CSS, TRAY_HEIGHT_CSS } from "@/components/meeting/picker/layout";
import {
  arrivalPhase,
  chooseEffect,
  chooseLook,
  initialChoice,
  isControlTarget,
  phaseTimer,
  phaseView,
  pickerLooks,
  resolveLook,
  shouldPlay,
  swipeDelta,
  swipePointer,
  type Phase,
  type PickerChoice,
  type SwipeArea,
} from "@/components/meeting/picker/picker-state";
import { EFFECTS, type Effect, type Look, type Trace } from "@/lib/deck";
import { lookLabel, pickerCanvasLabel } from "@/lib/lights/looks";
import { useReducedMotion } from "@/lib/motion";
import { smartApostrophes } from "@/lib/typography";
import { cn } from "@/lib/utils";

// Try it on your house (round 7, the settled spec's light_picker and the
// motion section's picker rules): the customer's own house at dusk, lit,
// and they choose the look on the spot. The deck's one peak and Keenan's
// trial close.
//
// The photo fills the top, framed to the trace's bounds joined with its
// scale handles (the garage or front door's bottom corners) plus 10%, on one
// explicit crop transform shared by the day photo, its dusk copy, the navy
// multiply layer and the light canvas (Part A's LitPhoto, which is also
// prep's See it lit, so prep shows exactly this). Below it, a solid Night
// Background tray the band's height: the looks as words in one row, then the
// headline and Steady, Twinkle, Chase, Off. On a shorter deck (the installed
// app, the rehearsal frame) the tray keeps a floor and the photo gives way,
// never the tray's contents; its controls always end 24 px above the dots
// and chevrons (TRAY_HEIGHT_CSS, DOTS_RESERVE_CSS). Nothing sits on the
// house, and there is no gold anywhere: the light is the only colour.
//
// Motion: the first time the page is current in a meeting, the photo as
// taken holds 500 ms, dusk falls over 1.2 s and every light fades up
// together over 400 ms; later arrivals, a reload and Reduce Motion open lit.
// A new look cross-fades over 300 ms (100 ms with Reduce Motion), a new
// effect applies at once, Off fades out. Twinkle and Chase start only from a
// tap and pause off the page, while the app is hidden or a layer is open.
//
// Touch: the whole page is touch-action none, so nothing zooms and a tap or
// double tap on the photo does nothing. A one-finger swipe that did not
// start on a button turns the page (onSwipe): on the photo only a real
// flick or a long drag, so a customer tracing their roofline with a finger
// never turns it; a touch that starts on a button never does.
//
// The tray (round 7 review): the chosen look and effect are Night Text with
// a tick, and the tick's room is kept on every button, so no label moves or
// misaligns when chosen. While Off, the look the lights come back on in is
// an outline with its tick, never the fill, so it never reads as on. At
// 1366 the tray grows with the deck's fluid sizes (TRAY_CSS).
//
// CONTRACT
//   <PickerPage
//     picker      { photoUrl, trace }: the photo the roofline was traced on
//                 (signed, loaded crossOrigin anonymous) and its stored trace
//     looks       the looks on offer (DeckPayload.looks)
//     headline    "Try it on your house" (settings.deck)
//     words       the line under it (settings.deck)
//     current     the page is on screen and the scroll has settled
//     stored      MeetingStored.picker, or undefined in a new meeting
//     onStored    called with the new { look, effect, played } on every change
//     layerOpen   a layer covers the deck: hold the lights still, ignore swipes
//     onSwipe     turn the page: 1 next, -1 previous
//   />

export type PickerStored = { look: string; effect: Effect; played: boolean };

export type PickerPageProps = {
  picker: { photoUrl: string; trace: Trace };
  looks: Look[];
  headline: string;
  words: string;
  current: boolean;
  stored: PickerStored | undefined;
  onStored: (next: PickerStored) => void;
  layerOpen: boolean;
  onSwipe: (delta: 1 | -1) => void;
};

export function PickerPage({
  picker,
  looks,
  headline,
  words,
  current,
  stored,
  onStored,
  layerOpen,
  onSwipe,
}: PickerPageProps): JSX.Element {
  const reduced = useReducedMotion();
  const visible = useDocumentVisible();
  const headlineId = useId();
  const trace = useStableTrace(picker.trace);
  const list = useMemo(() => pickerLooks(looks), [looks]);

  // This meeting's look, effect and light-up, kept with the meeting on the
  // iPad (MeetingStored.picker) so a page change, a reload or auto-lock
  // keeps them. Changed only by a tap, or by the light-up starting.
  const [choice, setChoice] = useState<PickerChoice>(() => initialChoice(looks, stored));
  const [phase, setPhase] = useState<Phase>(() => arrivalPhase(choice.played, reduced));
  const latest = useRef(choice);
  const onStoredRef = useRef(onStored);
  useEffect(() => {
    onStoredRef.current = onStored;
  }, [onStored]);

  const update = useCallback((change: (now: PickerChoice) => PickerChoice) => {
    const next = change(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    setChoice(next);
    onStoredRef.current({ look: next.look, effect: next.effect, played: next.played });
  }, []);

  // The photo is ready once it has loaded and the lights are placed. A new
  // photo starts over (LitPhoto is keyed by it).
  const [readyUrl, setReadyUrl] = useState<string | null>(null);
  const ready = readyUrl === picker.photoUrl;
  const photoUrl = picker.photoUrl;
  const onReady = useCallback(() => setReadyUrl(photoUrl), [photoUrl]);

  // The first arrival, one step at a time. It waits for the page to be on
  // screen with its photo loaded; leaving during the dusk fall finishes it
  // at once, so the next arrival opens lit.
  const played = choice.played;
  useEffect(() => {
    const step = phaseTimer(phase, { played, current, ready, reduced });
    if (!step) return;
    const timer = window.setTimeout(() => {
      setPhase(step.next);
      if (step.markPlayed) update((now) => (now.played ? now : { ...now, played: true }));
    }, step.afterMs);
    return () => window.clearTimeout(timer);
  }, [phase, played, current, ready, reduced, update]);

  // With Reduce Motion on the page simply opens lit; its first arrival
  // still counts as played.
  useEffect(() => {
    if (!reduced || !current || !ready || played) return;
    const timer = window.setTimeout(() => update((now) => (now.played ? now : { ...now, played: true })), 0);
    return () => window.clearTimeout(timer);
  }, [reduced, current, ready, played, update]);

  const shown: Phase = reduced ? "lit" : phase;
  const view = phaseView(shown, { reduced, ready });
  const look = resolveLook(list, choice.look);
  const playing = shouldPlay({ effect: choice.effect, current, visible, layerOpen, phase: shown, ready });

  // A tap during the light-up finishes it, with the lights in the new look.
  function finishLightUp() {
    if (shown !== "lit") setPhase("lit");
  }

  function onLook(key: string) {
    finishLightUp();
    update((now) => {
      const next = chooseLook(now, key);
      return next.played ? next : { ...next, played: true };
    });
  }

  function onEffect(effect: Effect) {
    finishLightUp();
    update((now) => {
      const next = chooseEffect(now, effect);
      return next.played ? next : { ...next, played: true };
    });
  }

  // One finger, not starting on a button, clearly sideways: turn the page.
  // On the photo it takes a real flick or a long drag (swipeDelta).
  const swipe = useRef<{ id: number; x: number; y: number; at: number; area: SwipeArea } | null>(null);
  const down = useRef(new Set<number>());
  const photoBox = useRef<HTMLDivElement>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    down.current.add(event.pointerId);
    // A second finger is never a page turn.
    if (down.current.size > 1 || !swipePointer(event.pointerType) || isControlTarget(event.target)) {
      swipe.current = null;
      return;
    }
    const onPhoto = event.target instanceof Node && photoBox.current?.contains(event.target) === true;
    const area: SwipeArea = onPhoto ? { on: "photo", width: event.currentTarget.clientWidth } : { on: "tray" };
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, area };
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    down.current.delete(event.pointerId);
    const from = swipe.current;
    if (!from || from.id !== event.pointerId) return;
    swipe.current = null;
    if (layerOpen) return;
    const delta = swipeDelta({ dx: event.clientX - from.x, dy: event.clientY - from.y, ms: event.timeStamp - from.at }, from.area);
    if (delta) onSwipe(delta);
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLDivElement>) {
    down.current.delete(event.pointerId);
    if (swipe.current?.id === event.pointerId) swipe.current = null;
  }

  return (
    <div
      data-testid="picker-page"
      className="relative flex h-full w-full flex-col overflow-hidden bg-background text-foreground select-none"
      style={{ touchAction: "none", WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div ref={photoBox} className="relative min-h-0 flex-1">
        <LitPhoto
          key={picker.photoUrl}
          photoUrl={picker.photoUrl}
          trace={trace}
          look={look}
          effect={choice.effect}
          dusk={view.dusk}
          duskMs={view.duskMs}
          lit={view.lit}
          fadeMs={view.fadeMs}
          lookFadeMs={view.lookFadeMs}
          playing={playing}
          label={pickerCanvasLabel(look, choice.effect)}
          onReady={onReady}
          className="absolute inset-0"
        />
      </div>

      <div data-testid="picker-tray" className="flex shrink-0 flex-col bg-background" style={{ height: TRAY_HEIGHT_CSS }}>
        <div className="flex min-h-0 flex-1 flex-col" style={{ paddingTop: TRAY.padTop, paddingInline: TRAY.sidePadding }}>
          <div className="my-auto flex flex-col" style={{ gap: TRAY.rowGap }}>
            <div
              role="group"
              aria-labelledby={headline ? headlineId : undefined}
              className="flex"
              style={{ gap: TRAY.lookGap }}
            >
              {list.map((item) => (
                <LookButton
                  key={item.key}
                  look={item}
                  state={item.key !== look.key ? "none" : choice.effect === "off" ? "kept" : "on"}
                  onChoose={onLook}
                />
              ))}
            </div>

            <div className="flex items-start" style={{ gap: TRAY.columnGap }}>
              <div className="min-w-0 flex-1">
                {headline ? (
                  <h2
                    id={headlineId}
                    className="font-semibold tracking-[-0.015em] text-balance"
                    style={{ fontSize: TRAY_CSS.headlineSize, lineHeight: TRAY_CSS.headlineLeading }}
                  >
                    {smartApostrophes(headline)}
                  </h2>
                ) : null}
                {words ? (
                  <p
                    className="text-pretty text-muted-foreground"
                    style={{ fontSize: TRAY_CSS.wordsSize, lineHeight: TRAY_CSS.wordsLeading }}
                  >
                    {smartApostrophes(words)}
                  </p>
                ) : null}
              </div>
              <div role="group" className="flex shrink-0">
                {EFFECTS.map((item, at) => (
                  <EffectButton
                    key={item.key}
                    effect={item.key}
                    label={item.label}
                    chosen={choice.effect === item.key}
                    first={at === 0}
                    last={at === EFFECTS.length - 1}
                    onChoose={onEffect}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Kept clear for the deck's dots and chevrons, with nothing
            tappable within 24 px of them. */}
        <div aria-hidden="true" className="shrink-0" style={{ height: DOTS_RESERVE_CSS }} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the controls

// The chosen thing is Night Text with navy text and a tick (DESIGN.md's
// choice button), never gold; the others a 1 px Night Input outline. While
// Off, the look kept for when the lights come back on is a 2 px Night Text
// outline with its tick and no fill. Colours swap at once: only opacity and
// transform ever animate.
const CONTROL =
  "outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const CHOSEN = "border-foreground bg-foreground text-background";
const KEPT = "border-foreground inset-ring inset-ring-foreground bg-background text-foreground active:bg-secondary";
const UNCHOSEN = "border-input bg-background text-foreground active:bg-secondary";

// A look: its name, and its colour words under it. Words only: no dots,
// chips or swatches, because the house is the swatch. "on": lit on the
// house; "kept": the look while Off; "none": not chosen. The tick follows
// the name, in room every button keeps (Settings' LOOK_ROW counts it), so
// the name and its words never move and always line up.
function LookButton({ look, state, onChoose }: { look: Look; state: "on" | "kept" | "none"; onChoose: (key: string) => void }) {
  return (
    <button
      type="button"
      aria-pressed={state !== "none"}
      aria-label={lookLabel(look)}
      data-testid={`picker-look-${look.key}`}
      data-state={state}
      onClick={() => onChoose(look.key)}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-start justify-center rounded-md border text-left",
        CONTROL,
        state === "on" ? CHOSEN : state === "kept" ? KEPT : UNCHOSEN,
      )}
      style={{ height: TRAY_CSS.lookHeight, paddingInline: TRAY.lookPadding }}
    >
      <span className="flex max-w-full items-center font-semibold" style={{ fontSize: TRAY_CSS.nameSize, lineHeight: TRAY_CSS.nameLeading }}>
        <span className="min-w-0 truncate">{smartApostrophes(look.name)}</span>
        <Check
          aria-hidden="true"
          className={cn("shrink-0", state === "none" && "invisible")}
          style={{ width: TRAY.tickIcon, height: TRAY.tickIcon, marginLeft: TRAY.tick - TRAY.tickIcon }}
          strokeWidth={2.5}
        />
      </span>
      {look.words ? (
        <span
          className={cn("max-w-full truncate", state === "on" ? undefined : "text-muted-foreground")}
          style={{ fontSize: TRAY_CSS.wordsSize, lineHeight: TRAY_CSS.wordsLeading }}
        >
          {smartApostrophes(look.words)}
        </span>
      ) : null}
    </button>
  );
}

// One segment of Steady, Twinkle, Chase, Off: equal widths, joined edges.
// The label is centred and never moves; the chosen one's tick hangs just
// after it, as it follows a chosen look's name.
function EffectButton({
  effect,
  label,
  chosen,
  first,
  last,
  onChoose,
}: {
  effect: Effect;
  label: string;
  chosen: boolean;
  first: boolean;
  last: boolean;
  onChoose: (effect: Effect) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={chosen}
      data-testid={`picker-effect-${effect}`}
      onClick={() => onChoose(effect)}
      className={cn(
        "relative flex items-center justify-center border font-semibold focus-visible:z-20",
        CONTROL,
        first ? "rounded-l-md" : "-ml-px",
        last ? "rounded-r-md" : null,
        chosen ? cn(CHOSEN, "z-10") : UNCHOSEN,
      )}
      style={{
        height: TRAY_CSS.effectHeight,
        width: TRAY_CSS.effectSegment,
        fontSize: TRAY_CSS.wordsSize,
        lineHeight: TRAY_CSS.wordsLeading,
      }}
    >
      <span className="relative">
        {label}
        {chosen ? (
          <Check
            aria-hidden="true"
            className="absolute top-1/2 left-full -translate-y-1/2"
            style={{ width: TRAY_CSS.effectTick, height: TRAY_CSS.effectTick, marginLeft: TRAY.effectTickGap }}
            strokeWidth={2.5}
          />
        ) : null}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- hooks

function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

// Whether the app is on screen (not hidden behind another app or auto-lock).
function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );
}

// The same trace object for as long as its contents are the same, so the
// lights are placed once, whatever the deck does with its props.
function useStableTrace(trace: Trace): Trace {
  const key = JSON.stringify(trace);
  return useMemo(() => JSON.parse(key) as Trace, [key]);
}
