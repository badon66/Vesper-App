"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DECK_PAGES,
  DECK_SLOTS,
  PAGE_LAYOUT,
  PAGE_NAMES,
  SHOOTING_STANDARD,
  slotsFor,
  WORDS_PAGES,
  type DeckWords,
  type Look,
  type PageWords as PageWordsValue,
  type WordsPageKey,
} from "@/lib/deck";
import { filledSlotCount, referencesBySlot, standardPoints, type ReferenceRow } from "@/lib/photos-deck";
import {
  deckWordIssues,
  editableFields,
  fieldKey,
  hasLooksIssues,
  LINES_UP_FRONT_KEY,
  lookWrapIssues,
  looksIssues,
  sameLooks,
  sameWords,
  tidyDeckWords,
  tidyLook,
  type DeckWordErrors,
  type LookField,
  type WordsField,
} from "@/lib/settings/deck-schema";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { saveDeck } from "./actions";
import { LooksEditor, lookFieldId } from "./looks-editor";
import { useLabelMeasure } from "./measure-labels";
import { LINES_UP_FRONT_ID, PageWords, wordsFieldId } from "./page-words";
import { GalleryOrder, SlotCard, type DeckPhotoView, type PhotosUpdate } from "./slot-card";

export type { DeckPhotoView } from "./slot-card";

// The deck's Settings, page by page in the order customers see them
// (round 7, rehearsal_and_references): each page's words with live counts,
// its photo slots with an example to copy, and on the light picker's page
// the looks. Words and looks save together from one bar at the bottom;
// photos, captions, focus points and example links save the moment they
// change.

type Props = {
  words: DeckWords;
  looks: Look[];
  warrantyText: string;
  photos: DeckPhotoView[];
  references: ReferenceRow[];
};

type Status = { kind: "saved" | "error"; text: string } | null;

const LAYOUT_WORDS: Record<(typeof PAGE_LAYOUT)[WordsPageKey], string> = {
  band: "The photo above, the words in the band under it.",
  split: "The picture on the left, the words on the right.",
  picker: "Their house at dusk, lit, with the looks in the tray under it.",
};

export function DeckEditor(props: Props) {
  const [words, setWords] = useState(props.words);
  const [looks, setLooks] = useState(props.looks);
  const [saved, setSaved] = useState({ words: props.words, looks: props.looks });
  const [photos, setPhotos] = useState(props.photos);
  const [references, setReferences] = useState(props.references);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [serverErrors, setServerErrors] = useState<DeckWordErrors>({});
  const [status, setStatus] = useState<Status>(null);
  const [openLook, setOpenLook] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const measure = useLabelMeasure();
  const blobs = useRef<string[]>([]);

  const wordErrors = useMemo(() => deckWordIssues(words, props.warrantyText), [words, props.warrantyText]);
  const lookIssues = useMemo(() => looksIssues(looks), [looks]);
  const wrap = useMemo(() => (measure ? lookWrapIssues(looks, measure) : {}), [looks, measure]);
  const wordsDirty = !sameWords(words, saved.words);
  const looksDirty = !sameLooks(looks, saved.looks);
  const dirty = wordsDirty || looksDirty;

  // Photos uploaded here show from a local copy until the page reloads.
  useEffect(() => {
    const list = blobs.current;
    return () => list.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // Unsaved words or looks: the browser asks before the tab closes, and a
  // link that would leave this page asks first (a jump to a page section
  // below doesn't).
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    const leave = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank") return;
      const url = new URL(link.href, window.location.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
      if (!window.confirm("Leave without saving your changes to the words and looks?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
    };
  }, [dirty]);

  const due = (key: string) => showAll || touched.has(key);
  const touch = (key: string) => setTouched((previous) => (previous.has(key) ? previous : new Set(previous).add(key)));
  const edited = () => setStatus((previous) => (previous?.kind === "saved" ? null : previous));

  const setPageField = (page: WordsPageKey, field: WordsField, text: string) => {
    edited();
    setWords((previous) => ({ ...previous, pages: { ...previous.pages, [page]: { ...previous.pages[page], [field]: text } } }));
    const key = fieldKey(page, field);
    if (serverErrors[key]) {
      setServerErrors((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
    }
  };
  const updateLooks = (update: (looks: Look[]) => Look[]) => {
    edited();
    setLooks(update);
  };
  const updatePhotos: PhotosUpdate = (update) => setPhotos(update);
  const updateReference = (reference: ReferenceRow) =>
    setReferences((previous) => previous.map((item) => (item.id === reference.id ? reference : item)));

  const refsBySlot = useMemo(() => referencesBySlot(references), [references]);

  function pageErrors(page: WordsPageKey): Partial<Record<WordsField | typeof LINES_UP_FRONT_KEY, string>> {
    const out: Partial<Record<WordsField | typeof LINES_UP_FRONT_KEY, string>> = {};
    for (const field of editableFields(page)) {
      const key = fieldKey(page, field);
      const message = serverErrors[key] ?? (due(key) ? wordErrors[key] : undefined);
      if (message) out[field] = message;
    }
    if (page === "warranty") {
      const message = serverErrors[LINES_UP_FRONT_KEY] ?? wordErrors[LINES_UP_FRONT_KEY];
      if (message) out[LINES_UP_FRONT_KEY] = message;
    }
    return out;
  }

  // After a refused save: open and focus the first thing that needs a look.
  function focusFirstProblem(errors: DeckWordErrors) {
    let target: string | null = null;
    for (const page of WORDS_PAGES) {
      const field = editableFields(page).find((name) => errors[fieldKey(page, name)]);
      if (field) {
        target = wordsFieldId(page, field);
        break;
      }
      if (page === "warranty" && errors[LINES_UP_FRONT_KEY]) {
        target = LINES_UP_FRONT_ID;
        break;
      }
    }
    if (!target) {
      const look = looks.find((item) => Object.keys(lookIssues.looks[item.key] ?? {}).length > 0 || wrap[item.key]);
      if (look) {
        const field = (Object.keys({ ...wrap[look.key], ...lookIssues.looks[look.key] })[0] ?? "name") as LookField;
        setOpenLook(look.key);
        target = field === "active" || field === "colours" || field === "block" ? lookFieldId(look.key, "name") : lookFieldId(look.key, field);
      } else if (lookIssues.list) {
        target = "looks";
      }
    }
    if (!target) return;
    const id = target;
    window.requestAnimationFrame(() => {
      const element = document.getElementById(id);
      element?.scrollIntoView({ block: "center" });
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.focus({ preventScroll: true });
    });
  }

  function save() {
    setShowAll(true);
    const wordsBlocked = wordsDirty && Object.keys(wordErrors).length > 0;
    const looksBlocked = looksDirty && (hasLooksIssues(lookIssues) || Object.keys(wrap).length > 0);
    if (wordsBlocked || looksBlocked) {
      setStatus({ kind: "error", text: "Some fields need a look." });
      focusFirstProblem(wordsBlocked ? wordErrors : {});
      return;
    }
    const sentWords = wordsDirty ? tidyDeckWords(words) : null;
    const sentLooks = looksDirty ? looks.map(tidyLook) : null;
    const wordsAtSend = words;
    const looksAtSend = looks;
    setStatus(null);
    startTransition(async () => {
      const result = await saveDeck({ words: sentWords ?? undefined, looks: sentLooks ?? undefined });
      if (!result.ok) {
        setServerErrors(result.wordErrors ?? {});
        setStatus({ kind: "error", text: result.error });
        if (result.wordErrors) focusFirstProblem(result.wordErrors);
        return;
      }
      // Show what was stored (tidied), unless more was typed meanwhile.
      if (sentWords) setWords((current) => (current === wordsAtSend ? sentWords : current));
      if (sentLooks) setLooks((current) => (current === looksAtSend ? sentLooks : current));
      setSaved((previous) => ({ words: sentWords ?? previous.words, looks: sentLooks ?? previous.looks }));
      setShowAll(false);
      setTouched(new Set());
      setServerErrors({});
      setStatus({ kind: "saved", text: `Saved at ${formatTime(result.savedAt)}.` });
    });
  }

  function discard() {
    setWords(saved.words);
    setLooks(saved.looks);
    setShowAll(false);
    setTouched(new Set());
    setServerErrors({});
    setStatus(null);
  }

  const on = looks.filter((look) => look.active).length;

  return (
    <div className="flex flex-col gap-10">
      <Overview photos={photos} looksOn={on} pagesNeedingLook={WORDS_PAGES.filter((page) => Object.keys(pageErrors(page)).length > 0)} />

      {WORDS_PAGES.map((page) => {
        const slots = slotsFor(page);
        const number = DECK_PAGES.indexOf(page) + 1;
        return (
          <section key={page} id={`page-${page}`} aria-labelledby={`page-${page}-title`} className="flex scroll-mt-24 flex-col gap-4" data-testid="deck-page">
            <div className="flex flex-col gap-1 border-b pb-3">
              <p className="text-sm font-semibold text-muted-foreground">
                Page {number} of {DECK_PAGES.length}
              </p>
              <h2 id={`page-${page}-title`} className="text-xl font-bold">
                {PAGE_NAMES[page]}
              </h2>
              <p className="text-sm text-muted-foreground">{LAYOUT_WORDS[PAGE_LAYOUT[page]]}</p>
            </div>
            <Card>
              <CardContent>
                <PageWords
                  page={page}
                  value={words.pages[page] as PageWordsValue}
                  onChange={(field, text) => setPageField(page, field, text)}
                  onBlur={(field) => touch(fieldKey(page, field))}
                  errors={pageErrors(page)}
                  linesUpFront={words.warrantyLinesUpFront}
                  onLinesUpFront={(count) => {
                    edited();
                    setWords((previous) => ({ ...previous, warrantyLinesUpFront: count }));
                  }}
                  warrantyText={props.warrantyText}
                />
              </CardContent>
            </Card>
            {page === "light_picker" ? (
              <LooksEditor
                looks={looks}
                onLooks={updateLooks}
                issues={lookIssues}
                wrap={wrap}
                due={due}
                onBlur={touch}
                openKey={openLook}
                onOpen={setOpenLook}
                measured={measure !== null}
              />
            ) : null}
            {page === "gallery" ? <GalleryOrder photos={photos} onPhotos={updatePhotos} /> : null}
            {slots.map((slot) => (
              <SlotCard
                key={slot.key}
                slot={slot}
                photos={photos}
                references={refsBySlot.get(slot.key) ?? []}
                onPhotos={updatePhotos}
                onReference={updateReference}
                onBlobUrl={(url) => blobs.current.push(url)}
              />
            ))}
          </section>
        );
      })}

      {dirty || pending || status ? (
        <div
          role="region"
          aria-label="Save the words and looks"
          className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm lg:bottom-4"
          data-testid="deck-save-bar"
        >
          <p
            role={status?.kind === "error" ? "alert" : "status"}
            className={cn("text-sm font-semibold", status?.kind === "error" ? "text-destructive" : "text-muted-foreground")}
          >
            {pending ? "Saving" : status ? status.text : "Unsaved changes to the words or looks."}
          </p>
          {dirty ? (
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={discard}>
                Discard
              </Button>
              <Button type="button" size="lg" disabled={pending} onClick={save}>
                {pending ? "Saving" : "Save"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// The top of the page: how many slots have Keenan's photo, the shooting
// standard every photo follows, and the pages to jump to.
function Overview({ photos, looksOn, pagesNeedingLook }: { photos: DeckPhotoView[]; looksOn: number; pagesNeedingLook: WordsPageKey[] }) {
  const filled = filledSlotCount(photos);
  const standard = standardPoints(SHOOTING_STANDARD);
  const slotsFilled = (page: WordsPageKey) => {
    const slots = slotsFor(page);
    const done = new Set(photos.map((photo) => photo.slot));
    return { done: slots.filter((slot) => done.has(slot.key)).length, total: slots.length };
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <Card>
        <CardHeader>
          <CardTitle data-testid="deck-slots-filled">
            {filled} of {DECK_SLOTS.length} slots filled
          </CardTitle>
          <CardDescription>
            Until your photo is in, a slot shows customers an original drawing, the words alone, or skips its page. Each slot has
            an example to copy, seen only here and when you rehearse.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <h3 className="font-semibold">The shooting standard</h3>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-pretty">
            {standard.night.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          {standard.day ? (
            <p className="text-sm text-pretty">
              <span className="font-semibold">Day shots: </span>
              {standard.day}
            </p>
          ) : null}
        </CardContent>
      </Card>
      <nav aria-label="Pages" className="lg:sticky lg:top-24 lg:self-start">
        <Card className="gap-3">
          <CardHeader>
            <h2 className="font-semibold">Pages</h2>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col">
              {WORDS_PAGES.map((page) => {
                const count = slotsFilled(page);
                return (
                  <li key={page}>
                    <a
                      href={`#page-${page}`}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="font-semibold">
                        <span className="text-muted-foreground tabular-nums">{DECK_PAGES.indexOf(page) + 1}. </span>
                        {PAGE_NAMES[page]}
                      </span>
                      <span className={cn("shrink-0 text-right", pagesNeedingLook.includes(page) ? "font-semibold text-destructive" : "text-muted-foreground")}>
                        {pagesNeedingLook.includes(page)
                          ? "Needs a look"
                          : page === "light_picker"
                            ? `${looksOn} ${looksOn === 1 ? "look" : "looks"} on`
                            : count.total > 0
                              ? `${count.done} of ${count.total} ${count.total === 1 ? "photo" : "photos"}`
                              : "Words only"}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
            <p className="mt-2 px-2 text-sm text-muted-foreground">
              The cover, Your colours and Your price use built words and need nothing here.
            </p>
          </CardContent>
        </Card>
      </nav>
    </div>
  );
}
