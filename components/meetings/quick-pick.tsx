import Link from "next/link";
import type { PrepGlance } from "@/components/meetings/prep-line";
import { Check, CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

// Quick pick on the Meetings page (round 7, Keenan, 2026-11-08): under
// tonight, a row of the next few days' meetings and a row of the newest
// leads, each one tap to its prep list (the card) or to Start. Search, in
// Start a meeting, stays for everyone else.
export type QuickPickItem = {
  leadId: string;
  name: string;
  // "6:00 p.m. tomorrow", or for a lead "Added Nov 7".
  when: string;
  place: string | null;
  prep: PrepGlance;
  confirmed: boolean;
};

export function QuickPickRow({
  id,
  title,
  note,
  empty,
  items,
  testId,
}: {
  id: string;
  title: string;
  note: string;
  empty: string;
  items: QuickPickItem[];
  testId: string;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-testid={testId}>
      <div>
        <h2 id={id} className="text-xl font-bold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{items.length === 0 ? empty : note}</p>
      </div>
      {items.length > 0 ? (
        // One row that scrolls sideways on its own; the page never does.
        <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
          {items.map((item) => (
            <li
              key={item.leadId}
              className="relative flex w-[16.5rem] shrink-0 snap-start flex-col gap-2 rounded-xl border p-4 focus-within:ring-2 focus-within:ring-ring"
              data-testid="quick-pick"
              data-lead={item.leadId}
            >
              <Link
                href={`/app/meetings/prep/${item.leadId}`}
                className="text-base font-semibold text-pretty outline-none after:absolute after:inset-0 after:rounded-xl"
              >
                {item.name}
              </Link>
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold tabular-nums">{item.when}</span>
                {item.confirmed ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Check aria-hidden="true" className="size-3.5" />
                    Confirmed
                  </span>
                ) : null}
              </p>
              {item.place ? <p className="truncate text-sm text-muted-foreground">{item.place}</p> : null}
              <p className="mt-auto flex items-center gap-1.5 text-sm" data-testid="quick-pick-prep" data-ready={item.prep.ready ? "true" : "false"}>
                {item.prep.ready ? (
                  <Check aria-hidden="true" className="size-4 shrink-0" />
                ) : (
                  <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                )}
                <span className="font-semibold">{item.prep.ready ? "Ready" : `${item.prep.left} left`}</span>
              </p>
              <Button asChild variant="outline" className="relative z-10 h-11 self-start px-6">
                {/* A full page load on purpose, as everywhere Start is. */}
                <a href={`/meeting/${item.leadId}#start`} aria-label={`Start the meeting with ${item.name}`}>
                  Start
                </a>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
