import { ChevronDown } from "lucide-react";

// The Door guide: Keenan's short script for a visit, at the top of New lead.
// Closed until tapped, so it never pushes the form down at the door. The
// text is a setting he edits.
export function DoorGuide({ text }: { text: string }) {
  return (
    <details className="group rounded-md border bg-card text-card-foreground" data-testid="door-guide">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-md px-4 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        Door guide
        <ChevronDown aria-hidden="true" className="size-5 shrink-0 group-open:rotate-180" />
      </summary>
      <p className="border-t px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
    </details>
  );
}
