import { describe, expect, it } from "vitest";
import { currentTab, hidesBottomBar, tabsFor } from "@/lib/nav";

describe("tabsFor", () => {
  it("gives the owner Home, New lead, Leads and Admin, with no Dashboard", () => {
    expect(tabsFor("owner").map((tab) => tab.label)).toEqual(["Home", "New lead", "Leads", "Admin"]);
  });

  it("gives a setter Home, New lead and Leads", () => {
    expect(tabsFor("sales").map((tab) => tab.label)).toEqual(["Home", "New lead", "Leads"]);
  });

  it("leaves Schedule and My pay out until M3, and gives crew nothing yet", () => {
    const labels = [...tabsFor("owner"), ...tabsFor("sales")].map((tab) => tab.label);
    expect(labels).not.toContain("Schedule");
    expect(labels).not.toContain("My pay");
    expect(labels).not.toContain("Dashboard");
    expect(tabsFor("crew")).toEqual([]);
  });

  it("makes New lead the prominent button", () => {
    expect(tabsFor("sales").filter((tab) => tab.prominent).map((tab) => tab.label)).toEqual(["New lead"]);
  });
});

describe("currentTab", () => {
  const owner = tabsFor("owner");
  it("matches each screen to its tab", () => {
    expect(currentTab("/app", owner)).toBe("/app");
    expect(currentTab("/app/leads", owner)).toBe("/app/leads");
    expect(currentTab("/app/leads/0b6f6f0e-2c1a-4e8b-9a7d-5c3e2f1a0b9c", owner)).toBe("/app/leads");
    expect(currentTab("/app/leads/new", owner)).toBe("/app/leads/new");
    expect(currentTab("/app/admin/people", owner)).toBe("/app/admin");
  });

  it("marks nothing for a screen outside the tabs", () => {
    expect(currentTab("/app/admin", tabsFor("sales"))).toBeNull();
    expect(currentTab("/app/leadsx", owner)).toBeNull();
  });
});

describe("hidesBottomBar", () => {
  it("steps aside only on the lead form, which has its own Save bar", () => {
    expect(hidesBottomBar("/app/leads/new")).toBe(true);
    expect(hidesBottomBar("/app/leads/0b6f6f0e-2c1a-4e8b-9a7d-5c3e2f1a0b9c/edit")).toBe(true);
    expect(hidesBottomBar("/app/leads")).toBe(false);
    expect(hidesBottomBar("/app")).toBe(false);
  });
});
