import { describe, expect, it } from "vitest";
import {
  DRAFT_TTL_MS,
  draftAge,
  draftHasContent,
  draftIdFor,
  draftName,
  readDrafts,
  removeDraft,
  removeDraftsForLead,
  sheetDraftsKey,
  upsertDraft,
  type SheetDraftRecord,
} from "@/lib/booking/drafts";
import { emptyDraft } from "@/lib/booking/sheet";

// Unfinished bookings (round 2): kept on the phone under the setter's own
// key, newest first, wiped after 24 hours and once the person is booked.

const now = Date.parse("2026-11-14T02:00:00Z");

function record(id: string, minutesAgo: number, patch: Partial<SheetDraftRecord["draft"]> = {}): SheetDraftRecord {
  return { id, savedAt: now - minutesAgo * 60_000, screen: "learned", draft: { ...emptyDraft(), first_name: "Sarah", ...patch } };
}

describe("Unfinished bookings", () => {
  it("live under each setter's own key", () => {
    expect(sheetDraftsKey("a")).not.toBe(sheetDraftsKey("b"));
  });

  it("keep only what was entered, under one id per person", () => {
    expect(draftHasContent(emptyDraft())).toBe(false);
    expect(draftHasContent({ ...emptyDraft(), city: "Airdrie" })).toBe(false);
    expect(draftHasContent({ ...emptyDraft(), first_name: "S" })).toBe(true);
    expect(draftHasContent({ ...emptyDraft(), not_collected: ["phone"] })).toBe(true);
    // A save key (2026-11-04) isn't something entered, nor is a draft from
    // before it that has none.
    expect(draftHasContent({ ...emptyDraft(), saveKey: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b" })).toBe(false);
    const { saveKey: _none, ...older } = emptyDraft();
    void _none;
    expect(draftHasContent(older as ReturnType<typeof emptyDraft>)).toBe(false);
    expect(draftIdFor(emptyDraft(), "sheet-1")).toBe("new:sheet-1");
    expect(draftIdFor({ ...emptyDraft(), leadId: "L1" }, "sheet-1")).toBe("lead:L1");
    expect(draftName({ ...emptyDraft(), first_name: " Sarah ", last_name: "Chen" })).toBe("Sarah Chen");
    expect(draftName(emptyDraft())).toBe("New person");
  });

  it("read back newest first, dropping anything over 24 hours old or malformed", () => {
    const raw = JSON.stringify([
      record("new:old", 24 * 60 + 1),
      record("new:a", 30),
      { id: "broken" },
      record("new:b", 5),
      { ...record("new:c", 10), screen: "find1" },
    ]);
    expect(readDrafts(raw, now).map((item) => item.id)).toEqual(["new:b", "new:a"]);
    expect(readDrafts("not json", now)).toEqual([]);
    expect(readDrafts(null, now)).toEqual([]);
    expect(DRAFT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("fill in fields a draft from an older version didn't have", () => {
    const old = { id: "new:x", savedAt: now, screen: "who", draft: { first_name: "Sarah" } };
    const [read] = readDrafts(JSON.stringify([old]), now);
    expect(read.draft.not_collected).toEqual([]);
    expect(read.draft.everyone).toBeNull();
  });

  it("replace the same person's draft, and drop it once they're booked", () => {
    let list = upsertDraft([], record("new:a", 30));
    list = upsertDraft(list, record("new:b", 0));
    list = upsertDraft(list, record("new:a", 0, { last_name: "Chen" }));
    expect(list.map((item) => item.id)).toEqual(["new:a", "new:b"]);
    expect(list[0].draft.last_name).toBe("Chen");
    list = upsertDraft(list, record("lead:L1", 0, { leadId: "L1" }));
    expect(removeDraftsForLead(list, "L1").map((item) => item.id)).toEqual(["new:a", "new:b"]);
    expect(removeDraft(list, "new:b").map((item) => item.id)).toEqual(["lead:L1", "new:a"]);
  });

  it("say how long ago they were left", () => {
    expect(draftAge(now - 20_000, now)).toBe("just now");
    expect(draftAge(now - 60_000, now)).toBe("1 minute ago");
    expect(draftAge(now - 12 * 60_000, now)).toBe("12 minutes ago");
    expect(draftAge(now - 3 * 3600_000, now)).toBe("3 hours ago");
  });
});
