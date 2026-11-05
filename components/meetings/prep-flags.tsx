import { ChevronRight, CircleAlert } from "lucide-react";
import Link from "next/link";

// What a meeting still needs before Keenan leaves for it: the same flags on
// the Meetings page and on his Home (2026-11-05). Owner only.
export function PrepFlags({
  leadId,
  missingMockup,
  missingColour,
  compact = false,
}: {
  leadId: string;
  missingMockup: boolean;
  missingColour: boolean;
  // Home (2026-11-05): one line for both, with one link.
  compact?: boolean;
}) {
  if (!missingMockup && !missingColour) return null;
  if (compact) {
    // One line, itself the link (no second "Open" beside the name), to the
    // part of the lead page that fixes the first thing missing.
    const needs = [missingMockup ? "a mockup" : null, missingColour ? "the track colour" : null].filter(Boolean).join(" and ");
    return (
      <Link
        href={`/app/leads/${leadId}${missingMockup ? "#mockup" : "#track-colour"}`}
        className="-mx-1 flex min-h-11 items-center gap-2 rounded px-1 text-sm font-semibold outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="prep-flags"
      >
        <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 text-pretty">Still needs {needs}</span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    );
  }
  return (
    <ul className="mt-1 flex flex-col" aria-label="To fix before the meeting" data-testid="prep-flags">
      {missingMockup ? (
        <li className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          No mockup yet.
          <Link href={`/app/leads/${leadId}#mockup`} className="inline-flex min-h-11 items-center font-normal underline underline-offset-4">
            Add it on the lead page
          </Link>
        </li>
      ) : null}
      {missingColour ? (
        <li className="flex flex-wrap items-center gap-x-2 text-sm font-semibold">
          <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
          No track colour yet.
          <Link
            href={`/app/leads/${leadId}#track-colour`}
            className="inline-flex min-h-11 items-center font-normal underline underline-offset-4"
          >
            Set it on the lead page
          </Link>
        </li>
      ) : null}
    </ul>
  );
}
