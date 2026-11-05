"use client";

import { useEffect } from "react";
import { draftKey } from "@/lib/leads/draft";

// Rendered on the page a new lead's save lands on: the lead is in, so its
// draft on this phone is done with (2026-11-03). With saveKey, only the
// draft that saved this lead goes (2026-11-05): a booking made in the sheet
// lands on the same page and must not wipe an unrelated New lead draft.
export function ClearLeadDraft({ userId, saveKey }: { userId: string; saveKey?: string | null }) {
  useEffect(() => {
    try {
      if (saveKey !== undefined) {
        const raw = localStorage.getItem(draftKey(userId));
        if (!raw || !saveKey) return;
        const draft = JSON.parse(raw) as { values?: Record<string, string> };
        if (draft.values?.save_key !== saveKey) return;
      }
      localStorage.removeItem(draftKey(userId));
    } catch {
      // Nothing kept.
    }
  }, [userId, saveKey]);
  return null;
}
