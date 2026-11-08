"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";

import { Deck } from "@/components/meeting/deck-view";
import type { MeetingPayload } from "@/lib/meeting/state";

// Meeting mode (M5; the deck from round 7): the customer-facing presentation
// and live quote for one lead, full screen on the iPad, no tabs, nothing
// internal anywhere. The deck itself is components/meeting/deck-view.tsx,
// shared with the rehearsal view; here it keeps the iPad's copy of the
// meeting and leaves for the lead page when Keenan holds the X.
//
// While it is open (round 7 review) the status bar above it is the deck's
// Night Background whatever the app's theme, and the page never rubber-bands
// past its edges; both go back as they were when it closes.
export const MEETING_STATUS_BAR = "#0c1b26";

export function MeetingMode({ payload }: { payload: MeetingPayload }) {
  const router = useRouter();
  const leadId = payload.lead.id;
  // Replace, not push: the deck's guard step in history goes with it.
  const onExit = useCallback(() => router.replace(`/app/leads/${leadId}`), [router, leadId]);

  useEffect(() => {
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const added = metas.length === 0 ? document.head.appendChild(Object.assign(document.createElement("meta"), { name: "theme-color" })) : null;
    const colours = metas.map((meta) => meta.getAttribute("content"));
    for (const meta of added ? [added] : metas) meta.setAttribute("content", MEETING_STATUS_BAR);
    const root = document.documentElement;
    const body = document.body;
    const overscroll = [root.style.overscrollBehavior, body.style.overscrollBehavior];
    root.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      metas.forEach((meta, at) => {
        const was = colours[at];
        if (was === null) meta.removeAttribute("content");
        else meta.setAttribute("content", was);
      });
      added?.remove();
      root.style.overscrollBehavior = overscroll[0];
      body.style.overscrollBehavior = overscroll[1];
    };
  }, []);

  return <Deck deck={payload.deck} meeting={payload} mode="meeting" onExit={onExit} className="fixed inset-0 z-50" />;
}
