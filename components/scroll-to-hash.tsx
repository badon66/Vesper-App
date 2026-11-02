"use client";

import { useEffect } from "react";

// A link to a card on a page (the Meetings page's flags link to #mockup and
// #track-colour on a lead) lands on that card, even when the page streams in
// after its loading screen, when the router's own jump finds nothing yet.
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);
  return null;
}
