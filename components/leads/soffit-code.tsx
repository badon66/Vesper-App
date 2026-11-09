"use client";

import { Camera, Check, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { attachLeadPhotos } from "@/app/(app)/app/leads/actions";
import { saveSoffitCode, setTrackFromSoffitCode } from "@/app/(app)/app/leads/soffit-code-actions";
import { ActionMessage } from "@/components/action-message";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useViewAs } from "@/components/view-as-context";
import { parseSoffitCode, SOFFIT_CODE_UNKNOWN, soffitCodeReadBack, type SoffitCodeBlock } from "@/lib/leads/soffit-code";
import { PHOTO_BUCKET, photoPath, shrinkPhoto } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { isViewAsRefusal, VIEW_AS_NOTHING_SAVED } from "@/lib/view-as";

const NO_SIGNAL = "No signal. Nothing was saved. Try again in a moment.";

// Soffit colour code (Keenan, 2026-11-09), on the lead page and Keenan's
// prep list. For the soffit, or each colour of a split soffit: the number
// from the RAL colour book, named as it is typed, and a photo of the book
// held up to the soffit. The lead's own setter and Keenan change them;
// every other setter reads them. Keenan also gets Use for the track, which
// sets the track colour from the code in one tap. Optional: none of it is
// needed to save or book. Names only, never a swatch. While Keenan views
// the app as someone, a save is refused by the server and a photo is shown
// here only.
export function SoffitCode({
  leadId,
  userId,
  blocks,
  canEdit,
  ralNames,
  layout = "page",
}: {
  leadId: string;
  userId: string;
  blocks: SoffitCodeBlock[];
  canEdit: boolean;
  // The whole RAL Classic list, to name a number as it is typed. Only
  // needed by someone who can change the code.
  ralNames: Record<string, string>;
  layout?: "page" | "prep";
}) {
  const headingId = useId();
  const split = blocks.length > 1;
  // On the prep list the section sits inside an item headed h3.
  const Heading = layout === "prep" ? "h4" : "h3";
  return (
    <section
      aria-labelledby={headingId}
      data-testid="soffit-code"
      className={cn("flex flex-col gap-4", layout === "page" && "border-t pt-5")}
    >
      <div className="flex flex-col gap-1">
        <Heading id={headingId} className="text-base font-semibold">
          Soffit colour code
        </Heading>
        <p className="text-sm text-pretty text-muted-foreground">
          {canEdit
            ? "From the RAL colour book: the number, a photo of the book held up to the soffit, or both. Optional."
            : "From the RAL colour book."}
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {blocks.map((block) => (
          <SoffitCodeItem
            key={block.which}
            leadId={leadId}
            userId={userId}
            block={block}
            canEdit={canEdit}
            ralNames={ralNames}
            boxed={split}
            nameHeading={layout === "prep" ? "h5" : "h4"}
          />
        ))}
      </div>
    </section>
  );
}

function SoffitCodeItem({
  leadId,
  userId,
  block,
  canEdit,
  ralNames,
  boxed,
  nameHeading: NameHeading,
}: {
  leadId: string;
  userId: string;
  block: SoffitCodeBlock;
  canEdit: boolean;
  ralNames: Record<string, string>;
  boxed: boolean;
  nameHeading: "h4" | "h5";
}) {
  return (
    <div
      className={cn("@container flex flex-col gap-4", boxed && "rounded-lg border p-4")}
      data-testid={`soffit-code-${block.which}`}
      data-code={block.code ?? ""}
    >
      {block.colourName ? <NameHeading className="text-base font-semibold">{block.colourName}</NameHeading> : null}
      {/* Stacked on a phone; the code and the photo side by side where
          there is room, as on the lead page on an iPad. */}
      <div className="grid gap-4 @lg:grid-cols-2 @lg:gap-6">
        <div className="flex flex-col gap-4">
          {canEdit ? (
            <CodeField leadId={leadId} block={block} ralNames={ralNames} />
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">RAL number</p>
              <p
                className={block.codeLabel ? "text-base font-semibold" : "text-sm text-muted-foreground"}
                data-testid={`soffit-code-${block.which}-label`}
              >
                {block.codeLabel ?? "No code yet."}
              </p>
            </div>
          )}
          {/* Remounted when the saved code or the track colour changes, so
              a tap's answer never outlives what it was about. */}
          {block.track ? (
            <UseForTrack
              key={`${block.code}-${block.track.set}-${block.track.text}`}
              leadId={leadId}
              which={block.which}
              track={block.track}
            />
          ) : null}
        </div>
        <BookPhoto leadId={leadId} userId={userId} block={block} canTake={canEdit} />
      </div>
    </div>
  );
}

function CodeField({ leadId, block, ralNames }: { leadId: string; block: SoffitCodeBlock; ralNames: Record<string, string> }) {
  const router = useRouter();
  const id = useId();
  const [typed, setTyped] = useState(block.code ?? "");
  const [saved, setSaved] = useState(block.code);
  const [seen, setSeen] = useState(block.code);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  // The page brings the saved code back after a save (or someone else's):
  // the field follows it.
  if (block.code !== seen) {
    setSeen(block.code);
    setSaved(block.code);
    setTyped(block.code ?? "");
  }

  const parsed = parseSoffitCode(typed);
  const unchanged = parsed.ok && parsed.code === saved;
  const clearing = parsed.ok && parsed.code === null && saved !== null;
  const readBack = soffitCodeReadBack(typed, ralNames);
  // An error says it all: the hint under the box would only repeat it.
  const showReadBack = !(error && readBack.tone === "hint");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDone(false);
    setMessage(null);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    // The whole list is here, so a number that isn't on it is caught
    // without waiting on the signal. The server checks again.
    if (parsed.code && Object.keys(ralNames).length > 0 && !ralNames[parsed.code]) {
      setError(SOFFIT_CODE_UNKNOWN);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await saveSoffitCode(leadId, block.which, typed);
        if (result.ok) {
          setSaved(result.code);
          setTyped(result.code ?? "");
          setDone(true);
          // Keenan's Use for the track follows the code just saved.
          router.refresh();
        } else if (isViewAsRefusal(result.error)) {
          setMessage(result.error);
        } else {
          setError(result.error);
        }
      } catch {
        setMessage(NO_SIGNAL);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2" data-testid={`soffit-code-${block.which}-form`}>
      <Label htmlFor={id}>
        RAL number
        {block.colourName ? <span className="sr-only">, {block.colourName}</span> : null}
      </Label>
      <div className="flex items-start gap-2">
        {/* "RAL" is printed in the box, so only the four digits are typed;
            "RAL 9010" pasted in works too. */}
        <div className="relative w-36 shrink-0">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base font-semibold text-muted-foreground select-none"
          >
            RAL
          </span>
          <Input
            id={id}
            name="soffit_ral_code"
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(null);
              setMessage(null);
              setDone(false);
            }}
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            maxLength={10}
            aria-invalid={error ? true : undefined}
            aria-describedby={[showReadBack ? `${id}-name` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined}
            data-testid={`soffit-code-${block.which}-input`}
            className="pl-13 tabular-nums"
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending || unchanged} data-testid={`soffit-code-${block.which}-save`}>
          {pending ? "Saving" : clearing ? "Clear" : "Save"}
        </Button>
      </div>
      {showReadBack ? (
        <p
          id={`${id}-name`}
          aria-live="polite"
          className={readBack.tone === "name" ? "text-base font-semibold" : "text-sm text-muted-foreground"}
          data-testid={`soffit-code-${block.which}-name`}
        >
          {readBack.text}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error ?? undefined} />
      <ActionMessage text={message} />
      {/* After the page has caught up, so "Saving" and "Saved." never show together. */}
      {done && !pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {saved ? "Saved." : "Cleared."}
        </p>
      ) : null}
    </form>
  );
}

// Keenan's one tap: the track colour from this code. He still decides; it
// only saves typing the number twice.
function UseForTrack({ leadId, which, track }: { leadId: string; which: 1 | 2; track: NonNullable<SoffitCodeBlock["track"]> }) {
  const router = useRouter();
  const [used, setUsed] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (track.set || used !== null) {
    return (
      <p className="flex items-start gap-2 text-sm" data-testid={`soffit-code-${which}-track-set`}>
        <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span className="text-pretty">Track colour is {used ?? track.text}.</span>
      </p>
    );
  }

  function onUse() {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await setTrackFromSoffitCode(leadId, which);
        if (result.ok) {
          setUsed(result.text);
          router.refresh();
        } else {
          setMessage(result.error);
        }
      } catch {
        setMessage(NO_SIGNAL);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2" data-testid={`soffit-code-${which}-track`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button type="button" variant="outline" disabled={pending} onClick={onUse} data-testid={`soffit-code-${which}-use`}>
          {pending ? "Setting" : "Use for the track"}
        </Button>
        <p className="text-sm text-pretty text-muted-foreground">
          Sets the track colour to {track.text}.{track.custom ? " Needs powder coating." : ""}
        </p>
      </div>
      <ActionMessage text={message} />
    </div>
  );
}

type Taken = {
  attempt: number;
  status: "working" | "done" | "failed";
  preview: string;
  source: Blob;
  // View as: shown on this screen only, never uploaded.
  actedOut?: boolean;
};

// The colour book held up to the soffit: a big Take photo and a smaller
// Upload, like the guided photo slots, through the same upload as every
// lead photo (shrunk on the phone, into the person's own folder, then into
// this slot; a photo it replaces stays with the lead as an extra). A tap on
// the picture shows it large.
function BookPhoto({
  leadId,
  userId,
  block,
  canTake,
}: {
  leadId: string;
  userId: string;
  block: SoffitCodeBlock;
  canTake: boolean;
}) {
  const router = useRouter();
  const { viewingAs } = useViewAs();
  const [taken, setTaken] = useState<Taken | null>(null);
  const [open, setOpen] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const attempts = useRef(0);
  const previews = useRef(new Set<string>());

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function preview(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    previews.current.add(url);
    return url;
  }

  // Only the latest photo may change what shows.
  function patch(attempt: number, change: Partial<Taken>) {
    setTaken((current) => (current && current.attempt === attempt ? { ...current, ...change } : current));
  }

  async function upload(attempt: number, source: Blob) {
    patch(attempt, { status: "working" });
    try {
      const small = await shrinkPhoto(source);
      patch(attempt, { preview: preview(small) });
      const path = photoPath(userId, crypto.randomUUID());
      const { error } = await createClient()
        .storage.from(PHOTO_BUCKET)
        .upload(path, small, { contentType: "image/jpeg", upsert: false });
      if (error) throw error;
      const result = await attachLeadPhotos(leadId, [path], block.slot);
      if (!result.ok) throw new Error(result.error);
      patch(attempt, { status: "done" });
      router.refresh();
    } catch {
      patch(attempt, { status: "failed" });
    }
  }

  function onFile(files: FileList | null, from: HTMLInputElement | null) {
    const file = files?.[0];
    if (from) from.value = "";
    if (!file) return;
    attempts.current += 1;
    const attempt = attempts.current;
    if (viewingAs) {
      setTaken({ attempt, status: "done", preview: preview(file), source: file, actedOut: true });
      return;
    }
    setTaken({ attempt, status: "working", preview: preview(file), source: file });
    void upload(attempt, file);
  }

  const src = taken?.preview ?? block.photoUrl;
  const working = taken?.status === "working";
  const failed = taken?.status === "failed";
  const which = block.colourName ? `, ${block.colourName}` : "";
  const alt = `The colour book held up to the soffit${which}`;

  const uploadButton = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="w-fit text-muted-foreground"
      aria-label={`Upload a photo from the phone, colour book${which}`}
      onClick={() => library.current?.click()}
      data-testid={`soffit-book-${block.which}-upload-button`}
    >
      <Upload aria-hidden="true" className="size-4" />
      Upload
    </Button>
  );

  return (
    <div className="flex flex-col gap-2" data-testid={`soffit-book-${block.which}`}>
      <p className="text-sm font-semibold">Colour book photo</p>
      {src ? (
        <div className="flex items-start gap-3">
          <div className="relative aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-md border bg-muted min-[420px]:w-36">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`Show the colour book photo larger${which}`}
              className="block size-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, or a private photo behind a short-lived signed link */}
              <img src={src} alt={alt} className="size-full object-cover" />
            </button>
            {working ? (
              <span className="absolute inset-x-0 bottom-0 bg-background px-2 py-1 text-center text-xs font-semibold">Uploading</span>
            ) : null}
            {failed && taken ? (
              <button
                type="button"
                onClick={() => void upload(taken.attempt, taken.source)}
                className="absolute inset-0 flex items-center justify-center bg-background px-2 text-center text-xs font-semibold text-destructive"
              >
                Didn&apos;t upload. Tap to try again.
              </button>
            ) : null}
          </div>
          {canTake ? (
            <div className="flex flex-col gap-1">
              <Button
                type="button"
                variant="outline"
                aria-label={`Retake, colour book${which}`}
                onClick={() => camera.current?.click()}
                data-testid={`soffit-book-${block.which}-take`}
              >
                <Camera aria-hidden="true" />
                Retake
              </Button>
              {uploadButton}
            </div>
          ) : null}
        </div>
      ) : canTake ? (
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full sm:w-fit"
            aria-label={`Take photo, colour book${which}`}
            onClick={() => camera.current?.click()}
            data-testid={`soffit-book-${block.which}-take`}
          >
            <Camera aria-hidden="true" />
            Take photo
          </Button>
          {uploadButton}
          <p className="text-sm text-pretty text-muted-foreground">Hold the book open against the soffit, with the matching chip in the photo.</p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No photo yet.</p>
      )}
      {canTake ? (
        <>
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            data-testid={`soffit-book-${block.which}-input`}
            onChange={(event) => onFile(event.currentTarget.files, camera.current)}
          />
          <input
            ref={library}
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            data-testid={`soffit-book-${block.which}-upload`}
            onChange={(event) => onFile(event.currentTarget.files, library.current)}
          />
        </>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {working ? "Colour book photo uploading" : failed ? "The colour book photo didn't upload. Tap it to try again." : ""}
      </span>
      {taken?.actedOut ? (
        <p role="status" className="text-sm font-medium text-pretty" data-testid="view-as-nothing-saved">
          {VIEW_AS_NOTHING_SAVED}
        </p>
      ) : null}
      {src ? (
        <DialogPanel
          open={open}
          onClose={() => setOpen(false)}
          title={`Colour book photo${which}`}
          testId={`soffit-book-${block.which}-large`}
          actions={
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          }
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, or a private photo behind a short-lived signed link */}
          <img src={src} alt={alt} className="w-full rounded-md border object-contain" />
        </DialogPanel>
      ) : null}
    </div>
  );
}
