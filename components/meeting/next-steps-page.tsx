"use client";

import { Check } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

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
import type { RecapView } from "@/lib/meeting/black-friday-state";
import type { DeckPayload } from "@/lib/meeting/state";
import { BLACK_FRIDAY_LABEL } from "@/lib/quotes/black-friday";
import { formatLongDay } from "@/lib/time";
import { cn } from "@/lib/utils";

// What happens next (round 9, the meeting as one story; round 10, Keenan,
// 2026-11-10: a wrap-up): their choice and total once one is chosen on the
// price page, the install day (picked at the table, or "We pick the day
// together.", with Pick a day), "No payment until your install is
// complete." word for word, the closing line and thanks. The colour and
// its initials are settled on the price page now, so no colour book line
// here. It is never skipped. Meeting mode never accepts the quote: there
// is no Book button, acceptance, commission, setter or notes here. What
// we'll need is behind its button.
//
// With Keenan's install day photo (install_day.hero), the photo sits on the
// left third and the words on the right; until then, the words alone,
// centred at the deck's 64 px margin.

export type NextStepsPageProps = {
  deck: DeckPayload;
  words: PageWords;
  lines: DeckLines;
  near: boolean;
  fillEmpty: boolean;
  // "Your choice: Main floor, $3,380 + GST" in parts, or null until one is
  // chosen; with Black Friday on, regular is the total struck through.
  recap: RecapView | null;
  // The day picked at the table (YYYY-MM-DD) or null; onInstallOn is null
  // with no quote (the rehearsal with no lead), which hides Pick a day.
  installOn: string | null;
  today: string;
  onInstallOn: ((day: string | null) => void) | null;
  // What we'll need, and the Pick a day layer.
  more: MoreState;
  dayLayer: MoreState;
};

const altOf = (key: string) => SLOT_BY_KEY.get(key)?.name ?? "";

function Row({ label, children, testId }: { label: string; children: ReactNode; testId: string }) {
  return (
    <li className="flex flex-col gap-0.5 border-t border-border pt-4" data-testid={testId}>
      <p className={cn(DECK_TYPE.small, "font-semibold text-muted-foreground")}>{say(label)}</p>
      {children}
    </li>
  );
}

export function NextStepsPage({ deck, words, lines, near, fillEmpty, recap, installOn, today, onInstallOn, more, dayLayer }: NextStepsPageProps) {
  const hero = slotView(deck, "install_day.hero", fillEmpty);
  const withPicture = slotHasPicture(hero);
  const layer = moreWords(words);
  const headline = words.headline.trim();
  const thanks = deckLine(lines, "thanks").trim();

  const content = (
    <>
      {headline ? <h2 className={DECK_TYPE.headline}>{keepHyphens(headline)}</h2> : null}
      {recap ? (
        <p className={cn(DECK_TYPE.body, "-mt-2 font-semibold")} data-testid="next-steps-recap">
          {say(recap.before)}
          {recap.total ? " " : null}
          {recap.regular ? (
            <>
              <s className="font-normal text-muted-foreground" data-testid="next-steps-regular">
                <span className="sr-only">Regular price </span>
                {recap.regular}
              </s>{" "}
              <span className="sr-only">{`${BLACK_FRIDAY_LABEL} price `}</span>
            </>
          ) : null}
          {recap.total}
          {recap.after ? (/^[,.:;?]/.test(recap.after) ? say(recap.after) : ` ${say(recap.after)}`) : null}
        </p>
      ) : null}
      <ul className="flex flex-col gap-4" aria-label={headline ? say(headline) : undefined}>
        <Row label={lines.step_day_label} testId="next-step-install">
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
        </Row>
        <Row label={lines.step_pay_label} testId="next-step-pay">
          <p className={cn(DECK_TYPE.body, "font-semibold")}>{NO_PAYMENT_LINE}</p>
        </Row>
      </ul>
      <p className={cn(DECK_TYPE.small, "text-muted-foreground")} data-testid="next-steps-closing">
        {say(deckLine(lines, "closing"))}
      </p>
      {thanks ? (
        <p className={cn(DECK_TYPE.body, "font-semibold")} data-testid="next-steps-thanks">
          {say(thanks)}
        </p>
      ) : null}
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
