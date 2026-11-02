"use client";

import { Check, CloudDownload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MeetingItem, type MeetingItemData } from "@/components/meetings/meeting-item";
import { Button } from "@/components/ui/button";
import {
  canOpenWithoutSignal,
  savedMeetingCopy,
  saveMeetingForOffline,
  saveMeetingsPageForOffline,
} from "@/lib/offline-browser";
import { formatTime } from "@/lib/time";

// Tonight on the Meetings page, with Get tonight ready (Keenan,
// 2026-11-02): one tap saves every one of tonight's meetings on this
// device, photos included, and this page with them, so each opens without
// signal. Each meeting says whether it is saved here, and a save made
// before its lead changed (a mockup added, a colour set) counts as not
// saved until it is saved again.

type Saved = { state: "not_saved" } | { state: "saving" } | { state: "failed" } | { state: "saved"; at: string };

export function TonightList({ items }: { items: MeetingItemData[] }) {
  const leadIds = useMemo(() => Array.from(new Set(items.map((item) => item.leadId))), [items]);
  const changedAt = useMemo(() => {
    const latest = new Map<string, number>();
    for (const item of items) latest.set(item.leadId, Math.max(latest.get(item.leadId) ?? 0, Date.parse(item.changedAt)));
    return latest;
  }, [items]);
  const [saved, setSaved] = useState<Record<string, Saved> | null>(null);
  const [offlineReady, setOfflineReady] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // What this device already holds, from earlier saves or meetings opened here.
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!("caches" in window)) {
        if (!cancelled) setOfflineReady(false);
        return;
      }
      const [found, ready] = await Promise.all([
        Promise.all(leadIds.map(async (id) => [id, await savedMeetingCopy(id).catch(() => null)] as const)),
        canOpenWithoutSignal().catch(() => false),
      ]);
      if (cancelled) return;
      setOfflineReady(ready);
      setSaved(Object.fromEntries(found.map(([id, at]) => [id, at ? { state: "saved", at } : { state: "not_saved" }])));
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [leadIds]);

  const fresh = (id: string, entry: Saved | undefined) =>
    entry?.state === "saved" && Date.parse(entry.at) >= (changedAt.get(id) ?? 0);

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
    // This page too: opened from the home screen without signal, the app
    // comes back here, to Start buttons for the saved meetings.
    const pageSaved = await saveMeetingsPageForOffline().then(
      () => true,
      () => false,
    );
    const ready = await canOpenWithoutSignal().catch(() => false);
    setOfflineReady(ready);
    setBusy(false);
    if (failed > 0 || !pageSaved) {
      setNote(
        failed > 0
          ? `${failed === 1 ? "One meeting" : `${failed} meetings`} didn't save. Check your signal and tap Get tonight ready again.`
          : "The meetings saved, but this page didn't. Check your signal and tap Get tonight ready again.",
      );
    }
  }

  const needFix = items.filter((item) => item.missingMockup || item.missingColour).length;
  const savedCount = saved ? leadIds.filter((id) => fresh(id, saved[id])).length : 0;
  const summary = !saved
    ? null
    : !offlineReady
      ? "This browser isn't ready to open meetings without signal yet. Reload this page once, then tap Get tonight ready."
      : savedCount === leadIds.length
        ? leadIds.length === 1
          ? "Saved on this device: it opens without signal."
          : `All ${leadIds.length} saved on this device: they open without signal.`
        : savedCount > 0
          ? `${savedCount} of ${leadIds.length} saved on this device.`
          : "Not saved on this device yet.";

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
          {needFix > 0 ? (
            <p className="mt-1 text-sm font-semibold" data-testid="tonight-need-fix">
              {needFix === 1 ? "1 meeting needs" : `${needFix} meetings need`} a fix before you leave.
            </p>
          ) : null}
        </div>
        {items.length > 0 ? (
          <div className="flex max-w-sm flex-col items-start gap-1 sm:items-end sm:text-right">
            <Button type="button" variant="outline" size="lg" onClick={() => void getReady()} disabled={busy}>
              <CloudDownload aria-hidden="true" />
              {busy ? "Saving tonight" : "Get tonight ready"}
            </Button>
            <p className="text-sm text-muted-foreground">Do this last, after fixing anything flagged.</p>
            {summary ? (
              <p className="text-sm font-semibold text-pretty" role="status" data-testid="tonight-saved-summary">
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
              <SavedLine saved={saved?.[item.leadId]} stale={!fresh(item.leadId, saved?.[item.leadId]) && saved?.[item.leadId]?.state === "saved"} />
            </MeetingItem>
          ))}
        </ul>
      )}
    </section>
  );
}

function SavedLine({ saved, stale }: { saved: Saved | undefined; stale: boolean }) {
  if (!saved) return null;
  const text = stale
    ? "Changed since it was saved. Tap Get tonight ready again."
    : saved.state === "saved"
      ? `Saved on this device, ${formatTime(saved.at)}`
      : saved.state === "saving"
        ? "Saving."
        : saved.state === "failed"
          ? "Didn't save. Try again with signal."
          : "Not saved on this device.";
  return (
    <p
      className={stale ? "mt-1 text-sm font-semibold" : "mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"}
      data-testid="meeting-saved"
    >
      {saved.state === "saved" && !stale ? <Check aria-hidden="true" className="size-4" /> : null}
      {text}
    </p>
  );
}
