"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { saveQuoteDraft, type InstallDayClaim } from "@/app/(app)/meeting/actions";
import { NO_SIGNAL_SAVE, quoteSaveInput, type SaveFrom } from "@/lib/quotes/draft";
import { quoteFingerprint, type MeetingPayload, type QuoteUIState } from "@/lib/meeting/state";
import { stampedUpdatedAt } from "@/lib/quotes/stamp";

// Round 20: the stamp each lead's quote was last opened or saved at, shared
// by every save on the page (meeting mode saves the table's choice quietly
// and from its Edit layer), so one save never makes the other look stale.
const stamps = new Map<string, string>();

// Called by the screens with the stamp the server loaded the quote with. A
// page read that lags behind this page's own last save never takes the
// stamp back to before it.
export function rememberQuoteStamp(leadId: string, stamp: string | null | undefined): void {
  if (typeof stamp !== "string") return;
  const known = stamps.get(leadId);
  if (known && known.split("|")[0] === stamp.split("|")[0] && (stampedUpdatedAt(known) ?? 0) > (stampedUpdatedAt(stamp) ?? 0)) return;
  stamps.set(leadId, stamp);
}

// Saving the quote from meeting mode's Edit layer, its quiet save of the
// table's choice, or the lead page's quote editor: the same server action
// and the same draft row (round 9). In the rehearsal view nothing is written
// and the save is acted out on screen.
//
// CONTRACT
//   useQuoteSave({ leadId, pricing, from, readOnly? })
//     -> { busy, message, clearMessage, save(state, { quiet? }) }
//   save resolves with { quoteId, savedAt, fingerprint } once saved, or null
//   (the reason is in message; a quiet save leaves message alone, so the
//   customer's page never shows it). Round 20: every save carries the stamp
//   the quote was opened with (rememberQuoteStamp), and the server refuses
//   it when the quote changed since: "This quote changed since you opened
//   it. Reopen it to see the latest, then make your change."

const NO_SIGNAL_SAVE_HERE = "No signal. Your changes stay here; save again when you're back online.";

// Round 23: installDay, when the save also claimed the meeting's install day.
export type Saved = { quoteId: string; savedAt: string; fingerprint: string; installDay?: InstallDayClaim };

export function useQuoteSave({
  leadId,
  pricing,
  from,
  readOnly = false,
}: {
  leadId: string;
  pricing: MeetingPayload["pricing"];
  from: SaveFrom;
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const save = useCallback(
    async (state: QuoteUIState, { quiet = false, quoteId = null }: { quiet?: boolean; quoteId?: string | null } = {}): Promise<Saved | null> => {
      // What is being saved, as it stands at the tap; edits made while the
      // save is in flight still count as unsaved afterwards.
      const fingerprint = quoteFingerprint(state);
      if (readOnly) return { quoteId: quoteId ?? "rehearsal", savedAt: new Date().toISOString(), fingerprint };
      if (!quiet) {
        setBusy(true);
        setMessage(null);
      }
      try {
        const result = await saveQuoteDraft({ ...quoteSaveInput(state, pricing, leadId, from), stamp: stamps.get(leadId) ?? null });
        if (!result.ok) {
          if (!quiet) setMessage(result.message);
          // Round 20: on the lead page the page reads the quote again behind
          // the message, so reopening the editor shows the latest.
          if (result.code === "quote_changed" && from === "lead") router.refresh();
          return null;
        }
        if (result.stamp) stamps.set(leadId, result.stamp);
        return { quoteId: result.quoteId, savedAt: result.savedAt, fingerprint, ...(result.installDay ? { installDay: result.installDay } : {}) };
      } catch {
        if (!quiet) setMessage(from === "lead" ? NO_SIGNAL_SAVE_HERE : NO_SIGNAL_SAVE);
        return null;
      } finally {
        if (!quiet) setBusy(false);
      }
    },
    [readOnly, pricing, leadId, from, router],
  );

  const clearMessage = useCallback(() => setMessage(null), []);
  return { busy, message, clearMessage, save };
}
