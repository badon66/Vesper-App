import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { toBeCompletedLabel, type ToFinishItem } from "@/lib/leads/to-finish";

// The lead page's To be completed (Keenan, 2026-11-10): closed by default,
// its count in the summary, listing what is still missing on the lead. Each
// row goes straight to the field that finishes it. Shown to whoever can
// edit the lead (its setter and Keenan); the page leaves it out when
// nothing is missing.
export function ToBeCompleted({ items }: { items: ToFinishItem[] }) {
  return (
    <details className="group overflow-hidden rounded-xl border bg-card text-card-foreground" data-testid="to-be-completed">
      <summary
        className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-2 text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [&::-webkit-details-marker]:hidden"
        data-testid="to-be-completed-summary"
      >
        <span>{toBeCompletedLabel(items.length)}</span>
        <ChevronDown aria-hidden="true" className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <ul className="flex flex-col divide-y border-t" aria-label="Still to finish">
        {items.map((item) => (
          <li key={item.key} data-item={item.key}>
            <Link
              href={item.href}
              className="flex min-h-12 items-center justify-between gap-3 px-4 py-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            >
              <span className="flex flex-col">
                <span className="font-semibold">{item.label}</span>
                <span className="text-sm text-pretty text-muted-foreground">{item.detail}</span>
              </span>
              <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
