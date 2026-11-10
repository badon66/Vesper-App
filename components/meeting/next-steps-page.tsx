"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { InitialsConfirm, type Confirmation } from "@/components/meeting/colour-page";
import {
  BottomCorner,
  CentredBlock,
  DeckButton,
  DECK_TYPE,
  keepHyphens,
  LeftPicture,
  MoreLayer,
  say,
  SlotPicture,
  slotHasPicture,
} from "@/components/meeting/deck-parts";
import { MoreButton, type MoreState } from "@/components/meeting/deck-pages";
import { deckLine, NO_PAYMENT_LINE, SLOT_BY_KEY, type DeckLines, type PageWords } from "@/lib/deck";
import { installDayGrid, moreWords, slotView } from "@/lib/meeting/deck-pages";
import type { DeckPayload } from "@/lib/meeting/state";
import { formatLongDay } from "@/lib/time";
import { cn } from "@/lib/utils";

// What happens next (round 9, the meeting as one story; it takes in How
// install day works): what happens after a yes, in one place after the
// price, at every meeting. With no pick it reads as "here's how it goes
// when you're ready". It is never skipped, so the initials fallback below
// is always reachable. Meeting mode never accepts the quote: there is no
// Book button, acceptance, commission, setter or notes here.
//
// Top to bottom: the headline; once an option is chosen on the price page,
// "Your choice: Main floor, $3,380 + GST"; four numbered steps, each a
// short label and one line at 27/30 px:
//   1 Your colour: "White, confirmed with your initials." with a tick once
//     initialled at this meeting; otherwise "We confirm it with you from
//     the colour book." with the initials and Confirm right there (the
//     colour page's own, saved the same way), reading as done after
//   2 Your install day: the day picked at the table ("Saturday, November
//     21") or "We pick the day together.", and Pick a day, always: a layer
//     with three weeks of days from tomorrow, one tap each, and No day yet.
//     The day is optional and never written to the lead before Accepted
//   3 On the day: the crew, the clean up and the app set up (the one place
//     app set-up is said)
//   4 Paying: "No payment until your install is complete." in semibold,
//     set apart, word for word (CLAUDE.md, never in Settings)
// then the closing line, which hands over to the link Keenan texts. What
// we'll need is behind its button, with the control box photo slot.
//
// With Keenan's install day photo (install_day.hero), the photo sits on the
// left third and the words on the right: the five seats drew it at the
// deck's 56%, but four steps at 27 px don't fit beside it in 44% of an iPad
// Air, so the photo column is narrower here. Until then, the words alone,
// centred at the deck's 64 px margin.

export type NextStepsPageProps = {
  deck: DeckPayload;
  words: PageWords;
  lines: DeckLines;
  near: boolean;
  fillEmpty: boolean;
  // "Your choice: Main floor, $3,380 + GST", or null until one is chosen.
  recap: string | null;
  // Step 1. colour: the track colour's name, or null while none is chosen.
  colour: string | null;
  confirmed: boolean;
  // The initials box, while not confirmed; null with no lead (rehearsal).
  initials: {
    leadId: string;
    draft: string;
    onDraft: (value: string) => void;
    onConfirmed: (confirmation: Confirmation) => void;
    readOnly: boolean;
  } | null;
  // Step 2: the day picked at the table (YYYY-MM-DD) or null; onInstallOn
  // is null with no quote (the rehearsal with no lead), which hides Pick a
  // day.
  installOn: string | null;
  today: string;
  onInstallOn: ((day: string | null) => void) | null;
  // What we'll need, and the Pick a day layer.
  more: MoreState;
  dayLayer: MoreState;
};

const altOf = (key: string) => SLOT_BY_KEY.get(key)?.name ?? "";

function Step({ number, label, children, apart = false }: { number: number; label: string; children: ReactNode; apart?: boolean }) {
  return (
    <li className={cn("flex items-baseline gap-4", apart && "border-t border-border pt-4")} data-testid={`next-step-${number}`}>
      <span className={cn(DECK_TYPE.body, "w-[1ch] shrink-0 font-semibold text-muted-foreground tabular-nums")}>{number}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className={cn(DECK_TYPE.small, "font-semibold text-muted-foreground")}>{say(label)}</p>
        {children}
      </div>
    </li>
  );
}

export function NextStepsPage({
  deck,
  words,
  lines,
  near,
  fillEmpty,
  recap,
  colour,
  confirmed,
  initials,
  installOn,
  today,
  onInstallOn,
  more,
  dayLayer,
}: NextStepsPageProps) {
  const hero = slotView(deck, "install_day.hero", fillEmpty);
  const withPicture = slotHasPicture(hero);
  const layer = moreWords(words);
  const headline = words.headline.trim();
  const colourDone = confirmed && colour !== null;

  const content = (
    <>
      {headline ? <h2 className={DECK_TYPE.headline}>{keepHyphens(headline)}</h2> : null}
      {recap ? (
        <p className={cn(DECK_TYPE.body, "-mt-2 font-semibold")} data-testid="next-steps-recap">
          {say(recap)}
        </p>
      ) : null}
      <ol className="flex flex-col gap-4" aria-label={headline ? say(headline) : undefined}>
        <Step number={1} label={lines.step_colour_label}>
          {colourDone ? (
            <p className={cn(DECK_TYPE.body, "flex items-baseline gap-2")} data-testid="next-step-colour-done">
              <span>{say(deckLine(lines, "step_colour_done", { colour }))}</span>
              <Check aria-hidden="true" className="size-6 shrink-0 translate-y-1" strokeWidth={2.5} />
            </p>
          ) : (
            <>
              <p id="next-steps-colour-line" className={DECK_TYPE.body}>
                {say(deckLine(lines, "step_colour_todo"))}
              </p>
              {initials && colour !== null ? (
                <div className="mt-2">
                  <InitialsConfirm
                    id="next-steps-initials"
                    leadId={initials.leadId}
                    enabled
                    prompt=""
                    describedBy="next-steps-colour-line"
                    draft={initials.draft}
                    onDraft={initials.onDraft}
                    onConfirmed={initials.onConfirmed}
                    readOnly={initials.readOnly}
                  />
                </div>
              ) : null}
            </>
          )}
        </Step>
        <Step number={2} label={lines.step_day_label}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <p className={DECK_TYPE.body} data-testid="next-step-day">
              {installOn ? formatLongDay(installOn) : say(deckLine(lines, "step_day_none"))}
            </p>
            {onInstallOn ? (
              <DeckButton onClick={() => dayLayer.set(true)} aria-haspopup="dialog" aria-expanded={dayLayer.open} data-testid="next-step-pick-day">
                {say(deckLine(lines, "step_day_button"))}
              </DeckButton>
            ) : null}
          </div>
        </Step>
        <Step number={3} label={lines.step_on_day_label}>
          <p className={DECK_TYPE.body}>{say(deckLine(lines, "step_on_day"))}</p>
        </Step>
        <Step number={4} label={lines.step_pay_label} apart>
          <p className={cn(DECK_TYPE.body, "font-semibold")}>{NO_PAYMENT_LINE}</p>
        </Step>
      </ol>
      <p className={cn(DECK_TYPE.small, "text-muted-foreground")} data-testid="next-steps-closing">
        {say(deckLine(lines, "closing"))}
      </p>
    </>
  );

  return (
    <div className="relative h-full w-full" data-testid="next-steps-page">
      {withPicture ? (
        <div className="grid h-full grid-cols-[34%_66%]">
          <LeftPicture>{near ? <SlotPicture view={hero} alt={altOf("install_day.hero")} /> : <span />}</LeftPicture>
          <div
            data-deck-box="split"
            className="flex min-w-0 flex-col gap-5 overflow-hidden pt-10 pr-12 pl-10"
            style={{ paddingBottom: "var(--deck-clear, 78px)" }}
          >
            {content}
          </div>
        </div>
      ) : (
        <CentredBlock box="split" className="gap-5">
          {content}
        </CentredBlock>
      )}
      {layer ? (
        <BottomCorner>
          <MoreButton more={more} label={layer.label} />
        </BottomCorner>
      ) : null}
      {layer ? (
        <MoreLayer
          open={more.open}
          onClose={() => more.set(false)}
          label={layer.label}
          picture={(() => {
            const view = slotView(deck, "install_day.more", fillEmpty);
            return slotHasPicture(view) ? <SlotPicture view={view} alt={altOf("install_day.more")} drawing={{ ground: "none" }} /> : null;
          })()}
          lines={layer.lines}
        />
      ) : null}
      {onInstallOn ? (
        <MoreLayer open={dayLayer.open} onClose={() => dayLayer.set(false)} label={lines.step_day_label}>
          <DayPicker
            title={lines.step_day_label}
            today={today}
            chosen={installOn}
            onPick={(day) => {
              onInstallOn(day);
              dayLayer.set(false);
            }}
          />
        </MoreLayer>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Pick a day

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthShort = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", month: "short" });
const dayLabel = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" });
const asDate = (day: string) => new Date(`${day}T12:00:00Z`);

// Three weeks of days from tomorrow, a week to a row, Sunday first: one tap
// picks a day and closes the layer; No day yet clears it. The chosen day is
// Night Text with navy text and a tick, never gold. The month shows on the
// first day and on the 1st.
function DayPicker({ title, today, chosen, onPick }: { title: string; today: string; chosen: string | null; onPick: (day: string | null) => void }) {
  const rows = installDayGrid(today);
  const first = rows.flat().find((day): day is string => day !== null) ?? null;
  const chosenRef = useRef<HTMLButtonElement>(null);
  useEffect(() => chosenRef.current?.focus({ preventScroll: true }), []);
  return (
    <div
      data-deck-box="layer"
      data-testid="install-day-picker"
      className="flex h-full w-full flex-col pr-16 pl-16"
      style={{ paddingTop: 88, paddingBottom: "var(--deck-clear, 78px)" }}
    >
      <h2 className={DECK_TYPE.moreLabel}>{say(title)}</h2>
      <div role="grid" aria-label={say(title)} className="mt-6 flex max-w-[1000px] flex-col gap-2">
        <div role="row" className="grid grid-cols-7 gap-2">
          {WEEKDAYS.map((name) => (
            <span key={name} role="columnheader" className={cn(DECK_TYPE.small, "text-center text-muted-foreground")}>
              {name}
            </span>
          ))}
        </div>
        {rows.map((row, at) => (
          <div key={at} role="row" className="grid grid-cols-7 gap-2">
            {row.map((day, column) => {
              if (!day) return <span key={column} role="gridcell" aria-hidden="true" />;
              const isChosen = day === chosen;
              const date = asDate(day);
              const showMonth = day === first || date.getUTCDate() === 1;
              return (
                <span key={day} role="gridcell">
                  <button
                    ref={isChosen ? chosenRef : undefined}
                    type="button"
                    aria-pressed={isChosen}
                    aria-label={dayLabel.format(date)}
                    data-day={day}
                    onClick={() => onPick(day)}
                    className={cn(
                      "flex h-[72px] w-full flex-col items-center justify-center rounded-md border outline-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-card",
                      isChosen ? "border-foreground bg-foreground text-background" : "border-input bg-background text-foreground active:bg-secondary",
                    )}
                  >
                    <span className="flex items-center gap-1 text-[27px] leading-none font-semibold tabular-nums">
                      {date.getUTCDate()}
                      {isChosen ? <Check aria-hidden="true" className="size-5" strokeWidth={2.5} /> : null}
                    </span>
                    {showMonth ? (
                      <span className={cn("text-[20px] leading-[22px]", !isChosen && "text-muted-foreground")}>{monthShort.format(date)}</span>
                    ) : null}
                  </button>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-6">
        <DeckButton onClick={() => onPick(null)} aria-pressed={chosen === null} data-testid="install-day-none">
          No day yet
        </DeckButton>
      </div>
    </div>
  );
}
