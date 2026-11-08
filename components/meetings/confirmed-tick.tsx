import { Check } from "lucide-react";

// Round 7 (Keenan, 2026-11-08): Keenan confirmed the time with them, by
// text or call, from the prep list. Shown on his Meetings page, Home and
// Schedule. Owner only.
export function ConfirmedTick() {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-semibold" data-testid="confirmed-tick">
      <Check aria-hidden="true" className="size-4 shrink-0" />
      Confirmed
    </span>
  );
}
