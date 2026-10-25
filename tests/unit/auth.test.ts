import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth";

describe("safeNextPath", () => {
  it("keeps an in-app path", () => {
    expect(safeNextPath("/app/leads?x=1")).toBe("/app/leads?x=1");
  });

  it("falls back to /app when nothing was asked for", () => {
    expect(safeNextPath(undefined)).toBe("/app");
    expect(safeNextPath(null)).toBe("/app");
    expect(safeNextPath("")).toBe("/app");
  });

  it("refuses anything that could leave the site", () => {
    expect(safeNextPath("https://evil.example")).toBe("/app");
    expect(safeNextPath("//evil.example")).toBe("/app");
    expect(safeNextPath("/\\evil.example")).toBe("/app");
    expect(safeNextPath("app")).toBe("/app");
  });
});
