"use client";

import { Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DECK_SLOTS,
  LINE_GROUPS,
  LINE_SPECS,
  linesIn,
  PAGE_LAYOUT,
  PAGE_NAMES,
  SHOOTING_STANDARD,
  slotsFor,
  STAND_INS,
  STORY_PAGES,
  type DeckLineKey,
  type DeckPageKey,
  type DeckWords,
  type LineGroup,
  type Look,
  type PageWords as PageWordsValue,
  type StandInKey,
  type WordsPageKey,
} from "@/lib/deck";
import {
  blueHourAfter,
  calgarySunset,
  filledSlotCount,
  referencesBySlot,
  slotsByWhen,
  standardPoints,
  type ReferenceRow,
} from "@/lib/photos-deck";
import {
  deckFitIssues,
  deckWordIssues,
  editableFields,
  fieldKey,
  hasLooksIssues,
  lineKey,
  LINES_HELP,
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
import { sameTalking, TALKING_PAGES, talkingIssue, type TalkingPoints } from "@/lib/meeting/talking-points";
import { calgaryToday, formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { saveDeck } from "./actions";
import { lineFieldId, LinesWords } from "./lines-words";
import { LooksEditor, lookFieldId } from "./looks-editor";
import { labelMeasure, useTextMeasure } from "./measure-labels";
import { LINES_UP_FRONT_ID, PageWords, wordsFieldId } from "./page-words";
import { GalleryOrder, ShotRow, SlotCard, slotAnchor, type DeckPhotoView, type PhotosUpdate } from "./slot-card";
import { TalkingField } from "./talking-field";

export type { DeckPhotoView } from "./slot-card";

// The deck's Settings, page by page in the order customers see them
// (round 7, rehearsal_and_references): each page's words with live counts,
// its photo slots with an example to copy, and on the light picker's page
// the looks. Words and looks save together from one bar at the bottom;
// photos, captions, focus points and example links save the moment they
// change. "Group by: When to shoot" (round 7 review, Keenan) lists the same
// slots under Daylight, Blue hour, After a snowfall and Install day, each
// with its upload, for planning a shoot; Page stays the default.

type GroupBy = "page" | "when";

// What a page is called here (round 9): its headline from Settings, as the
// deck, its dot and the Next label read it, a stand-in saying so, or its
// own name while the headline is empty.
const pageTitle = (words: DeckWords, page: WordsPageKey) => {
  const headline = words.pages[page].headline.trim();
  if (!headline) return PAGE_NAMES[page];
  return Object.hasOwn(STAND_INS, page) ? `${headline} (stand-in)` : headline;
};

// The editor's sections, in the order customers see the pages (round 9):
// each page with words, the built pages with their lines (the cover, Your
// track colour, Your price), each stand-in after the page it stands in for,
// then the lines on every page and the customer's link.
type Section =
  | { kind: "page"; page: WordsPageKey; lines?: LineGroup }
  | { kind: "built"; page: "cover" | "colour" | "quote"; lines: LineGroup }
  | { kind: "lines"; lines: LineGroup };

// Round 10 (Keenan, 2026-11-10): the meeting's eight pages first, in their
// order, the colour's lines just before Your price (where they show now),
// then the round 9 pages that left the meeting, whose words and photos are
// kept.
const SECTIONS: Section[] = [
  { kind: "built", page: "cover", lines: "cover" },
  { kind: "page", page: "what_vesper_is" },
  { kind: "page", page: "hidden_by_day" },
  { kind: "page", page: "phone_control" },
  { kind: "page", page: "warranty" },
  { kind: "page", page: "light_picker" },
  { kind: "built", page: "colour", lines: "colour" },
  { kind: "built", page: "quote", lines: "price" },
  { kind: "page", page: "next_steps", lines: "next_steps" },
  { kind: "page", page: "gallery" },
  { kind: "page", page: "your_house", lines: "your_house" },
  { kind: "page", page: "mockup" },
  { kind: "page", page: "whites_first" },
  { kind: "lines", lines: "every_page" },
  { kind: "lines", lines: "link" },
];

const sectionId = (section: Section) => (section.kind === "lines" ? `lines-${section.lines}` : `page-${section.page}`);
const groupOf = (group: LineGroup) => LINE_GROUPS.find((item) => item.key === group);

// "Page 7 of 8"; for the colour, where its lines show; for a page that left
// the meeting, that it did; or which page a stand-in stands in for.
function sectionNumber(section: Section): string | null {
  if (section.kind === "lines") return null;
  const key: DeckPageKey = section.page;
  if (key === "colour" && !STORY_PAGES.includes(key)) return "On Your price";
  if (!STORY_PAGES.includes(key)) return "Not in the meeting now. Its words and photos are kept.";
  if (Object.hasOwn(STAND_INS, key)) {
    const target = STAND_INS[key as StandInKey];
    return `Stands in for page ${STORY_PAGES.indexOf(target) + 1}`;
  }
  return `Page ${STORY_PAGES.indexOf(key) + 1} of ${STORY_PAGES.length}`;
}

function sectionTitle(section: Section, words: DeckWords): string {
  if (section.kind === "page") return pageTitle(words, section.page);
  if (section.kind === "built") {
    if (section.page === "cover") return "Cover";
    return section.page === "colour" ? words.lines.colour_headline : words.lines.price_headline;
  }
  return groupOf(section.lines)?.title ?? "";
}

type Props = {
  words: DeckWords;
  looks: Look[];
  warrantyText: string;
  // The warranty page's company and phone lines, as the meeting draws them
  // under the lines up front (for the split page's fit check).
  companyLines: string[];
  photos: DeckPhotoView[];
  references: ReferenceRow[];
  // Keenan's talking points per page (round 10), settings.deck.talking.
  talking: TalkingPoints;
};

// The pages that take talking points, and what the field calls each.
const TALKING_NAME = new Map<DeckPageKey, string>(TALKING_PAGES.map((page) => [page.key, page.name]));

type Status = { kind: "saved" | "error"; text: string } | null;

const LAYOUT_WORDS: Record<(typeof PAGE_LAYOUT)[WordsPageKey], string> = {
  band: "The photo above, the words in the band under it.",
  split: "The picture on the left, the words on the right.",
  picker: "Their house at dusk, lit, with the looks in the tray under it.",
};

const PAGE_LAYOUT_WORDS: Partial<Record<WordsPageKey, string>> = {
  what_vesper_is: "Their Main mockup, full screen, with the lights on. Skipped until the lead has a Main mockup.",
  hidden_by_day: "Their Day and Night mockups, with the slider between them. Skipped unless the lead has both.",
  phone_control: "A phone on screen with their scene mockups as buttons; a tap swaps the house picture. Skipped without a scene.",
  warranty: "The ten years on a timeline, what it covers and that it transfers with the home. The full warranty is one tap away.",
  your_house: "Their house by day above, unlit, exactly where the light picker will light it; the words in the band under it.",
  mockup: "Their mockup above, the title and its line in the band under it.",
  next_steps: "Their choice and total, the install day if they picked one, no payment until it's done, and thanks.",
};

const BUILT_LAYOUT_WORDS: Record<"cover" | "colour" | "quote", string> = {
  cover: "The wordmark, their address and this line, on navy.",
  colour: "Not a page now: one line on Your price with their colour, in stock or made to order and its timing, then their initials when they say yes.",
  quote: "Every option with its total and what it covers, the chosen one's mockup big beside them, and the breakdown one tap away.",
};

const layoutWords = (section: Section) => {
  if (section.kind === "page") return PAGE_LAYOUT_WORDS[section.page] ?? LAYOUT_WORDS[PAGE_LAYOUT[section.page]];
  if (section.kind === "built") return BUILT_LAYOUT_WORDS[section.page];
  return groupOf(section.lines)?.note ?? "";
};

export function DeckEditor(props: Props) {
  const [words, setWords] = useState(props.words);
  const [looks, setLooks] = useState(props.looks);
  const [talking, setTalking] = useState<TalkingPoints>(props.talking);
  const [saved, setSaved] = useState({ words: props.words, looks: props.looks, talking: props.talking });
  const [talkingErrors, setTalkingErrors] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState(props.photos);
  const [references, setReferences] = useState(props.references);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);
  const [serverErrors, setServerErrors] = useState<DeckWordErrors>({});
  const [status, setStatus] = useState<Status>(null);
  const [openLook, setOpenLook] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>("page");
  const [pending, startTransition] = useTransition();
  const { measure, checking } = useTextMeasure();
  const blobs = useRef<string[]>([]);

  // The counts and copy rules first; then, once Manrope is measured, words
  // that would run into a band's button, wrap the picker's line, push a
  // More button into the dots or overrun a split page beside its photo.
  const wordErrors = useMemo(
    () => ({
      ...(measure ? deckFitIssues(words, measure, { warrantyText: props.warrantyText, company: props.companyLines }) : {}),
      ...deckWordIssues(words, props.warrantyText),
    }),
    [words, props.warrantyText, props.companyLines, measure],
  );
  const lookIssues = useMemo(() => looksIssues(looks), [looks]);
  const labels = useMemo(() => labelMeasure(measure), [measure]);
  const wrap = useMemo(() => (labels ? lookWrapIssues(looks, labels) : {}), [looks, labels]);
  const wordsDirty = !sameWords(words, saved.words);
  const looksDirty = !sameLooks(looks, saved.looks);
  const talkingDirty = !sameTalking(talking, saved.talking);
  const dirty = wordsDirty || looksDirty || talkingDirty;

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

  const setLine = (key: DeckLineKey, text: string) => {
    edited();
    setWords((previous) => ({ ...previous, lines: { ...previous.lines, [key]: text } }));
    const errorKey = lineKey(key);
    if (serverErrors[errorKey]) {
      setServerErrors((previous) => {
        const next = { ...previous };
        delete next[errorKey];
        return next;
      });
    }
  };

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
  const setTalkingFor = (page: DeckPageKey, text: string) => {
    edited();
    setTalking((previous) => ({ ...previous, [page]: text }));
    if (talkingErrors[page]) {
      setTalkingErrors((previous) => {
        const next = { ...previous };
        delete next[page];
        return next;
      });
    }
  };
  const talkingTooLong = TALKING_PAGES.some(({ key }) => talkingIssue(talking[key] ?? "") !== null);

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

  function lineErrors(group: LineGroup): Partial<Record<DeckLineKey, string>> {
    const out: Partial<Record<DeckLineKey, string>> = {};
    for (const key of linesIn(group)) {
      const errorKey = lineKey(key);
      const message = serverErrors[errorKey] ?? (due(errorKey) ? wordErrors[errorKey] : undefined);
      if (message) out[key] = message;
    }
    return out;
  }

  const sectionNeedsFixing = (section: Section) =>
    (section.kind === "page" && Object.keys(pageErrors(section.page)).length > 0) ||
    (section.kind !== "page" || section.lines ? Object.keys(lineErrors(section.lines as LineGroup)).length > 0 : false);

  // After a refused save: open and focus the first thing that needs fixing,
  // in the order the editor shows them.
  function focusFirstProblem(errors: DeckWordErrors) {
    let target: string | null = null;
    for (const section of SECTIONS) {
      if (section.kind === "page") {
        const page = section.page;
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
      const group = section.lines;
      const line = group ? linesIn(group).find((key) => errors[lineKey(key)]) : undefined;
      if (line) {
        target = lineFieldId(line);
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
    // The fields are on the pages: back to Group by Page first, if needed.
    setGroupBy("page");
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const element = document.getElementById(id);
        element?.scrollIntoView({ block: "center" });
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) element.focus({ preventScroll: true });
      }),
    );
  }

  // To a talking points box that needs fixing, on its page.
  function focusTalking(page: DeckPageKey | undefined) {
    if (!page) return;
    setGroupBy("page");
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        const element = document.getElementById(`talking-${page}`);
        element?.scrollIntoView({ block: "center" });
        if (element instanceof HTMLTextAreaElement) element.focus({ preventScroll: true });
      }),
    );
  }

  function save() {
    setShowAll(true);
    const wordsBlocked = wordsDirty && Object.keys(wordErrors).length > 0;
    const looksBlocked = looksDirty && (hasLooksIssues(lookIssues) || Object.keys(wrap).length > 0);
    const talkingBlocked = talkingDirty && talkingTooLong;
    if (wordsBlocked || looksBlocked || talkingBlocked) {
      setStatus({ kind: "error", text: "Some fields need fixing. They're marked below." });
      if (wordsBlocked) focusFirstProblem(wordErrors);
      else if (talkingBlocked) focusTalking(TALKING_PAGES.find(({ key }) => talkingIssue(talking[key] ?? "") !== null)?.key);
      else focusFirstProblem({});
      return;
    }
    const sentWords = wordsDirty ? tidyDeckWords(words) : null;
    const sentLooks = looksDirty ? looks.map(tidyLook) : null;
    const sentTalking = talkingDirty ? tidyTalking(talking) : null;
    const wordsAtSend = words;
    const looksAtSend = looks;
    const talkingAtSend = talking;
    setStatus(null);
    startTransition(async () => {
      const result = await saveDeck({ words: sentWords ?? undefined, looks: sentLooks ?? undefined, talking: sentTalking ?? undefined });
      if (!result.ok) {
        setServerErrors(result.wordErrors ?? {});
        setTalkingErrors(result.talkingErrors ?? {});
        setStatus({ kind: "error", text: result.error });
        if (result.wordErrors) focusFirstProblem(result.wordErrors);
        else if (result.talkingErrors) focusTalking(TALKING_PAGES.find(({ key }) => result.talkingErrors?.[key])?.key);
        return;
      }
      // Show what was stored (tidied), unless more was typed meanwhile.
      if (sentWords) setWords((current) => (current === wordsAtSend ? sentWords : current));
      if (sentLooks) setLooks((current) => (current === looksAtSend ? sentLooks : current));
      if (sentTalking) setTalking((current) => (current === talkingAtSend ? sentTalking : current));
      setSaved((previous) => ({
        words: sentWords ?? previous.words,
        looks: sentLooks ?? previous.looks,
        talking: sentTalking ?? previous.talking,
      }));
      setTalkingErrors({});
      setShowAll(false);
      setTouched(new Set());
      setServerErrors({});
      setStatus({ kind: "saved", text: `Saved at ${formatTime(result.savedAt)}.` });
    });
  }

  function discard() {
    setWords(saved.words);
    setLooks(saved.looks);
    setTalking(saved.talking);
    setTalkingErrors({});
    setShowAll(false);
    setTouched(new Set());
    setServerErrors({});
    setStatus(null);
  }

  const on = looks.filter((look) => look.active).length;

  // From a row in the When to shoot list to the slot's card, on its page.
  function openSlot(key: string) {
    setGroupBy("page");
    window.requestAnimationFrame(() => document.getElementById(slotAnchor(key))?.scrollIntoView({ block: "start" }));
  }

  return (
    <div className="flex flex-col gap-10">
      <Overview
        photos={photos}
        words={words}
        looksOn={on}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        sectionsNeedingFixing={SECTIONS.filter(sectionNeedsFixing).map(sectionId)}
      />

      {groupBy === "when" ? (
        <ShotsByWhen photos={photos} onPhotos={updatePhotos} onBlobUrl={(url) => blobs.current.push(url)} onOpen={openSlot} />
      ) : null}

      {groupBy === "page"
        ? SECTIONS.map((section) => {
            const id = sectionId(section);
            const page = section.kind === "page" ? section.page : null;
            const slots = page ? slotsFor(page) : [];
            const number = sectionNumber(section);
            const group = section.lines ? groupOf(section.lines) : undefined;
            return (
              <section key={id} id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-4" data-testid="deck-page">
                <div className="flex flex-col gap-1 border-b pb-3">
                  {number ? <p className="text-sm font-semibold text-muted-foreground">{number}</p> : null}
                  <h2 id={`${id}-title`} className="text-xl font-bold">
                    {sectionTitle(section, words)}
                  </h2>
                  <p className="text-sm text-muted-foreground">{layoutWords(section)}</p>
                </div>
                {page ? (
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
                ) : null}
                {section.lines ? (
                  <Card>
                    {section.kind === "page" && group ? (
                      <CardHeader>
                        <CardTitle className="text-base">{group.title === sectionTitle(section, words) ? "Its lines" : group.title}</CardTitle>
                        <CardDescription>{group.note}</CardDescription>
                      </CardHeader>
                    ) : null}
                    <CardContent className="flex flex-col gap-5">
                      {linesIn(section.lines).some((key) => (LINE_SPECS[key].fill ?? []).length > 0) ? (
                        <p className="max-w-prose text-sm text-pretty text-muted-foreground">{LINES_HELP}</p>
                      ) : null}
                      <LinesWords
                        group={section.lines}
                        lines={words.lines}
                        onChange={setLine}
                        onBlur={(key) => touch(lineKey(key))}
                        errors={lineErrors(section.lines)}
                      />
                    </CardContent>
                  </Card>
                ) : null}
                {section.kind !== "lines" && TALKING_NAME.has(section.page) ? (
                  <TalkingField
                    page={section.page}
                    pageName={TALKING_NAME.get(section.page) ?? sectionTitle(section, words)}
                    value={talking[section.page] ?? ""}
                    onChange={(text) => setTalkingFor(section.page, text)}
                    error={talkingErrors[section.page] ?? (showAll ? (talkingIssue(talking[section.page] ?? "") ?? undefined) : undefined)}
                  />
                ) : null}
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
                    checking={checking}
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
          })
        : null}

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
            {pending ? "Saving" : status ? status.text : "Unsaved changes to the words, talking points or looks."}
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
// standard every photo follows, how the shot list is grouped, and the pages
// (or times) to jump to.
function Overview({
  photos,
  words,
  looksOn,
  groupBy,
  onGroupBy,
  sectionsNeedingFixing,
}: {
  photos: DeckPhotoView[];
  words: DeckWords;
  looksOn: number;
  groupBy: GroupBy;
  onGroupBy: (group: GroupBy) => void;
  sectionsNeedingFixing: string[];
}) {
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
          <GroupByToggle value={groupBy} onChange={onGroupBy} />
          <h3 className="mt-3 font-semibold">The shooting standard</h3>
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
      {groupBy === "page" ? (
        <nav aria-label="Pages" className="lg:sticky lg:top-24 lg:self-start">
          <Card className="gap-3">
            <CardHeader>
              <h2 className="font-semibold">Pages</h2>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col">
                {SECTIONS.map((section) => {
                  const id = sectionId(section);
                  const fixing = sectionsNeedingFixing.includes(id);
                  const page = section.kind === "page" ? section.page : null;
                  const count = page ? slotsFilled(page) : { done: 0, total: 0 };
                  const lineCount = section.lines ? linesIn(section.lines).length : 0;
                  const number = section.kind === "lines" ? null : sectionNumber(section);
                  return (
                    <li key={id}>
                      <a
                        href={`#${id}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0 font-semibold">
                          {number?.startsWith("Page ") ? (
                            <span className="text-muted-foreground tabular-nums">{number.slice(5, number.indexOf(" of"))}. </span>
                          ) : null}
                          {sectionTitle(section, words)}
                        </span>
                        <span className={cn("shrink-0 text-right", fixing ? "font-semibold text-destructive" : "text-muted-foreground")}>
                          {fixing
                            ? "Needs fixing"
                            : page === "light_picker"
                              ? `${looksOn} ${looksOn === 1 ? "look" : "looks"} on`
                              : count.total > 0
                                ? `${count.done} of ${count.total} ${count.total === 1 ? "slot" : "slots"}`
                                : page
                                  ? "Words only"
                                  : `${lineCount} ${lineCount === 1 ? "line" : "lines"}`}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-2 px-2 text-sm text-muted-foreground">
                A stand-in shows only when the page it stands in for can&apos;t: no roofline traced, or no mockup either.
              </p>
            </CardContent>
          </Card>
        </nav>
      ) : (
        <nav aria-label="When to shoot" className="lg:sticky lg:top-24 lg:self-start">
          <Card className="gap-3">
            <CardHeader>
              <h2 className="font-semibold">When to shoot</h2>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col">
                {slotsByWhen().map((group) => {
                  const done = new Set(photos.map((photo) => photo.slot));
                  const count = group.slots.filter((slot) => done.has(slot.key)).length;
                  return (
                    <li key={group.key}>
                      <a
                        href={`#when-${group.key}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-md px-2 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="font-semibold">{group.label}</span>
                        <span className="shrink-0 text-right text-muted-foreground">
                          {count} of {group.slots.length} {group.slots.length === 1 ? "slot" : "slots"}
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>
        </nav>
      )}
    </div>
  );
}

// Group by: Page (the default, in deck order) or When to shoot. Two equal
// choice buttons; the chosen one is Night Text with a tick, as DESIGN.md's
// one-tap answers are.
function GroupByToggle({ value, onChange }: { value: GroupBy; onChange: (group: GroupBy) => void }) {
  const options: { key: GroupBy; label: string }[] = [
    { key: "page", label: "Page" },
    { key: "when", label: "When to shoot" },
  ];
  return (
    <div className="flex flex-col gap-2">
      <p id="deck-group-by" className="text-sm font-semibold">
        Group the shots by
      </p>
      <div role="radiogroup" aria-labelledby="deck-group-by" className="grid max-w-sm grid-cols-2 gap-2" data-testid="deck-group-by">
        {options.map((option) => {
          const chosen = option.key === value;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => onChange(option.key)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                chosen ? "border-foreground bg-foreground text-background" : "border-input bg-background hover:bg-muted",
              )}
            >
              <Check aria-hidden="true" className={cn("size-4 shrink-0", !chosen && "hidden")} />
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// "5:57 pm", as the shot list's notes write times.
const shotClock = (moment: Date) => formatTime(moment.toISOString()).replace(/\s*([ap])\.m\./i, " $1m");

// Today's sunset in Calgary and blue hour after it, worked out on the device
// from today's date (no network), above the When to shoot groups. This view
// only ever draws in the browser (Group by starts on Page), so the device's
// clock is read once, when it opens.
function TodaysSunset() {
  const [today] = useState(() => calgaryToday(new Date()));
  const sunset = calgarySunset(today);
  if (!sunset) return null;
  const blue = blueHourAfter(sunset);
  const [from, to] = [shotClock(blue.from), shotClock(blue.to)];
  // "6:13 to 6:28 pm", or "11:50 am to 12:05 pm" across noon.
  const fromShown = from.slice(-2) === to.slice(-2) ? from.slice(0, -3) : from;
  return (
    <p className="rounded-xl border bg-card p-4 text-pretty" data-testid="todays-sunset">
      <span className="font-semibold">Sunset in Calgary today: {shotClock(sunset)}.</span> Blue hour is about {fromShown} to {to}.
    </p>
  );
}

// The shot list by when to shoot: each time's slots in deck order, one line
// of the shot each, with its upload. "The full shot" opens the slot's card
// on its page, with the example to copy.
function ShotsByWhen({
  photos,
  onPhotos,
  onBlobUrl,
  onOpen,
}: {
  photos: DeckPhotoView[];
  onPhotos: PhotosUpdate;
  onBlobUrl: (url: string) => void;
  onOpen: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-8" data-testid="shots-by-when">
      <TodaysSunset />
      {slotsByWhen().map((group) => (
        <section key={group.key} id={`when-${group.key}`} aria-labelledby={`when-${group.key}-title`} className="flex scroll-mt-24 flex-col gap-4">
          <div className="flex flex-col gap-1 border-b pb-3">
            <h2 id={`when-${group.key}-title`} className="text-xl font-bold">
              {group.label}
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">{group.note}</p>
          </div>
          <Card>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {group.slots.map((slot) => (
                  <ShotRow key={slot.key} slot={slot} photos={photos} onPhotos={onPhotos} onBlobUrl={onBlobUrl} onOpen={() => onOpen(slot.key)} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}

// The talking points as they are saved: each trimmed, empty ones left out.
function tidyTalking(talking: TalkingPoints): TalkingPoints {
  const out: TalkingPoints = {};
  for (const { key } of TALKING_PAGES) {
    const text = talking[key]?.trim();
    if (text) out[key] = text;
  }
  return out;
}
