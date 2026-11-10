"use client";

import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent as ReactWheelEvent } from "react";
import { useBoxSize } from "@/components/lights/light-canvas";
import {
  IDLE,
  gestureStep,
  loupeFinger,
  pendingMoveSnap,
  pendingPlace,
  previewDraft,
  previewScale,
  type Gesture,
  type PointerInput,
  type Step,
} from "@/components/roofline/gesture";
import { activeLine, ptToScreen, scaleFeet, type End, type Geo, type PointRef, type ScaleDraft, type TraceDraft } from "@/components/roofline/trace-edit";
import { LOUPE_SIZE, fitPhoto, loupeSpot, loupeView, zoomAt } from "@/components/roofline/view";
import type { Pt } from "@/lib/deck";
import type { Transform } from "@/lib/lights/frame";
import type { Light, Size, Vec } from "@/lib/lights/place";

// The tracer's stage (round 7, light_picker.tracing): the photo fitted
// whole on Night Background, the lines over it as a 2 px Night Text stroke,
// the real spacing as small warm points once the scale is set, a 3x loupe
// (120 px, crosshair) floating above the finger, and two fingers to pinch
// to 4x and pan. Everything appears at once, with no animation. The photo
// loads crossOrigin anonymous, so prep can measure its dusk.

// The warm points that preview the spacing: Warm white's colour.
const WARM_POINT = "#FFB46B";
// A thin dark edge under each stroke, so a light line still reads on a
// bright sky or a white soffit.
const UNDER = "#0c1b26";

export type TraceStageProps = {
  photo: { id: string; url: string } | null;
  natural: Size | null;
  // The photo's id rides on the image as data-photo-id.
  onPhotoLoad: (image: HTMLImageElement) => void;
  onPhotoError: (photoId: string) => void;
  step: Step;
  draft: TraceDraft;
  scale: ScaleDraft | null;
  // The preview lights, in the photo's own px, once the scale is set.
  lights: Light[] | null;
  // Photo px between neighbouring lights.
  pitch: number;
  // Line id -> the number Keenan sees beside it (scale step).
  lineNumbers: Map<number, number>;
  focusLine: number | null;
  onPlace: (pt: Pt, geo: Geo) => void;
  onMove: (ref: PointRef, pt: Pt, geo: Geo) => void;
  onHandle: (which: 0 | 1, pt: Pt) => void;
  label: string;
  // What the stage shows with no photo.
  empty?: ReactNode;
};

type ViewState = { key: string; view: Transform };

export function TraceStage({
  photo,
  natural,
  onPhotoLoad,
  onPhotoError,
  step,
  draft,
  scale,
  lights,
  pitch,
  lineNumbers,
  focusLine,
  onPlace,
  onMove,
  onHandle,
  label,
  empty,
}: TraceStageProps) {
  const [stageRef, stage] = useBoxSize<HTMLDivElement>();
  const [gesture, setGesture] = useState<Gesture>(IDLE);
  const gestureRef = useRef<Gesture>(IDLE);
  const [viewState, setViewState] = useState<ViewState | null>(null);

  const ready = Boolean(photo && natural && stage.width > 0 && stage.height > 0);
  const key = photo && natural ? `${photo.id}:${natural.width}x${natural.height}:${stage.width}x${stage.height}` : "";
  const base = useMemo<Transform>(() => (natural ? fitPhoto(natural, stage) : { scale: 1, x: 0, y: 0 }), [natural, stage]);
  // A new photo or a new stage size (a rotation) fits the photo again.
  const view = viewState && viewState.key === key ? viewState.view : base;
  const geo: Geo = useMemo(() => ({ photo: natural ?? { width: 1, height: 1 }, view }), [natural, view]);

  // An image that finished loading before the page was alive never fires
  // onLoad, so a complete one is reported here.
  const measureRef = useCallback(
    (image: HTMLImageElement | null) => {
      if (image && image.complete && image.naturalWidth > 0) onPhotoLoad(image);
    },
    [onPhotoLoad],
  );

  function feed(type: PointerInput["type"], event: ReactPointerEvent<HTMLDivElement>) {
    if (!ready) return;
    const box = event.currentTarget.getBoundingClientRect();
    const at: Vec = [event.clientX - box.left, event.clientY - box.top];
    const result = gestureStep(gestureRef.current, { type, id: event.pointerId, at }, { step, draft, scale, geo, base, stage });
    gestureRef.current = result.gesture;
    setGesture(result.gesture);
    if (result.view) setViewState({ key, view: result.view });
    if (result.place) onPlace(result.place, geo);
    if (result.move) onMove(result.move.ref, result.move.pt, geo);
    if (result.handle) onHandle(result.handle.which, result.handle.pt);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    feed("down", event);
  }

  // A mouse wheel or a trackpad zooms about the pointer (a desk, not the
  // iPad, where two fingers do it).
  function onWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!ready || !natural || gestureRef.current.kind !== "idle") return;
    const box = event.currentTarget.getBoundingClientRect();
    const factor = Math.exp(-event.deltaY * 0.0015);
    setViewState({ key, view: zoomAt(view, factor, [event.clientX - box.left, event.clientY - box.top], base, natural, stage) });
  }

  // What to draw: the lines mid-drag, the handles mid-drag, and where a
  // press would land.
  const shownDraft = ready ? previewDraft(draft, gesture, geo) : draft;
  const shownScale = ready ? previewScale(scale, gesture, geo) : scale;
  const pending = ready && step === "trace" ? pendingPlace(gesture, { draft, geo }) : null;
  const moveSnapEnd = ready && step === "trace" ? pendingMoveSnap(draft, gesture, geo) : null;
  const snapRing: End | null = pending?.snapped ?? moveSnapEnd;
  const finger = ready ? loupeFinger(gesture) : null;
  const active = step === "trace" ? activeLine(shownDraft) : null;
  const lastOfActive = active ? active.points[active.points.length - 1] : null;

  return (
    <div
      ref={stageRef}
      role="application"
      aria-label={label}
      aria-roledescription="tracing area"
      className="relative min-h-0 flex-1 touch-none overflow-hidden bg-background select-none"
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={(event) => feed("move", event)}
      onPointerUp={(event) => feed("up", event)}
      onPointerCancel={(event) => feed("cancel", event)}
      onWheel={onWheel}
      onContextMenu={(event) => event.preventDefault()}
      data-testid="roofline-stage"
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- a private photo behind a short-lived signed link, measured for dusk
        <img
          key={photo.id}
          ref={measureRef}
          src={photo.url}
          alt=""
          aria-hidden="true"
          crossOrigin="anonymous"
          draggable={false}
          decoding="async"
          onLoad={(event) => onPhotoLoad(event.currentTarget)}
          onError={() => onPhotoError(photo.id)}
          data-photo-id={photo.id}
          className="pointer-events-none absolute top-0 left-0"
          style={{
            width: natural?.width,
            height: natural?.height,
            maxWidth: "none",
            transformOrigin: "0 0",
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            opacity: ready ? 1 : 0,
            WebkitTouchCallout: "none",
          }}
          data-testid="roofline-photo"
        />
      ) : null}

      {!photo && empty ? <div className="absolute inset-0 flex items-center justify-center p-6">{empty}</div> : null}

      {ready ? (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 text-foreground"
          width={stage.width}
          height={stage.height}
          data-testid="roofline-overlay"
        >
          <TraceLines draft={shownDraft} geo={geo} dim={step === "scale"} focusLine={focusLine} />
          {/* The real spacing, over the line so every point shows, each with
              a thin dark edge so it reads on the light stroke. */}
          {lights && lights.length > 0 ? (
            <path
              d={dotsPath(lights, view, pointRadius(pitch * view.scale))}
              fill={WARM_POINT}
              stroke={UNDER}
              strokeOpacity={0.6}
              strokeWidth={1}
              data-testid="roofline-preview-lights"
            />
          ) : null}
          {pending && lastOfActive ? <Segment from={ptToScreen(lastOfActive, geo)} to={ptToScreen(pending.pt, geo)} /> : null}
          {step === "trace" && lastOfActive ? <Ring at={ptToScreen(lastOfActive, geo)} r={8} /> : null}
          {snapRing ? <Ring at={ptToScreen(snapRing.pt, geo)} r={13} dashed /> : null}
          {step === "scale" ? <LineNumbers draft={shownDraft} geo={geo} numbers={lineNumbers} /> : null}
          {step === "scale" && shownScale ? <Handles scale={shownScale} geo={geo} /> : null}
        </svg>
      ) : null}

      {ready && finger && photo && natural ? (
        <Loupe
          url={photo.url}
          natural={natural}
          view={view}
          finger={finger}
          stage={stage}
          draft={shownDraft}
          snap={snapRing?.pt ?? null}
          scale={step === "scale" ? shownScale : null}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- drawing

function pointRadius(pitchOnScreen: number): number {
  return Math.min(3.25, Math.max(1.75, pitchOnScreen * 0.2));
}

// Every light as one path of tiny circles: cheap to redraw while pinching.
function dotsPath(lights: Light[], view: Transform, r: number): string {
  const parts: string[] = [];
  const d = (2 * r).toFixed(2);
  for (const light of lights) {
    const x = light.x * view.scale + view.x - r;
    const y = light.y * view.scale + view.y;
    parts.push(`M${x.toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${d} 0a${r} ${r} 0 1 0 -${d} 0`);
  }
  return parts.join("");
}

const polyPoints = (points: Pt[], geo: Geo) =>
  points.map((point) => ptToScreen(point, geo).map((n) => n.toFixed(1)).join(",")).join(" ");

function TraceLines({ draft, geo, dim, focusLine }: { draft: TraceDraft; geo: Geo; dim: boolean; focusLine: number | null }) {
  return (
    <g opacity={dim ? 0.75 : 1}>
      {draft.lines.map((line) => {
        const width = line.id === focusLine ? 4 : 2;
        const points = polyPoints(line.points, geo);
        const last = line.points.length - 1;
        return (
          <g key={line.id}>
            {line.points.length >= 2 ? (
              <>
                <polyline points={points} fill="none" stroke={UNDER} strokeOpacity={0.55} strokeWidth={width + 2} strokeLinejoin="round" strokeLinecap="round" />
                <polyline points={points} fill="none" stroke="currentColor" strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" />
              </>
            ) : null}
            {line.points.map((point, index) => {
              const [x, y] = ptToScreen(point, geo);
              const isEnd = index === 0 || index === last;
              // Open ends are rings (a point placed near one joins it);
              // corners are small solid dots.
              return isEnd ? (
                <circle key={index} cx={x} cy={y} r={5} fill={UNDER} fillOpacity={0.6} stroke="currentColor" strokeWidth={2} />
              ) : (
                <circle key={index} cx={x} cy={y} r={3.5} fill="currentColor" stroke={UNDER} strokeOpacity={0.55} strokeWidth={1} />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

function Segment({ from, to }: { from: Vec; to: Vec }) {
  return (
    <>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={UNDER} strokeOpacity={0.55} strokeWidth={4} strokeLinecap="round" />
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="currentColor" strokeWidth={2} strokeDasharray="6 6" strokeLinecap="round" />
    </>
  );
}

function Ring({ at, r, dashed = false }: { at: Vec; r: number; dashed?: boolean }) {
  return (
    <>
      <circle cx={at[0]} cy={at[1]} r={r} fill="none" stroke={UNDER} strokeOpacity={0.55} strokeWidth={4} />
      <circle cx={at[0]} cy={at[1]} r={r} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray={dashed ? "4 3" : undefined} />
    </>
  );
}

function LineNumbers({ draft, geo, numbers }: { draft: TraceDraft; geo: Geo; numbers: Map<number, number> }) {
  return (
    <g>
      {draft.lines.map((line) => {
        const number = numbers.get(line.id);
        if (number == null || line.points.length < 2) return null;
        const [ax, ay] = ptToScreen(line.points[0], geo);
        const [bx, by] = ptToScreen(line.points[1], geo);
        const x = (ax + bx) / 2;
        const y = (ay + by) / 2 - 18;
        return (
          <g key={line.id}>
            <circle cx={x} cy={y} r={12} fill={UNDER} stroke="currentColor" strokeWidth={1.5} />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize={13} fontWeight={700}>
              {number}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Handles({ scale, geo }: { scale: ScaleDraft; geo: Geo }) {
  const a = ptToScreen(scale.a, geo);
  const b = ptToScreen(scale.b, geo);
  const feet = scaleFeet(scale);
  const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  return (
    <g>
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={UNDER} strokeOpacity={0.55} strokeWidth={4} />
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="currentColor" strokeWidth={2} strokeDasharray="8 6" />
      {feet != null && scale.placed[0] && scale.placed[1] ? (
        <g>
          <rect x={mid[0] - 30} y={mid[1] + 20} width={60} height={24} rx={6} fill={UNDER} stroke="currentColor" strokeWidth={1} />
          <text x={mid[0]} y={mid[1] + 32} textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize={14} fontWeight={700}>
            {`${feet} ft`}
          </text>
        </g>
      ) : null}
      {([a, b] as const).map((at, which) => (
        <g key={which}>
          <circle cx={at[0]} cy={at[1]} r={14} fill={UNDER} fillOpacity={0.35} stroke={UNDER} strokeOpacity={0.55} strokeWidth={4} />
          <circle cx={at[0]} cy={at[1]} r={14} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray={scale.placed[which] ? undefined : "4 3"} />
          <line x1={at[0] - 6} y1={at[1]} x2={at[0] + 6} y2={at[1]} stroke="currentColor" strokeWidth={1.5} />
          <line x1={at[0]} y1={at[1] - 6} x2={at[0]} y2={at[1] + 6} stroke="currentColor" strokeWidth={1.5} />
        </g>
      ))}
    </g>
  );
}

// The 3x loupe: the photo around the finger, the lines over it, and a
// crosshair at the finger's exact spot.
function Loupe({
  url,
  natural,
  view,
  finger,
  stage,
  draft,
  snap,
  scale,
}: {
  url: string;
  natural: Size;
  view: Transform;
  finger: Vec;
  stage: Size;
  draft: TraceDraft;
  snap: Pt | null;
  scale: ScaleDraft | null;
}) {
  const spot = loupeSpot(finger, stage);
  const inner = loupeView(view, finger);
  const geo: Geo = { photo: natural, view: inner };
  const c = LOUPE_SIZE / 2;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute overflow-hidden rounded-full border-2 border-foreground bg-background text-foreground"
      style={{ left: spot.left, top: spot.top, width: LOUPE_SIZE, height: LOUPE_SIZE }}
      data-testid="roofline-loupe"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- the same signed photo, magnified */}
      <img
        src={url}
        alt=""
        crossOrigin="anonymous"
        draggable={false}
        className="absolute top-0 left-0"
        style={{
          width: natural.width,
          height: natural.height,
          maxWidth: "none",
          transformOrigin: "0 0",
          transform: `translate(${inner.x - 2}px, ${inner.y - 2}px) scale(${inner.scale})`,
        }}
      />
      <svg className="absolute -top-0.5 -left-0.5" width={LOUPE_SIZE} height={LOUPE_SIZE}>
        <TraceLines draft={draft} geo={geo} dim={false} focusLine={null} />
        {scale ? <Handles scale={scale} geo={geo} /> : null}
        {snap ? <Ring at={ptToScreen(snap, geo)} r={13} dashed /> : null}
        <line x1={c} y1={c - 16} x2={c} y2={c + 16} stroke={UNDER} strokeOpacity={0.6} strokeWidth={3} />
        <line x1={c - 16} y1={c} x2={c + 16} y2={c} stroke={UNDER} strokeOpacity={0.6} strokeWidth={3} />
        <line x1={c} y1={c - 16} x2={c} y2={c + 16} stroke="currentColor" strokeWidth={1} />
        <line x1={c - 16} y1={c} x2={c + 16} y2={c} stroke="currentColor" strokeWidth={1} />
      </svg>
    </div>
  );
}
