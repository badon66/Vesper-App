"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

import { Deck } from "@/components/meeting/deck-view";
import type { MeetingPayload } from "@/lib/meeting/state";

// Meeting mode (M5; the deck from round 7): the customer-facing presentation
// and live quote for one lead, full screen on the iPad, no tabs, nothing
// internal anywhere. The deck itself is components/meeting/deck-view.tsx,
// shared with the rehearsal view; here it keeps the iPad's copy of the
// meeting and leaves for the lead page when Keenan holds the X.
export function MeetingMode({ payload }: { payload: MeetingPayload }) {
  const router = useRouter();
  const leadId = payload.lead.id;
  // Replace, not push: the deck's guard step in history goes with it.
  const onExit = useCallback(() => router.replace(`/app/leads/${leadId}`), [router, leadId]);
  return <Deck deck={payload.deck} meeting={payload} mode="meeting" onExit={onExit} className="fixed inset-0 z-50" />;
}
