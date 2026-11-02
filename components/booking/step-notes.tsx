"use client";

import { CircleHelp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";

// What to talk about at each step (Keenan, 2026-11-02): the three notes he
// writes in Settings, behind a "?". They replaced the single Door guide.
export function StepNotes({ notes }: { notes: { label: string; text: string }[] }) {
  const [open, setOpen] = useState(false);
  const filled = notes.filter((note) => note.text.trim() !== "");
  if (filled.length === 0) return null;
  return (
    <>
      <Button type="button" variant="ghost" size="icon" aria-label="What to talk about" onClick={() => setOpen(true)} data-testid="step-notes">
        <CircleHelp className="size-6" />
      </Button>
      <DialogPanel
        open={open}
        onClose={() => setOpen(false)}
        title="What to talk about"
        actions={
          <Button type="button" onClick={() => setOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {filled.map((note) => (
            <section key={note.label} className="flex flex-col gap-1">
              <h3 className="text-base font-bold">{note.label}</h3>
              <p className="text-base whitespace-pre-line text-pretty">{note.text}</p>
            </section>
          ))}
        </div>
      </DialogPanel>
    </>
  );
}
