"use client";

import { Check, ChevronLeft, CircleAlert, Images, ImagePlus, Lightbulb, Plus, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { saveRooflineTrace } from "@/app/(app)/app/(owner)/meetings/roofline-actions";
import type { Step } from "@/components/roofline/gesture";
import { PhotoMenu, type TracerPhoto } from "@/components/roofline/photo-menu";
import { SeeItLit } from "@/components/roofline/see-it-lit";
import {
  SCALE_CHOICES,
  canFinish,
  canStartNewLine,
  canUndo,
  changePhoto,
  clearLines,
  commit,
  defaultHandles,
  draftFrom,
  finishedTrace,
  historyOf,
  lineIndex,
  movePoint,
  newLine,
  parseFeet,
  placeHandle,
  placePoint,
  placeSnap,
  scaleFromStored,
  scaleOf,
  scaleProblem,
  setOtherFeet,
  setScaleKind,
  startScale,
  undo,
  type Geo,
  type PointRef,
  type ScaleDraft,
} from "@/components/roofline/trace-edit";
import { checkTraceSave, DIDNT_SAVE, FALLBACK_DUSK_BRIGHTNESS, readBackParts, type TraceSave } from "@/components/roofline/trace-save";
import { TraceStage } from "@/components/roofline/trace-stage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Look, Pt, ScaleKind, TraceScale } from "@/lib/deck";
import { TOO_DARK_LINE, measureDusk } from "@/lib/lights/dusk";
import { SCALE_LOOKS_WRONG, placeLights, traceReadBack, type Size, type TraceGeometry } from "@/lib/lights/place";
import { ROOFLINE_PHOTO_CHANGED } from "@/lib/meetings/prep";
import { cn } from "@/lib/utils";

// Tracing the roofline in prep (round 7, light_picker.tracing; prep item
// 6). Full screen on the lead's Front photo (or another, from Change
// photo). One finger presses, slides with a 3x loupe and lifts to place a
// point; a point dragged moves; a point placed within 20 px of an open
// line's end joins it; two fingers pinch to 4x and pan. Bottom bar: Undo,
// New line, Clear, See it lit, and Done in gold. Then the scale: two
// handles on the garage door's bottom corners and its width, required
// (spacing is never faked), with optional feet per line. Save stores it
// all photo-relative, owner only. Designed for the iPad, usable on a phone
// in landscape. For Keenan only: the read-backs never reach a customer.

export const TRACE_HINT =
  "Tap along the bottom of the roof edge, where the track goes. Trace only what you'd quote. Start a new line for each separate edge.";
const SCALE_FIRST = "Mark the garage door first, so the lights are spaced right.";
const FEET_INVALID = "Check the feet per line: a number like 42, or leave it blank.";
const PHOTO_FAILED = "The photo didn't load. Check your signal, then reload the page.";
const WHOLE_PHOTO: Pt[][] = [
  [
    [0, 0],
    [1, 1],
  ],
];
const FULL = { x: 0, y: 0, width: 1, height: 1 };
const ARM_MS = 4000;

export type TracerStart = {
  photoId: string | null;
  lines: Pt[][];
  lineFeet: (number | null)[];
  scale: TraceScale | null;
};

type SeeLit = { photoUrl: string; trace: TraceGeometry & { duskBrightness: number }; tooDark: boolean; readBack: string | null };

export function RooflineTracer({
  leadId,
  userId,
  heading,
  photos: initialPhotos,
  start,
  photoChanged,
  quoteFeet,
  look,
  backHref,
  backLabel,
}: {
  leadId: string;
  userId: string;
  // The lead's name and address, for Keenan.
  heading: string;
  photos: TracerPhoto[];
  start: TracerStart;
  // A trace was saved on a photo that has since been replaced or removed.
  photoChanged: boolean;
  // The draft quote's feet, when a quote has runs.
  quoteFeet: number | null;
  // Warm white, as Settings has it.
  look: Look;
  backHref: string;
  backLabel: string;
}) {
  const router = useRouter();
  const [photos, setPhotos] = useState(initialPhotos);
  const [history, setHistory] = useState(() => historyOf(draftFrom(start.photoId, start.lines)));
  const draft = history.present;
  const [feetText, setFeetText] = useState<Record<number, string>>(() =>
    Object.fromEntries(start.lineFeet.map((feet, at) => [at + 1, feet == null ? "" : String(feet)])),
  );
  const [scales, setScales] = useState<Record<string, ScaleDraft>>(() =>
    start.photoId && start.scale ? { [start.photoId]: scaleFromStored(start.scale) } : {},
  );
  const [otherText, setOtherText] = useState<Record<string, string>>(() =>
    start.photoId && start.scale?.kind === "other" ? { [start.photoId]: String(start.scale.feet) } : {},
  );
  const [step, setStep] = useState<Step>("trace");
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [darkPhotos, setDarkPhotos] = useState<Record<string, boolean>>({});
  const [failedPhotos, setFailedPhotos] = useState<Record<string, boolean>>({});
  const [seeLit, setSeeLit] = useState<SeeLit | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feetOpen, setFeetOpen] = useState(() => start.lineFeet.some((feet) => feet != null));
  const [focusLine, setFocusLine] = useState<number | null>(null);
  const [armed, setArmed] = useState<{ clear: boolean; leave: boolean }>({ clear: false, leave: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(photoChanged ? ROOFLINE_PHOTO_CHANGED : null);
  const [dirty, setDirty] = useState(false);
  const [announce, setAnnounce] = useState("");
  const photoEls = useRef(new Map<string, HTMLImageElement>());
  const timers = useRef<{ clear?: number; leave?: number }>({});

  const photoId = draft.photoId;
  const photo = photos.find((item) => item.id === photoId) ?? null;
  const natural = photoId ? (sizes[photoId] ?? null) : null;
  const scaleDraft = photoId ? (scales[photoId] ?? null) : null;
  const scale = scaleOf(scaleDraft);

  const feetById = useMemo(() => {
    const out: Record<number, number | null> = {};
    for (const [id, text] of Object.entries(feetText)) {
      const feet = parseFeet(text);
      out[Number(id)] = typeof feet === "number" ? feet : null;
    }
    return out;
  }, [feetText]);
  const feetInvalid = (id: number) => parseFeet(feetText[id] ?? "") === "invalid";
  const finished = useMemo(() => finishedTrace(draft, feetById), [draft, feetById]);
  const lineNumbers = useMemo(() => new Map(finished.ids.map((id, at) => [id, at + 1])), [finished]);
  const geometry = useMemo(
    () => (scale && finished.lines.length > 0 ? { lines: finished.lines, lineFeet: finished.lineFeet, scale } : null),
    [scale, finished],
  );
  const placement = useMemo(() => (geometry && natural ? placeLights(geometry, natural) : null), [geometry, natural]);
  const readBack = geometry && natural ? traceReadBack(geometry, natural) : null;
  const readBackText = readBack ? readBackParts(readBack, quoteFeet) : null;
  const photoDark = photoId ? darkPhotos[photoId] === true : false;
  const photoFailed = photoId ? failedPhotos[photoId] === true : false;

  // ------------------------------------------------------------ arming (Tap again)

  const disarm = useCallback((kind: "clear" | "leave") => {
    window.clearTimeout(timers.current[kind]);
    setArmed((now) => (now[kind] ? { ...now, [kind]: false } : now));
  }, []);

  function arm(kind: "clear" | "leave") {
    window.clearTimeout(timers.current[kind]);
    setArmed((now) => ({ ...now, [kind]: true }));
    timers.current[kind] = window.setTimeout(() => setArmed((now) => ({ ...now, [kind]: false })), ARM_MS);
  }

  useEffect(() => {
    const pending = timers.current;
    return () => {
      window.clearTimeout(pending.clear);
      window.clearTimeout(pending.leave);
    };
  }, []);

  // Leaving with changes not saved asks first (the browser's own question
  // on a reload or a closed tab).
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [dirty]);

  // A keyboard's Undo, on the trace.
  useEffect(() => {
    if (step !== "trace" || menuOpen || seeLit) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === "z") {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
        event.preventDefault();
        setHistory((now) => undo(now));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, menuOpen, seeLit]);

  // ------------------------------------------------------------ the photo

  const onPhotoLoad = useCallback((image: HTMLImageElement) => {
    const id = image.dataset.photoId;
    if (!id) return;
    photoEls.current.set(id, image);
    const size = { width: image.naturalWidth, height: image.naturalHeight };
    setSizes((now) => (now[id]?.width === size.width && now[id]?.height === size.height ? now : { ...now, [id]: size }));
    // Taken after dark? Said at once, before any tracing.
    const measured = measureDusk(image, WHOLE_PHOTO);
    const tooDark = measured?.tooDark ?? false;
    setDarkPhotos((now) => (now[id] === tooDark ? now : { ...now, [id]: tooDark }));
  }, []);

  const onPhotoError = useCallback((id: string) => {
    setFailedPhotos((now) => (now[id] ? now : { ...now, [id]: true }));
  }, []);

  // ------------------------------------------------------------ editing

  function changed() {
    setDirty(true);
    setError(null);
    setNotice(null);
    disarm("clear");
    disarm("leave");
  }

  function onPlace(pt: Pt, geo: Geo) {
    const next = placePoint(draft, pt, geo);
    if (next === draft) return;
    const snapped = placeSnap(draft, pt, geo).snapped;
    setHistory((now) => commit(now, next));
    changed();
    const at = lineIndex(next, next.active);
    const count = at >= 0 ? next.lines[at].points.length : 0;
    setAnnounce(
      snapped
        ? `Joined to the end of line ${snapped.line + 1}.`
        : count === 1
          ? `Started line ${at + 1}.`
          : `Point ${count} on line ${at + 1}.`,
    );
  }

  function onMove(ref: PointRef, pt: Pt, geo: Geo) {
    const next = movePoint(draft, ref, pt, geo);
    if (next === draft) return;
    setHistory((now) => commit(now, next));
    changed();
    setAnnounce(`Moved a point on line ${ref.line + 1}.`);
  }

  function updateScale(update: (scale: ScaleDraft) => ScaleDraft) {
    if (!photoId) return;
    setScales((now) => ({ ...now, [photoId]: update(now[photoId] ?? startScale(defaultHandles(FULL))) }));
    changed();
  }

  function onHandle(which: 0 | 1, pt: Pt) {
    updateScale((now) => placeHandle(now, which, pt));
    setAnnounce(which === 0 ? "First corner placed." : "Second corner placed.");
  }

  function onUndo() {
    if (!canUndo(history)) return;
    setHistory((now) => undo(now));
    changed();
    setAnnounce("Undone.");
  }

  function onNewLine() {
    const next = newLine(draft);
    if (next === draft) return;
    setHistory((now) => commit(now, next));
    changed();
    setAnnounce("The next point starts a new line.");
  }

  function onClear() {
    if (draft.lines.length === 0) return;
    if (!armed.clear) {
      arm("clear");
      return;
    }
    setHistory((now) => commit(now, clearLines(now.present)));
    changed();
    setAnnounce("Cleared. Undo brings the lines back.");
  }

  function onPick(id: string) {
    setMenuOpen(false);
    if (id === photoId) return;
    setHistory((now) => commit(now, changePhoto(now.present, id)));
    changed();
    setStep("trace");
  }

  function onUploaded(uploaded: TracerPhoto) {
    setPhotos((now) => (now.some((item) => item.id === uploaded.id) ? now : [...now, uploaded]));
    onPick(uploaded.id);
  }

  function onLeave(event: ReactMouseEvent<HTMLAnchorElement>) {
    if (!dirty || armed.leave) return;
    event.preventDefault();
    arm("leave");
  }

  // ------------------------------------------------------------ steps

  function toScale(message: string | null = null) {
    if (!canFinish(draft) || !photoId) return;
    setScales((now) => (now[photoId] ? now : { ...now, [photoId]: startScale(defaultHandles(FULL)) }));
    setStep("scale");
    setError(null);
    setNotice(message);
    setMenuOpen(false);
  }

  function onKind(kind: ScaleKind) {
    updateScale((now) => setScaleKind(now, kind));
  }

  function onOtherFeet(text: string) {
    if (!photoId) return;
    setOtherText((now) => ({ ...now, [photoId]: text }));
    const feet = parseFeet(text);
    updateScale((now) => setOtherFeet(now, typeof feet === "number" ? feet : null));
  }

  function onLineFeet(id: number, text: string) {
    setFeetText((now) => ({ ...now, [id]: text }));
    changed();
  }

  // The dusk numbers, measured from the photo inside the trace's bounds.
  function measure(lines: Pt[][]) {
    const image = photoId ? photoEls.current.get(photoId) : undefined;
    return image ? measureDusk(image, lines) : null;
  }

  function onSeeItLit() {
    if (!canFinish(draft) || !photo) return;
    if (!geometry) {
      toScale(SCALE_FIRST);
      return;
    }
    const measured = measure(geometry.lines);
    setSeeLit({
      photoUrl: photo.url,
      trace: { ...geometry, duskBrightness: measured?.brightness ?? FALLBACK_DUSK_BRIGHTNESS },
      tooDark: measured?.tooDark ?? false,
      readBack: readBackText?.traced ?? null,
    });
  }

  const closeSeeLit = useCallback(() => setSeeLit(null), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  async function onSave() {
    if (saving || !photoId || !natural) return;
    const problem = scaleProblem(scaleDraft);
    if (problem || !scale) {
      setError(problem ?? "Drag both handles to the garage door's bottom corners.");
      return;
    }
    if (finished.ids.some((id) => feetInvalid(id))) {
      setFeetOpen(true);
      setError(FEET_INVALID);
      return;
    }
    const measured = measure(finished.lines);
    if (measured?.tooDark) {
      setError(TOO_DARK_LINE);
      return;
    }
    const payload: TraceSave = {
      leadId,
      photoId,
      photo: natural,
      lines: finished.lines,
      lineFeet: finished.lineFeet,
      scale,
      luminance: measured?.luminance ?? null,
      duskBrightness: measured?.brightness ?? FALLBACK_DUSK_BRIGHTNESS,
    };
    const local = checkTraceSave(payload);
    if (!local.ok) {
      setError(local.error);
      return;
    }
    setSaving(true);
    setError(null);
    const result = await saveRooflineTrace(payload).catch(() => ({ ok: false as const, error: DIDNT_SAVE }));
    if (!result.ok) {
      setSaving(false);
      setError(result.error);
      return;
    }
    setDirty(false);
    setAnnounce("Saved.");
    router.push(backHref);
  }

  // ------------------------------------------------------------ what the bars say

  function currentStatus(): { tone: Tone; text: ReactNode } | null {
    if (error) return { tone: "error", text: error };
    if (photoFailed) return { tone: "error", text: PHOTO_FAILED };
    if (photoDark) return { tone: "warn", text: TOO_DARK_LINE };
    if (notice) return { tone: "warn", text: notice };
    if (readBack?.tooMany) return { tone: "warn", text: SCALE_LOOKS_WRONG };
    if (step === "scale") {
      const problem = scaleProblem(scaleDraft);
      if (problem) return { tone: "hint", text: problem };
    } else if (!canFinish(draft)) {
      return { tone: "hint", text: TRACE_HINT };
    }
    if (readBackText) {
      return {
        tone: "info",
        text: (
          <>
            <span data-testid="roofline-read-back">{readBackText.traced}</span>
            {readBackText.quote ? <span className="font-normal text-muted-foreground"> · {readBackText.quote}</span> : null}
          </>
        ),
      };
    }
    return step === "trace" ? { tone: "hint", text: "Tap Done when the roofline is traced, then mark the garage door." } : null;
  }
  const status = currentStatus();

  const stageLabel =
    step === "trace"
      ? "The photo. Press, slide and lift to place a point. Drag a point to move it. Pinch with two fingers to zoom."
      : "The photo. Drag the two handles to the garage door's bottom corners.";

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col bg-background text-foreground" style={{ overscrollBehavior: "none" }} data-testid="roofline-tracer">
      <header className="relative flex h-14 shrink-0 touch-manipulation items-center gap-3 border-b px-3 pt-[env(safe-area-inset-top)] [@media(max-height:500px)]:h-12">
        {step === "trace" ? (
          <Link
            href={backHref}
            onClick={onLeave}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="roofline-back"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
            {armed.leave ? "Tap again to leave" : backLabel}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              setStep("trace");
              setError(null);
              setNotice(null);
            }}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="roofline-back-to-trace"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
            Back to the trace
          </button>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="truncate text-base leading-tight font-bold">{step === "trace" ? "Trace the roofline" : "Mark the garage door"}</h1>
          <p className="truncate text-sm leading-tight text-muted-foreground">{heading}</p>
        </div>
        {step === "trace" && photos.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="dialog"
            data-testid="roofline-change-photo"
          >
            <Images aria-hidden="true" />
            Change photo
          </Button>
        ) : null}
        {menuOpen ? (
          <PhotoMenu
            leadId={leadId}
            userId={userId}
            photos={photos}
            currentId={photoId}
            hasLines={draft.lines.length > 0}
            onPick={onPick}
            onUploaded={onUploaded}
            onClose={closeMenu}
          />
        ) : null}
      </header>

      <TraceStage
        photo={photo ? { id: photo.id, url: photo.url } : null}
        natural={natural}
        onPhotoLoad={onPhotoLoad}
        onPhotoError={onPhotoError}
        step={step}
        draft={draft}
        scale={step === "scale" ? scaleDraft : null}
        lights={placement?.lights ?? null}
        pitch={placement?.pitch ?? 0}
        lineNumbers={lineNumbers}
        focusLine={focusLine}
        onPlace={onPlace}
        onMove={onMove}
        onHandle={onHandle}
        label={stageLabel}
        empty={
          <div className="flex max-w-md flex-col items-center gap-4 text-center">
            <p className="text-lg font-semibold">No house photo on this lead yet</p>
            <p className="text-pretty text-muted-foreground">
              Upload a photo taken straight on from across the street, with the whole roofline in.
            </p>
            <Button type="button" size="lg" onClick={() => setMenuOpen(true)} data-testid="roofline-empty-upload">
              <ImagePlus aria-hidden="true" />
              Upload a photo
            </Button>
          </div>
        }
      />

      <footer className="shrink-0 touch-manipulation border-t px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] [@media(max-height:500px)]:pt-1.5 [@media(max-height:500px)]:pb-2">
        {step === "trace" ? <StatusLine status={status} /> : null}
        {step === "trace" ? (
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onUndo} disabled={!canUndo(history)} data-testid="roofline-undo">
              <Undo2 aria-hidden="true" />
              Undo
            </Button>
            <Button type="button" variant="outline" onClick={onNewLine} disabled={!canStartNewLine(draft)} data-testid="roofline-new-line">
              <Plus aria-hidden="true" />
              New line
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClear}
              disabled={draft.lines.length === 0}
              className={cn(armed.clear && "border-foreground")}
              data-testid="roofline-clear"
            >
              {armed.clear ? "Tap again to clear" : "Clear"}
            </Button>
            <div className="flex-1" />
            <Button type="button" variant="outline" onClick={onSeeItLit} disabled={!canFinish(draft) || !photo} data-testid="roofline-see-it-lit">
              <Lightbulb aria-hidden="true" />
              See it lit
            </Button>
            <Button type="button" onClick={() => toScale()} disabled={!canFinish(draft) || !photo} className="px-8" data-testid="roofline-done">
              Done
            </Button>
          </div>
        ) : (
          <>
            {feetOpen && finished.ids.length > 0 ? (
              <div className="mb-2 flex items-center gap-2 overflow-x-auto pb-1" data-testid="roofline-line-feet">
                {finished.ids.map((id, at) => (
                  <label key={id} className="flex shrink-0 items-center gap-2 text-sm font-semibold">
                    <span>Line {at + 1} is</span>
                    <Input
                      inputMode="decimal"
                      enterKeyHint="done"
                      className="w-20"
                      value={feetText[id] ?? ""}
                      aria-invalid={feetInvalid(id) || undefined}
                      onChange={(event) => onLineFeet(id, event.currentTarget.value)}
                      onFocus={() => setFocusLine(id)}
                      onBlur={() => setFocusLine(null)}
                    />
                    <span className="pr-3">ft</span>
                  </label>
                ))}
                <p className="shrink-0 text-sm text-muted-foreground">Optional. A measured line gets exactly its own lights.</p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <span className="pr-1 text-sm font-semibold text-muted-foreground max-[900px]:sr-only" id="roofline-door-label">
                The door is
              </span>
              <div role="group" aria-labelledby="roofline-door-label" className="flex flex-wrap items-center gap-2">
                {SCALE_CHOICES.map((choice) => {
                  const chosen = (scaleDraft?.kind ?? "double") === choice.kind;
                  return (
                    <button
                      key={choice.kind}
                      type="button"
                      aria-pressed={chosen}
                      onClick={() => onKind(choice.kind)}
                      className={cn(
                        "inline-flex h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        chosen ? "border-foreground bg-foreground text-background" : "border-input bg-background hover:bg-muted",
                      )}
                      data-testid={`roofline-door-${choice.kind}`}
                    >
                      {chosen ? <Check aria-hidden="true" className="size-4" /> : null}
                      {choice.label}
                    </button>
                  );
                })}
                {scaleDraft?.kind === "other" ? (
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <Input
                      inputMode="decimal"
                      enterKeyHint="done"
                      className="w-20"
                      aria-label="The door's width in feet"
                      value={photoId ? (otherText[photoId] ?? "") : ""}
                      onChange={(event) => onOtherFeet(event.currentTarget.value)}
                      data-testid="roofline-other-feet"
                    />
                    ft
                  </label>
                ) : null}
              </div>
              {finished.ids.length > 0 ? (
                <Button type="button" variant="ghost" onClick={() => setFeetOpen((open) => !open)} aria-expanded={feetOpen} data-testid="roofline-feet-toggle">
                  Feet per line
                </Button>
              ) : null}
            </div>
            {/* What's still needed (or the read-back), then See it lit and
                Save at the bottom right, in thumb reach. */}
            <div className="mt-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <StatusLine status={status} />
              </div>
              <Button type="button" variant="outline" onClick={onSeeItLit} data-testid="roofline-see-it-lit-scale">
                <Lightbulb aria-hidden="true" />
                See it lit
              </Button>
              <Button type="button" onClick={() => void onSave()} disabled={saving} className="px-8" data-testid="roofline-save">
                {saving ? "Saving" : "Save"}
              </Button>
            </div>
          </>
        )}
      </footer>

      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      {seeLit ? (
        <SeeItLit photoUrl={seeLit.photoUrl} trace={seeLit.trace} look={look} tooDark={seeLit.tooDark} readBack={seeLit.readBack} onClose={closeSeeLit} />
      ) : null}
    </div>
  );
}

type Tone = "hint" | "info" | "warn" | "error";

// One line above the buttons: the hint, the read-back, or what's wrong.
function StatusLine({ status }: { status: { tone: Tone; text: ReactNode } | null }) {
  if (!status) return <p className="min-h-6" aria-hidden="true" />;
  const { tone, text } = status;
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "flex min-h-6 items-start gap-2 text-pretty [@media(max-height:500px)]:text-sm",
        tone === "hint" && "text-muted-foreground",
        tone === "info" && "font-semibold",
        tone === "warn" && "font-semibold",
        tone === "error" && "font-semibold text-destructive",
      )}
      data-testid="roofline-status"
      data-tone={tone}
    >
      {tone === "warn" || tone === "error" ? <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" /> : null}
      <span>{text}</span>
    </p>
  );
}
