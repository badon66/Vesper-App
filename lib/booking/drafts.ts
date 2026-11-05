import { emptyDraft, SCREENS, withDraftDefaults, type SheetDraft, type SheetScreen } from "@/lib/booking/sheet";

// Unfinished bookings (round 2, Keenan, 2026-11-03): leaving the sheet keeps
// what was entered on that phone, under the setter's own key, and Home lists
// them. Each reopens where it was left and asks for a time. They're wiped
// after 24 hours, and once that person is booked. Kept pure so it is unit
// tested; the screens do the storage.

export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_DRAFTS = 10;

export const sheetDraftsKey = (userId: string) => `vesper:sheet-drafts:${userId}`;

export type SheetDraftRecord = {
  id: string;
  savedAt: number;
  screen: SheetScreen;
  draft: SheetDraft;
};

// A saved lead keeps one draft; a person not saved yet gets the sheet's own id.
export function draftIdFor(draft: SheetDraft, sheetId: string): string {
  return draft.leadId ? `lead:${draft.leadId}` : `new:${sheetId}`;
}

export function draftName(draft: SheetDraft): string {
  const name = [draft.first_name.trim(), draft.last_name.trim()].filter(Boolean).join(" ");
  return name || "New person";
}

// Worth keeping: anything typed or answered beyond the empty sheet.
export function draftHasContent(draft: SheetDraft): boolean {
  const blank = emptyDraft();
  return (Object.keys(blank) as (keyof SheetDraft)[]).some((key) => {
    // The city starts filled in, and a save key isn't something entered.
    if (key === "city" || key === "saveKey" || key === "extras") return false;
    return JSON.stringify(draft[key]) !== JSON.stringify(blank[key]);
  });
}

function isRecord(value: unknown): value is SheetDraftRecord {
  const record = value as SheetDraftRecord | null;
  return (
    typeof record?.id === "string" &&
    typeof record.savedAt === "number" &&
    SCREENS.includes(record.screen) &&
    typeof record.draft === "object" &&
    record.draft !== null &&
    typeof record.draft.first_name === "string"
  );
}

// The drafts still worth showing: well formed, under 24 hours old, newest first.
export function readDrafts(raw: string | null, now: number): SheetDraftRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isRecord)
      .filter((record) => now - record.savedAt < DRAFT_TTL_MS && record.savedAt <= now + 60_000)
      .map((record) => ({ ...record, draft: withDraftDefaults(record.draft) }))
      .sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export function upsertDraft(list: SheetDraftRecord[], record: SheetDraftRecord): SheetDraftRecord[] {
  const others = list.filter(
    (item) => item.id !== record.id && !(record.draft.leadId && item.draft.leadId === record.draft.leadId),
  );
  return [record, ...others].slice(0, MAX_DRAFTS);
}

export function removeDraft(list: SheetDraftRecord[], id: string): SheetDraftRecord[] {
  return list.filter((item) => item.id !== id);
}

export function removeDraftsForLead(list: SheetDraftRecord[], leadId: string): SheetDraftRecord[] {
  return list.filter((item) => item.draft.leadId !== leadId);
}

// "12 minutes ago", "3 hours ago".
export function draftAge(savedAt: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - savedAt) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}
