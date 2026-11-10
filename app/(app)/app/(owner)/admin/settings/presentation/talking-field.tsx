"use client";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TALKING_MAX, talkingLength } from "@/lib/meeting/talking-points";
import { cn } from "@/lib/utils";

// One page's talking points in Settings > Presentation (round 10): Keenan's
// private notes for that page. In a meeting they show only while he presses
// and holds the small mark in the page's top right corner; a customer never
// reads them, so the customer copy rules don't apply here.
export function TalkingField({
  page,
  pageName,
  value,
  onChange,
  error,
}: {
  page: string;
  pageName: string;
  value: string;
  onChange: (text: string) => void;
  error?: string;
}) {
  const id = `talking-${page}`;
  const n = talkingLength(value);
  const over = n > TALKING_MAX;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4" data-testid="talking-field" data-page={page}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <Label htmlFor={id}>Talking points</Label>
        <p id={`${id}-count`} className={cn("text-sm tabular-nums", over ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {n} of {TALKING_MAX} characters
        </p>
      </div>
      <Textarea
        id={id}
        value={value}
        rows={4}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-invalid={error || over ? true : undefined}
        aria-describedby={[`${id}-count`, `${id}-hint`, error ? `${id}-error` : null].filter(Boolean).join(" ")}
        autoComplete="off"
        spellCheck
      />
      <p id={`${id}-hint`} className="text-sm text-pretty text-muted-foreground">
        Only you see these. In a meeting, press and hold the small dot in the top right corner of {pageName} to read them; let
        go and they&apos;re gone.
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
