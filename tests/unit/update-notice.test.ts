import { describe, expect, it } from "vitest";
import { liveBuildFrom, newerBuildLive, noticeAllowed, UPDATE_WORDS } from "@/lib/update-notice";

describe("the update notice", () => {
  it("says it only when a different build is live, and never on an unknown", () => {
    expect(newerBuildLive("abc123", "def456")).toBe(true);
    expect(newerBuildLive("abc123", "abc123")).toBe(false);
    expect(newerBuildLive("abc123", null)).toBe(false);
    expect(newerBuildLive(null, "def456")).toBe(false);
    expect(newerBuildLive("", "def456")).toBe(false);
    expect(newerBuildLive(" abc123 ", "abc123")).toBe(false);
  });

  it("reads the live build from the answer, or nothing", () => {
    expect(liveBuildFrom({ build: "def456" })).toBe("def456");
    expect(liveBuildFrom({ build: " " })).toBeNull();
    expect(liveBuildFrom({ build: 5 })).toBeNull();
    expect(liveBuildFrom(null)).toBeNull();
  });

  it("never interrupts a booking or a meeting", () => {
    expect(noticeAllowed({ path: "/app", sheetOpen: false })).toBe(true);
    expect(noticeAllowed({ path: "/app/leads", sheetOpen: true })).toBe(false);
    expect(noticeAllowed({ path: "/meeting/abc", sheetOpen: false })).toBe(false);
  });

  it("uses Keenan's words", () => {
    expect(UPDATE_WORDS).toBe("Vesper updated. Reopen to get the latest.");
  });
});
