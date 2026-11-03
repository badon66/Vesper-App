"use client";

import { useEffect } from "react";
import { draftKey } from "@/lib/leads/draft";

// Rendered on the page a new lead's save lands on: the lead is in, so its
// draft on this phone is done with (2026-11-03).
export function ClearLeadDraft({ userId }: { userId: string }) {
  useEffect(() => {
    try {
      localStorage.removeItem(draftKey(userId));
    } catch {
      // Nothing kept.
    }
  }, [userId]);
  return null;
}
