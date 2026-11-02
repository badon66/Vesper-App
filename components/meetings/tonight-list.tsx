"use client";

import { Check, CloudDownload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MeetingItem, type MeetingItemData } from "@/components/meetings/meeting-item";
import { Button } from "@/components/ui/button";
import { savedMeetingCopy, saveMeetingForOffline } from "@/lib/offline-browser";
import { formatTime } from "@/lib/time";

// Tonight on the Meetings page, with Get tonight ready (Keenan,
// 2026-11-02): one tap saves every one of tonight's meetings on the iPad,
// photos included, so each opens without signal. Each meeting says whether
// it is saved here, and when.

type Saved =
  | { state: "checking" }
  | { state: "not_saved" }
  | { state: "saving" }
  | { state: "failed" }
  | { state: "saved"; at: string };

export function TonightList({ items }: { items: MeetingItemData[] }) {
  const leadIds = useMemo(() => Array.from(new Set(items.map((item) => item.leadId))), [items]);
  const [saved, setSaved] = useState<Record<string, Saved>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // What this iPad already holds, from earlier saves or meetings opened here.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!("caches" in window)) return;
      const found = await Promise.all(
        leadIds.map(async (id) => [id, await savedMeetingCopy(id).catch(() => null)] as const),
      );
      if (cancelled) return;
      setSaved(
        Object.fromEntries(found.map(([id, at]) => [id, at ? { state: "saved", at } : { state: "not_saved" }])),
      );
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [leadIds]);

  async function getReady() {
    if (!("caches" in window)) {
      setNote("This browser can't keep meetings for use without signal.");
      return;
    }
    setBusy(true);
    setNote(null);
    let failed = 0;
    for (const id of leadIds) {
      setSaved((current) => ({ ...current, [id]: { state: "saving" } }));
      try {
        const at = await saveMeetingForOffline(id);
        setSaved((current) => ({ ...current, [id]: { state: "saved", at } }));
      } catch {
        failed += 1;
        setSaved((current) => ({ ...current, [id]: { state: "failed" } }));
      }
    }
    const worker = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    setBusy(false);
    if (failed > 0) {
      setNote(`${failed === 1 ? "One meeting" : `${failed} meetings`} didn't save. Check your signal and tap Get tonight ready again.`);
    } else if (!worker) {
      setNote("Saved, but this browser isn't ready to open them without signal yet. Reload this page once, then save again.");
    }
  }

  const savedCount = leadIds.filter((id) => saved[id]?.state === "saved").length;
  const summary =
    leadIds.length === 0
      ? null
      : savedCount === leadIds.length
        ? leadIds.length === 1
          ? "Saved on this iPad: it opens without signal."
          : `All ${leadIds.length} saved on this iPad: they open without signal.`
        : savedCount > 0
          ? `${savedCount} of ${leadIds.length} saved on this iPad.`
          : "Not saved on this iPad yet.";

  return (
    <section aria-labelledby="tonight-heading" className="flex flex-col gap-4" data-testid="meetings-tonight">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="tonight-heading" className="text-xl font-bold">
            Tonight
          </h2>
          <p className="text-sm text-muted-foreground">
            {items.length === 0
              ? "No meetings tonight."
              : `${items.length} ${items.length === 1 ? "meeting" : "meetings"}, in time order.`}
          </p>
        </div>
        {items.length > 0 ? (
          <div className="flex flex-col items-start gap-1 sm:items-end">
            <Button type="button" variant="outline" size="lg" onClick={() => void getReady()} disabled={busy}>
              <CloudDownload aria-hidden="true" />
              {busy ? "Saving tonight" : "Get tonight ready"}
            </Button>
            {summary ? (
              <p className="text-sm text-muted-foreground" role="status" data-testid="tonight-saved-summary">
                {summary}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {note ? (
        <p role="alert" className="text-sm font-semibold text-pretty">
          {note}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="text-sm text-pretty text-muted-foreground">
          When a setter books a meeting for tonight, it shows here in time order. To meet someone without a booking, use
          Start a meeting.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <MeetingItem key={item.meetingId} item={item}>
              <SavedLine saved={saved[item.leadId]} />
            </MeetingItem>
          ))}
        </ul>
      )}
    </section>
  );
}

function SavedLine({ saved }: { saved: Saved | undefined }) {
  if (!saved || saved.state === "checking") return null;
  const text =
    saved.state === "saved"
      ? `Saved on this iPad, ${formatTime(saved.at)}`
      : saved.state === "saving"
        ? "Saving."
        : saved.state === "failed"
          ? "Didn't save. Try again with signal."
          : "Not saved on this iPad.";
  return (
    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground" data-testid="meeting-saved">
      {saved.state === "saved" ? <Check aria-hidden="true" className="size-4" /> : null}
      {text}
    </p>
  );
}
