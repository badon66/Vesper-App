"use client";

import { useState } from "react";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ralLabel, RAL_CODE_PATTERN } from "@/lib/leads/track-colour";

// A RAL Classic number, with the colour's name shown as soon as four digits
// are typed, so a mistyped number is caught at once. Names only: screen
// colours aren't accurate, so the app never shows a swatch.
export function RalCodeField({
  id,
  name = "ral_code",
  label,
  defaultValue,
  ralNames,
  error,
  emptyHint,
}: {
  id: string;
  name?: string;
  label: string;
  defaultValue?: string | null;
  ralNames: Record<string, string>;
  error?: string;
  emptyHint?: string;
}) {
  const [code, setCode] = useState(defaultValue ?? "");
  const typed = code.trim();
  const known = RAL_CODE_PATTERN.test(typed) ? ralNames[typed] : undefined;
  const status =
    typed === ""
      ? (emptyHint ?? "")
      : known
        ? ralLabel(typed, known)
        : RAL_CODE_PATTERN.test(typed)
          ? "That number isn't on the RAL Classic list."
          : "Four digits, from the RAL K7 book.";

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        placeholder="7016"
        aria-invalid={error ? true : undefined}
        aria-describedby={`${id}-name${error ? ` ${id}-error` : ""}`}
        className="max-w-40"
      />
      <p
        id={`${id}-name`}
        aria-live="polite"
        className={known ? "text-sm font-semibold" : "text-sm text-muted-foreground"}
        data-testid={`${id}-name`}
      >
        {status}
      </p>
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}
