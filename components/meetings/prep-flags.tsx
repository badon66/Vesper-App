import { CircleAlert } from "lucide-react";
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
    const needs = [missingMockup ? "a mockup" : null, missingColour ? "the track colour" : null].filter(Boolean).join(" and ");
    return (
      <p className="flex flex-wrap items-center gap-x-2 text-sm font-semibold" data-testid="prep-flags">
        <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
        Still needs {needs}.
        <Link
          href={`/app/leads/${leadId}${missingMockup ? "#mockup" : "#track-colour"}`}
          className="inline-flex min-h-11 items-center font-normal underline underline-offset-4"
        >
          Open the lead
        </Link>
      </p>
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
