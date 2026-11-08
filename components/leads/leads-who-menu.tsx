"use client";

import Form from "next/form";
import { ChevronDown } from "lucide-react";

// Whose leads, as a small menu beside the title (round 6, 2026-11-08). It is
// a plain GET form, so a change shows the list at once and still works
// without JavaScript (the noscript button). The tab and any search go along.
export function LeadsWhoMenu({
  current,
  options,
  hidden,
}: {
  current: string;
  options: readonly { value: string; label: string }[];
  hidden: Record<string, string | undefined>;
}) {
  return (
    <Form action="/app/leads" className="flex min-w-0">
      {Object.entries(hidden).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      <div className="relative flex min-w-0">
        {/* 16 px text: iOS zooms the page into a smaller menu when it opens. */}
        <select
          key={current}
          name="who"
          defaultValue={current}
          aria-label="Whose leads"
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="h-11 min-w-0 cursor-pointer appearance-none rounded-md border border-border bg-background py-0 pr-9 pl-3 text-base font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      <noscript>
        <button
          type="submit"
          className="ml-2 h-11 rounded-md border border-border px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Show
        </button>
      </noscript>
    </Form>
  );
}
