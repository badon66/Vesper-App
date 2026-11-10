"use client";

import { useEffect } from "react";

// How long a field that was jumped to stays marked.
const LANDED_MS = 2500;

// Brings the element with this id into view. With focus (the edit page; Book
// now, finish later, 2026-11-10), a text field it lands on takes the focus,
// and whatever it lands on is marked for a moment (data-landed) so the eye
// finds it.
export function landOn(id: string, { block = "start", focus = false }: { block?: ScrollLogicalPosition; focus?: boolean } = {}) {
  const element = document.getElementById(id);
  if (!element) return;
  element.scrollIntoView({ block });
  if (!focus) return;
  if (
    (element instanceof HTMLInputElement && element.type !== "hidden" && !element.disabled) ||
    element instanceof HTMLTextAreaElement
  ) {
    element.focus({ preventScroll: true });
  }
  element.setAttribute("data-landed", "");
  window.setTimeout(() => element.removeAttribute("data-landed"), LANDED_MS);
}

// A link to a card on a page (the Meetings page's flags link to #mockup and
// #track-colour on a lead) lands on that card, even when the page streams in
// after its loading screen, when the router's own jump finds nothing yet.
// The edit page lands on the field itself, mid-screen, with the focus: each
// item still to finish jumps straight to its field.
export function ScrollToHash({ block = "start", focus = false }: { block?: ScrollLogicalPosition; focus?: boolean } = {}) {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) landOn(id, { block, focus });
  }, [block, focus]);
  return null;
}
