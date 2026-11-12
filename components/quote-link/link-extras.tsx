"use client";

import { Check, Download, FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { cleanFeet, runTrack, screenTotal, TRACK_NAMES, type QuoteRun, type QuoteTotals, type TrackType } from "@/lib/pricing";
import { fillLine } from "@/lib/deck";
import { type LinkAgreement, type LinkDocument, type LinkWords, runName } from "@/lib/quote-link/view";
import { calgaryDateOf, formatFullDate } from "@/lib/time";
import { cn } from "@/lib/utils";

// The customer's quote link, take 3 (Keenan, 2026-11-11): Build your own,
// About your track, Documents and the agreement to sign. Phone first, white
// with navy and gold like the rest of the page; gold stays Book my install's
// alone, so every button here is navy or outlined.

const NAVY = "#132E3F";
const GOLD = "#B99257";

// ---------------------------------------------------------------- Build your own

// The Build your own row, after Keenan's options: a radio row like theirs,
// its total once there is one.
export function BuildYourOwnRow({
  title,
  selected,
  totals,
  gstEnabled,
  disabled,
  onChoose,
}: {
  title: string;
  selected: boolean;
  totals: QuoteTotals | null;
  gstEnabled: boolean;
  disabled: boolean;
  onChoose: () => void;
}) {
  return (
    <label
      className={cn(
        "relative flex min-h-11 cursor-pointer flex-col gap-0.5 rounded-md transition-colors duration-150",
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
        selected
          ? "border-2 border-navy px-[0.8125rem] pt-3 pb-2"
          : "border border-dashed border-border px-[0.875rem] pt-[0.8125rem] pb-[0.5625rem] hover:bg-muted",
      )}
      data-testid="build-row"
      data-selected={selected}
    >
      <input type="radio" name="quote-option" value="build" checked={selected} disabled={disabled} onChange={onChoose} className="sr-only" />
      <span className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150",
            selected ? "border-navy bg-navy" : "border-input bg-background",
          )}
        >
          {selected ? <span className="size-2.5 rounded-full bg-white" /> : null}
        </span>
        <span className="min-w-0 flex-1 text-base leading-snug font-semibold">{title}</span>
        {selected && totals ? (
          <span className="shrink-0 text-lg leading-tight font-bold whitespace-nowrap tabular-nums" data-testid="build-total">
            {screenTotal(totals.subtotal, gstEnabled)}
          </span>
        ) : null}
      </span>
    </label>
  );
}

// The areas Keenan measured, to tick on or off. The total above updates as
// they tick; at least one stays on. Feet, prices and track types are his:
// each area shows its feet and its track when it isn't the standard one.
export function BuildYourOwn({
  note,
  runs,
  buildable,
  picked,
  disabled,
  onChange,
}: {
  note: string;
  runs: QuoteRun[];
  buildable: number[];
  picked: number[];
  disabled: boolean;
  onChange: (next: number[]) => void;
}) {
  const on = new Set(picked);
  const last = picked.length === 1;
  return (
    <fieldset className="mt-3 rounded-md border px-4 py-3" data-testid="build-areas">
      <legend className="sr-only">The parts in your own option</legend>
      <p className="text-sm text-pretty text-muted-foreground">{note}</p>
      <ul className="mt-2 flex flex-col">
        {buildable.map((at) => {
          const run = runs[at];
          if (!run) return null;
          const checked = on.has(at);
          const track = runTrack(run);
          const locked = disabled || (checked && last);
          return (
            <li key={at}>
              <label className={cn("flex min-h-12 items-center gap-3 py-1", locked ? "cursor-not-allowed" : "cursor-pointer")}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={locked}
                  onChange={() => onChange(checked ? picked.filter((p) => p !== at) : [...picked, at].sort((a, b) => a - b))}
                  className="size-5 shrink-0 accent-[#132E3F]"
                  data-testid="build-area"
                  data-position={at}
                />
                <span className="min-w-0 flex-1 text-base text-pretty">{runName(run, at)}</span>
                <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                  {cleanFeet(run.feet)} ft{track !== "hat" ? `, ${TRACK_NAMES[track]}` : ""}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {last ? <p className="mt-1 text-sm text-muted-foreground">At least one part stays in.</p> : null}
    </fieldset>
  );
}

// ---------------------------------------------------------------- About your track

// A simple line drawing of each track, seen end on: the soffit (or, for J
// track, the face of the trim) in navy, the light in gold.
function TrackDrawing({ track }: { track: TrackType }) {
  return (
    <svg viewBox="0 0 120 64" className="h-16 w-28 shrink-0" role="img" aria-label={`${TRACK_NAMES[track]}, seen end on`} data-track-drawing={track}>
      {track === "j" ? (
        <>
          {/* The face of the trim, and the J hooked onto it. */}
          <line x1="34" y1="4" x2="34" y2="60" stroke={NAVY} strokeWidth="1.5" strokeDasharray="3 3" />
          <path d="M38 8 V40 Q38 52 50 52 H66 Q76 52 76 42 V32" fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="57" cy="42" r="5" fill={GOLD} />
        </>
      ) : track === "double" ? (
        <>
          {/* The soffit, and two channels side by side under it. */}
          <line x1="4" y1="10" x2="116" y2="10" stroke={NAVY} strokeWidth="1.5" strokeDasharray="3 3" />
          <path d="M8 14 H20 V40 H54 V14 H66 V40 H100 V14 H112" fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="37" cy="32" r="5" fill={GOLD} />
          <circle cx="83" cy="32" r="5" fill={GOLD} />
        </>
      ) : (
        <>
          {/* The soffit, and the hat track's channel under it. */}
          <line x1="4" y1="10" x2="116" y2="10" stroke={NAVY} strokeWidth="1.5" strokeDasharray="3 3" />
          <path d="M18 14 H38 V44 H82 V14 H102" fill="none" stroke={NAVY} strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="60" cy="35" r="5" fill={GOLD} />
        </>
      )}
    </svg>
  );
}

const TRACK_WORDS: Record<TrackType, keyof LinkWords> = { hat: "link_track_hat", double: "link_track_double", j: "link_track_j" };

export function AboutYourTrack({ tracks, words }: { tracks: TrackType[]; words: LinkWords }) {
  if (tracks.length === 0) return null;
  return (
    <section aria-labelledby="about-track" className="mt-12 px-5" data-testid="about-track">
      <h2 id="about-track" className="text-xl font-bold">
        {words.link_track_title}
      </h2>
      <ul className="mt-4 flex flex-col gap-5">
        {tracks.map((track) => (
          <li key={track} className="flex items-start gap-4" data-testid="about-track-type" data-track={track}>
            <TrackDrawing track={track} />
            <div className="min-w-0">
              <p className="font-semibold">{TRACK_NAMES[track]}</p>
              <p className="mt-0.5 text-base text-pretty">{words[TRACK_WORDS[track]]}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- Documents

function sizeWords(bytes: number): string {
  if (!(bytes > 0)) return "";
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

function kindWords(contentType: string): string {
  return contentType === "application/pdf" ? "PDF" : "Photo";
}

// Only what Keenan ticked or uploaded for them; none, no section at all.
// Each opens on the phone, and can be saved.
export function LinkDocuments({ documents, title }: { documents: LinkDocument[]; title: string }) {
  if (documents.length === 0) return null;
  return (
    <section aria-labelledby="link-documents" className="mt-12 px-5" data-testid="link-documents">
      <h2 id="link-documents" className="text-xl font-bold">
        {title}
      </h2>
      <ul className="mt-3 flex flex-col divide-y rounded-md border">
        {documents.map((doc) => (
          <li key={doc.id} className="flex items-center gap-3 px-4 py-3" data-testid="link-document">
            <FileText aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            <a
              href={doc.url}
              target="_blank"
              rel="noreferrer noopener"
              className="-my-3 min-w-0 flex-1 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="link-document-open"
            >
              <span className="block font-semibold text-pretty underline-offset-4 hover:underline">{doc.name}</span>
              <span className="block text-sm text-muted-foreground">
                {[kindWords(doc.contentType), sizeWords(doc.size)].filter(Boolean).join(", ")}
              </span>
            </a>
            <a
              href={doc.downloadUrl}
              rel="noreferrer noopener"
              aria-label={`Download ${doc.name}`}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md border border-input outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="link-document-download"
            >
              <Download aria-hidden="true" className="size-5" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- the agreement

// A box to sign in with a finger (or a mouse). Strokes are drawn as they
// go; the picture is handed back as a PNG when they tap Sign.
function SignaturePad({ disabled, onChange }: { disabled: boolean; onChange: (png: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const setup = useCallback(() => {
    const node = canvas.current;
    if (!node) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const { width, height } = node.getBoundingClientRect();
    node.width = Math.round(width * ratio);
    node.height = Math.round(height * ratio);
    const context = node.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = NAVY;
    drawn.current = false;
    onChange(null);
  }, [onChange]);

  useEffect(() => {
    setup();
    // Turning the phone changes the box's width: start it clean at the new
    // size, so the line always lands under the finger. (A height-only
    // change, like the address bar sliding away, leaves it alone.)
    let width = canvas.current?.getBoundingClientRect().width ?? 0;
    const onResize = () => {
      const next = canvas.current?.getBoundingClientRect().width ?? 0;
      if (Math.abs(next - width) < 1) return;
      width = next;
      setup();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [setup]);

  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <div className="mt-2">
      <canvas
        ref={canvas}
        aria-label="Sign here with your finger"
        role="img"
        className={cn("block h-40 w-full touch-none rounded-md border-2 border-dashed border-input bg-white", disabled && "opacity-60")}
        data-testid="agreement-pad"
        onPointerDown={(event) => {
          if (disabled) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drawing.current = true;
          last.current = point(event);
        }}
        onPointerMove={(event) => {
          if (!drawing.current || !last.current) return;
          const context = canvas.current?.getContext("2d");
          if (!context) return;
          const next = point(event);
          context.beginPath();
          context.moveTo(last.current.x, last.current.y);
          context.lineTo(next.x, next.y);
          context.stroke();
          last.current = next;
          if (!drawn.current) drawn.current = true;
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          last.current = null;
          if (drawn.current && canvas.current) onChange(canvas.current.toDataURL("image/png"));
        }}
        onPointerCancel={() => {
          drawing.current = false;
          last.current = null;
        }}
      />
      <div className="mt-1 flex justify-end">
        <button
          type="button"
          onClick={setup}
          disabled={disabled}
          className="-my-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          data-testid="agreement-clear"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

export type SignOutcome = { ok: true; signerName: string; signedAt: string; preview?: boolean } | { ok: false; message: string };

// The agreement, only when Keenan ticked Agreement to sign on the lead and
// wrote its text in Settings. They read it, type their name, sign with a
// finger and tap Sign; the option on screen is the one they sign for. Once
// signed: who signed and when, and their signed copy.
export function AgreementSection({
  agreement,
  words,
  optionLabel,
  optionTotal,
  copyHref,
  disabled,
  onSign,
}: {
  agreement: LinkAgreement;
  words: LinkWords;
  optionLabel: string;
  optionTotal: string;
  copyHref: string;
  disabled: boolean;
  onSign: (name: string, signature: string) => Promise<SignOutcome>;
}) {
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<{ signerName: string; signedAt: string; preview: boolean } | null>(
    agreement.signed ? { signerName: agreement.signed.signerName, signedAt: agreement.signed.signedAt, preview: false } : null,
  );
  const ready = name.trim().length >= 2 && signature !== null && !sending && !disabled;
  const paragraphs = agreement.text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);

  return (
    <section aria-labelledby="agreement" className="mt-12 px-5" data-testid="agreement">
      <h2 id="agreement" className="text-xl font-bold">
        {words.link_agreement_title}
      </h2>
      {signed ? (
        <div className="mt-3 rounded-md border px-4 py-3" role="status" data-testid="agreement-signed">
          <p className="flex items-start gap-2 font-semibold text-pretty">
            <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {fillLine(words.link_agreement_done, { name: signed.signerName, date: formatFullDate(calgaryDateOf(signed.signedAt)) })}
          </p>
          {signed.preview ? (
            <p className="mt-1 text-sm text-muted-foreground">Preview: nothing was signed or saved.</p>
          ) : (
            <a
              href={copyHref}
              target="_blank"
              rel="noreferrer noopener"
              className="mt-2 inline-flex min-h-11 items-center gap-2 font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="agreement-copy"
            >
              <Download aria-hidden="true" className="size-4" />
              Your signed copy
            </a>
          )}
        </div>
      ) : (
        <>
          <p className="mt-2 text-base text-pretty">{words.link_agreement_note}</p>
          <div className="mt-3 max-h-[50vh] overflow-y-auto rounded-md border px-4 py-3 text-base" tabIndex={0} aria-label="The agreement" data-testid="agreement-text">
            {paragraphs.map((paragraph, at) => (
              <p key={at} className={cn("text-pretty whitespace-pre-line", at > 0 && "mt-3")}>
                {paragraph}
              </p>
            ))}
          </div>
          <p className="mt-4 text-base text-pretty" data-testid="agreement-option">
            You are signing for <span className="font-semibold">{optionLabel}</span>, {optionTotal}.
          </p>
          <label className="mt-4 block">
            <span className="text-sm font-semibold">Your full name</span>
            <input
              type="text"
              autoComplete="name"
              value={name}
              maxLength={120}
              disabled={sending || disabled}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 block h-12 w-full rounded-md border border-input bg-white px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="agreement-name"
            />
          </label>
          <p className="mt-4 text-sm font-semibold">Sign here with your finger</p>
          <SignaturePad disabled={sending || disabled} onChange={setSignature} />
          {error ? (
            <p role="alert" className="mt-2 text-base font-semibold text-pretty" data-testid="agreement-error">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!ready}
            onClick={async () => {
              if (!signature) return;
              setSending(true);
              setError(null);
              try {
                const result = await onSign(name.trim(), signature);
                if (result.ok) setSigned({ signerName: result.signerName, signedAt: result.signedAt, preview: Boolean(result.preview) });
                else setError(result.message);
              } catch {
                setError("That didn’t go through. Check your signal and try again, or call or text us.");
              } finally {
                setSending(false);
              }
            }}
            className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-navy px-5 text-base font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
            data-testid="agreement-sign"
          >
            {sending ? <Loader2 aria-hidden="true" className="size-5 animate-spin" /> : null}
            {sending ? "Signing" : "Sign"}
          </button>
        </>
      )}
    </section>
  );
}
