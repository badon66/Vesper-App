"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setInstallDay } from "@/app/(app)/app/leads/quote-outcome-actions";
import { InstallDayChooser } from "@/components/installs/install-day-chooser";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";
import type { PickDay } from "@/lib/installs/calendar";
import { formatLongDay } from "@/lib/time";

// Round 23 (Keenan, 2026-11-17): Keenan changes a lead's install day any
// time, from the lead: one of his open days with room, or no day yet. The
// customer's own 2-day limit doesn't apply to him. The database checks the
// day again under its lock and says so when it just filled up.

export function InstallDaySheet({
  open,
  onClose,
  leadId,
  current,
  days,
}: {
  open: boolean;
  onClose: () => void;
  leadId: string;
  current: string | null;
  days: PickDay[];
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(current);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const save = (day: string | null) => {
    setMessage(null);
    start(async () => {
      const result = await setInstallDay({ leadId, on: day });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  return (
    <DialogPanel
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Install day"
      testId="install-day-sheet"
      actions={
        <>
          {current ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => save(null)} data-testid="install-day-sheet-clear">
              No day yet
            </Button>
          ) : null}
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Back
          </Button>
          <Button type="button" disabled={busy || !chosen || chosen === current} onClick={() => save(chosen)} data-testid="install-day-sheet-save">
            {busy ? "Saving" : "Save"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-pretty text-muted-foreground">
          {chosen ? `${formatLongDay(chosen)}.` : "No day yet."} Your open install days, from tomorrow. Open more on Installs.
        </p>
        <InstallDayChooser days={days} chosen={chosen} onChoose={setChosen} label="Install day" testId="install-day-sheet-days" />
        {message ? (
          <p role="alert" className="font-semibold text-pretty text-destructive" data-testid="install-day-sheet-message">
            {message}
          </p>
        ) : null}
      </div>
    </DialogPanel>
  );
}

// The lead's install day in At a glance: the day for everyone who sees the
// lead, and Change (or Add a day) for Keenan.
export function InstallDayGlance({
  leadId,
  day,
  days,
  canChange,
}: {
  leadId: string;
  day: string | null;
  days: PickDay[] | null;
  canChange: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-x-3">
      <span className="font-semibold" data-testid="glance-install-day">
        {day ? formatLongDay(day) : "No day yet"}
      </span>
      {canChange && days ? (
        <>
          <Button type="button" size="sm" variant="ghost" className="underline underline-offset-4" onClick={() => setOpen(true)} data-testid="glance-install-change">
            {day ? "Change" : "Add a day"}
          </Button>
          {open ? <InstallDaySheet open onClose={() => setOpen(false)} leadId={leadId} current={day} days={days} /> : null}
        </>
      ) : null}
    </div>
  );
}
