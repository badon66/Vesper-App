"use client";

import { useState, useTransition } from "react";
import { addLeadNote } from "@/app/(app)/app/leads/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function NoteForm({ leadId }: { leadId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await addLeadNote({}, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        form.reset();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={leadId} />
      <Label htmlFor="lead-note">Add a note</Label>
      <Textarea id="lead-note" name="text" rows={3} />
      {error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" variant="outline" size="lg" disabled={pending}>
        {pending ? "Saving" : "Add note"}
      </Button>
    </form>
  );
}
