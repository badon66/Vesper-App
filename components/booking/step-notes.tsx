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
              <NoteText text={note.text} />
            </section>
          ))}
        </div>
      </DialogPanel>
    </>
  );
}

// A step note as Keenan typed it: paragraphs as written, and his "- " lines
// as a list with a hanging indent, so a list scans at a glance.
export function NoteText({ text }: { text: string }) {
  const blocks: { kind: "p" | "ul"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const item = /^\s*[-•]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (item) {
      if (last?.kind === "ul") last.lines.push(item[1]);
      else blocks.push({ kind: "ul", lines: [item[1]] });
    } else if (line.trim() === "") {
      blocks.push({ kind: "p", lines: [] });
    } else if (last?.kind === "p" && last.lines.length > 0) {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "p", lines: [line] });
    }
  }
  return (
    <div className="flex flex-col gap-2 text-base text-pretty">
      {blocks
        .filter((block) => block.lines.length > 0)
        .map((block, index) =>
          block.kind === "ul" ? (
            <ul key={index} className="flex list-disc flex-col gap-1 pl-5">
              {block.lines.map((line, at) => (
                <li key={at}>{line}</li>
              ))}
            </ul>
          ) : (
            <p key={index} className="whitespace-pre-line">
              {block.lines.join("\n")}
            </p>
          ),
        )}
    </div>
  );
}
