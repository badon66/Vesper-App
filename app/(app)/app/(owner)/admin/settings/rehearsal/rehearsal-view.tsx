"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useId, useMemo, useOptimistic, useState, useTransition } from "react";

import { Deck } from "@/components/meeting/deck-view";
import type { DeckPageKey, DeckSlot } from "@/lib/deck";
import { deckPages } from "@/lib/meeting/deck-pages";

import { ExampleShot } from "./example-shot";
import { landingPage, PRESENTATION_SETTINGS, REHEARSAL_WORDS, rehearsalHref, type RehearsalData } from "./rehearsal";

// The rehearsal view (round 7, rehearsal_and_references): the meeting's own
// deck, exactly as meeting mode renders it, under a permanent gold bar. Every
// empty slot shows its example to copy; the Customer view switch shows
// exactly what a real meeting would show today, fallbacks and skipped pages
// included, with the bar still on. "Rehearse with" picks one of the upcoming
// meetings, or no lead (the picker, mockup, colour and price pages are then
// skipped).
//
// It writes nothing: the deck runs in its rehearsal mode (no iPad copy, no
// history guard, Save and Confirm acted out on screen, no server action),
// and this view keeps nothing either. Switching the lead or the Customer
// view reopens the deck on the page Keenan was on.

const BAR_FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-primary";

export function RehearsalView({ deck, meeting, examples, choices, leadId }: RehearsalData) {
  const router = useRouter();
  const [customerView, setCustomerView] = useState(false);
  const [page, setPage] = useState<DeckPageKey | null>(null);
  const [pending, startTransition] = useTransition();
  const [shownLead, setShownLead] = useOptimistic(leadId ?? "");
  const switchId = useId();
  const selectId = useId();

  const renderEmptySlot = useCallback(
    (slot: DeckSlot) => <ExampleShot slot={slot} example={examples[slot.key] ?? null} />,
    [examples],
  );
  const fillEmpty = !customerView;

  // The page the deck opens on when it remounts: the one Keenan was on, or
  // the next that still shows.
  const startPage = useMemo(() => {
    const keys = deckPages({ deck, lead: meeting ? { mockupUrl: meeting.mockupUrl } : null, fillEmpty }).map((item) => item.key);
    return landingPage(keys, page) ?? undefined;
  }, [deck, meeting, fillEmpty, page]);

  const onExit = useCallback(() => router.push(PRESENTATION_SETTINGS), [router]);

  function rehearseWith(next: string) {
    startTransition(() => {
      setShownLead(next);
      router.replace(rehearsalHref(next || null), { scroll: false });
    });
  }

  return (
    <div className="dark fixed inset-0 z-50 flex flex-col bg-background text-foreground" data-testid="rehearsal">
      <div className="shrink-0 bg-primary pt-[env(safe-area-inset-top)] text-primary-foreground">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-1.5">
          <p className="mr-auto py-2 text-base font-bold" data-testid="rehearsal-bar">
            {REHEARSAL_WORDS.bar}
          </p>

          <div className="flex items-center gap-3">
            <label htmlFor={selectId} className="text-base font-semibold whitespace-nowrap">
              {REHEARSAL_WORDS.rehearseWith}
            </label>
            <span className="relative">
              <select
                id={selectId}
                value={shownLead}
                onChange={(event) => rehearseWith(event.currentTarget.value)}
                aria-busy={pending}
                data-testid="rehearsal-lead"
                className={`h-11 w-[17rem] max-w-[60vw] appearance-none truncate rounded-md border-2 border-primary-foreground bg-primary pr-10 pl-3 text-base font-semibold text-primary-foreground aria-busy:opacity-60 ${BAR_FOCUS}`}
              >
                <option value="">{choices.length > 0 ? REHEARSAL_WORDS.noLead : REHEARSAL_WORDS.noMeetings}</option>
                {choices.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.options.map((option) => (
                      <option key={option.leadId} value={option.leadId}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-5 -translate-y-1/2" />
            </span>
          </div>

          <div className="flex min-h-11 items-center gap-3">
            <label htmlFor={switchId} className="cursor-pointer text-base font-semibold whitespace-nowrap">
              {REHEARSAL_WORDS.customerView}
            </label>
            <SwitchPrimitive.Root
              id={switchId}
              checked={customerView}
              onCheckedChange={setCustomerView}
              data-testid="rehearsal-customer-view"
              className={`inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border-2 border-primary-foreground bg-transparent data-[state=checked]:bg-primary-foreground ${BAR_FOCUS}`}
            >
              <SwitchPrimitive.Thumb className="pointer-events-none block size-6 translate-x-0.5 rounded-full bg-primary-foreground data-[state=checked]:translate-x-6 data-[state=checked]:bg-primary" />
            </SwitchPrimitive.Root>
          </div>

          <span aria-live="polite" className="sr-only">
            {pending ? REHEARSAL_WORDS.opening : ""}
          </span>

          <Link
            href={PRESENTATION_SETTINGS}
            className={`inline-flex min-h-11 items-center rounded-md px-3 text-base font-bold underline underline-offset-4 ${BAR_FOCUS}`}
          >
            {REHEARSAL_WORDS.done}
          </Link>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <Deck
          key={`${leadId ?? "no-lead"}:${customerView ? "customer" : "examples"}`}
          className="absolute inset-0"
          deck={deck}
          meeting={meeting}
          mode="rehearsal"
          renderEmptySlot={customerView ? undefined : renderEmptySlot}
          onExit={onExit}
          startPage={startPage}
          onPage={setPage}
        />
      </div>
    </div>
  );
}
