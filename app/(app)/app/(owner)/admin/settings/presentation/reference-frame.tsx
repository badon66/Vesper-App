"use client";

import { ExternalLink } from "lucide-react";
import { useState, useTransition } from "react";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReferenceRow } from "@/lib/photos-deck";
import { referenceIssues, type ReferenceField, type ReferenceInput } from "@/lib/settings/deck-schema";
import { updateReference } from "./actions";

// An example shot to copy (round 7): another company's photo, shown only
// here and in the rehearsal view, never at a meeting. It loads straight
// from where it lives with no referrer: never downloaded, proxied or
// stored. A dashed Night Text frame and a solid tag say it isn't Keenan's.
// When the site blocks it, or the link is a page rather than an image, the
// frame says so and links to the example instead.

export function ReferenceFrame({
  reference,
  slotName,
  onSaved,
}: {
  reference: ReferenceRow;
  slotName: string;
  onSaved: (reference: ReferenceRow) => void;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const failed = !reference.image_url || failedUrl === reference.image_url;

  if (editing) {
    return (
      <ReferenceEditor
        reference={reference}
        onCancel={() => setEditing(false)}
        onSaved={(next) => {
          setEditing(false);
          onSaved(next);
        }}
      />
    );
  }

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative rounded-md border-2 border-dashed border-foreground p-1">
        <span className="absolute top-2 left-2 z-10 rounded-sm bg-foreground px-2 py-1 text-xs font-bold text-background">
          Example to copy
        </span>
        {failed ? (
          <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-sm bg-muted/40 p-4 pt-10 text-center">
            <p className="max-w-xs text-sm text-pretty text-muted-foreground">
              {reference.image_url ? "This site doesn't let the example show here." : "This example is a page, not a single photo."}
            </p>
            <a
              href={reference.page_url}
              target="_blank"
              rel="noreferrer noopener"
              referrerPolicy="no-referrer"
              className="inline-flex min-h-11 items-center gap-1.5 font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Open the example
              <ExternalLink aria-hidden="true" className="size-4" />
              <span className="sr-only"> (opens a new tab)</span>
            </a>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- another site's photo, hotlinked with no referrer, never stored or optimised
          <img
            src={reference.image_url ?? undefined}
            alt={`Example of ${slotName.toLowerCase()}, from ${reference.site}`}
            referrerPolicy="no-referrer"
            loading="lazy"
            decoding="async"
            onError={() => setFailedUrl(reference.image_url)}
            className="aspect-[4/3] w-full rounded-sm bg-muted/40 object-cover"
          />
        )}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-muted-foreground">From {reference.site}</span>
        {failed ? null : (
          <a
            href={reference.page_url}
            target="_blank"
            rel="noreferrer noopener"
            referrerPolicy="no-referrer"
            className="inline-flex min-h-11 items-center gap-1 font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open its page
            <ExternalLink aria-hidden="true" className="size-4" />
            <span className="sr-only"> (opens a new tab)</span>
          </a>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Replace link
        </Button>
      </figcaption>
      <details className="group rounded-md border px-3 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Why it works, and how to copy it
        </summary>
        <div className="flex flex-col gap-3 pb-3">
          <div>
            <p className="font-semibold">Why it works</p>
            <p className="text-pretty whitespace-pre-line text-muted-foreground">{reference.why}</p>
          </div>
          <div>
            <p className="font-semibold">How to copy it with our lights</p>
            <p className="text-pretty whitespace-pre-line text-muted-foreground">{reference.shot}</p>
          </div>
        </div>
      </details>
    </figure>
  );
}

const FIELDS: { field: ReferenceField; label: string; hint?: string; rows?: number }[] = [
  { field: "pageUrl", label: "Page it lives on" },
  { field: "imageUrl", label: "Image address", hint: "Optional. Right-click the photo and copy its address. Many sites block showing it here; the page link always works." },
  { field: "site", label: "Site" },
  { field: "why", label: "Why it works", rows: 4 },
  { field: "shot", label: "How to copy it with our lights", rows: 4 },
];

function ReferenceEditor({
  reference,
  onCancel,
  onSaved,
}: {
  reference: ReferenceRow;
  onCancel: () => void;
  onSaved: (reference: ReferenceRow) => void;
}) {
  const [value, setValue] = useState<ReferenceInput>({
    pageUrl: reference.page_url,
    imageUrl: reference.image_url ?? "",
    site: reference.site,
    why: reference.why,
    shot: reference.shot,
  });
  const [tried, setTried] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const issues = referenceIssues(value);

  function save() {
    setTried(true);
    setMessage(null);
    if (Object.keys(issues).length > 0) return;
    startTransition(async () => {
      const result = await updateReference(reference.id, value);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      onSaved({
        ...reference,
        page_url: value.pageUrl.trim(),
        image_url: value.imageUrl.trim() || null,
        site: value.site.trim(),
        why: value.why.trim(),
        shot: value.shot.trim(),
      });
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border p-3" role="group" aria-label="Replace the example link">
      <p className="text-sm text-muted-foreground">Links only: the photo stays on its own site and is never copied here.</p>
      {FIELDS.map(({ field, label, hint, rows }) => {
        const id = `reference-${reference.id}-${field}`;
        const error = tried ? issues[field] : undefined;
        const props = {
          id,
          value: value[field],
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
            const text = event.currentTarget.value;
            setValue((previous) => ({ ...previous, [field]: text }));
          },
          "aria-invalid": error ? (true as const) : undefined,
          "aria-describedby": [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined,
          autoComplete: "off",
        };
        return (
          <div key={field} className="flex flex-col gap-2">
            <Label htmlFor={id}>{label}</Label>
            {rows ? <Textarea {...props} rows={rows} /> : <Input {...props} inputMode={field.endsWith("Url") ? "url" : undefined} />}
            {hint ? (
              <p id={`${id}-hint`} className="text-sm text-muted-foreground">
                {hint}
              </p>
            ) : null}
            <FieldError id={`${id}-error`} message={error} />
          </div>
        );
      })}
      {message ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          {message}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={pending}>
          {pending ? "Saving" : "Save link"}
        </Button>
      </div>
    </div>
  );
}
