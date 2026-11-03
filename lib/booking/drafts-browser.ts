import { readDrafts, sheetDraftsKey, type SheetDraftRecord } from "@/lib/booking/drafts";

// Unfinished bookings in this phone's storage (round 2). The sheet writes
// them and Home lists them; a change in one tells the other at once. Storage
// can be off (private mode) or full: the sheet still works, it just can't
// keep a draft.

export const DRAFTS_EVENT = "vesper:sheet-drafts";

export function rawDrafts(userId: string): string | null {
  try {
    return window.localStorage.getItem(sheetDraftsKey(userId));
  } catch {
    return null;
  }
}

export function loadDrafts(userId: string): SheetDraftRecord[] {
  return readDrafts(rawDrafts(userId), Date.now());
}

export function saveDrafts(userId: string, list: SheetDraftRecord[]) {
  try {
    const key = sheetDraftsKey(userId);
    if (list.length === 0) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new Event(DRAFTS_EVENT));
  } catch {
    // Storage off or full: nothing kept.
  }
}

export function subscribeDrafts(onChange: () => void): () => void {
  window.addEventListener(DRAFTS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DRAFTS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}
