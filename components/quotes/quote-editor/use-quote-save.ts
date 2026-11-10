"use client";

import { useCallback, useState } from "react";

import { saveQuoteDraft } from "@/app/(app)/meeting/actions";
import { NO_SIGNAL_SAVE, quoteSaveInput, type SaveFrom } from "@/lib/quotes/draft";
import { quoteFingerprint, type MeetingPayload, type QuoteUIState } from "@/lib/meeting/state";

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
//   customer's page never shows it).

const NO_SIGNAL_SAVE_HERE = "No signal. Your changes stay here; save again when you're back online.";

export type Saved = { quoteId: string; savedAt: string; fingerprint: string };

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
        const result = await saveQuoteDraft(quoteSaveInput(state, pricing, leadId, from));
        if (!result.ok) {
          if (!quiet) setMessage(result.message);
          return null;
        }
        return { quoteId: result.quoteId, savedAt: result.savedAt, fingerprint };
      } catch {
        if (!quiet) setMessage(from === "lead" ? NO_SIGNAL_SAVE_HERE : NO_SIGNAL_SAVE);
        return null;
      } finally {
        if (!quiet) setBusy(false);
      }
    },
    [readOnly, pricing, leadId, from],
  );

  const clearMessage = useCallback(() => setMessage(null), []);
  return { busy, message, clearMessage, save };
}
