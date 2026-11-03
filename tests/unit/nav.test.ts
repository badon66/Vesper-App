import { describe, expect, it } from "vitest";
import { currentTab, hidesBottomBar, inAdmin, showsAdminGear, tabsFor } from "@/lib/nav";

describe("tabsFor", () => {
  it("gives the owner Home, Schedule, Meetings, New lead and Leads, with no Dashboard", () => {
    expect(tabsFor("owner").map((tab) => tab.label)).toEqual(["Home", "Schedule", "Meetings", "New lead", "Leads"]);
  });

  it("puts the owner's Admin in a header gear, never in the tabs", () => {
    expect(tabsFor("owner").map((tab) => tab.label)).not.toContain("Admin");
    expect(showsAdminGear("owner")).toBe(true);
    expect(showsAdminGear("sales")).toBe(false);
    expect(showsAdminGear("crew")).toBe(false);
    expect(inAdmin("/app/admin")).toBe(true);
    expect(inAdmin("/app/admin/settings")).toBe(true);
    expect(inAdmin("/app/administer")).toBe(false);
  });

  it("keeps Meetings from setters", () => {
    expect(tabsFor("sales").map((tab) => tab.label)).not.toContain("Meetings");
  });

  it("gives a setter Home, Schedule, New lead, Leads and My pay", () => {
    expect(tabsFor("sales").map((tab) => tab.label)).toEqual(["Home", "Schedule", "New lead", "Leads", "My pay"]);
  });

  it("keeps My pay for setters, and gives crew nothing yet", () => {
    expect(tabsFor("owner").map((tab) => tab.label)).not.toContain("My pay");
    expect(tabsFor("sales").map((tab) => tab.label)).not.toContain("Admin");
    expect([...tabsFor("owner"), ...tabsFor("sales")].map((tab) => tab.label)).not.toContain("Dashboard");
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
    expect(currentTab("/app/admin/people", owner)).toBeNull();
    expect(currentTab("/app/meetings", owner)).toBe("/app/meetings");
    expect(currentTab("/app/schedule", owner)).toBe("/app/schedule");
    expect(currentTab("/app/schedule/book", owner)).toBe("/app/schedule");
    expect(currentTab("/app/pay", tabsFor("sales"))).toBe("/app/pay");
  });

  it("marks nothing for a screen outside the tabs", () => {
    expect(currentTab("/app/admin", tabsFor("sales"))).toBeNull();
    expect(currentTab("/app/leadsx", owner)).toBeNull();
  });
});

describe("hidesBottomBar", () => {
  it("steps aside only on the lead form and the welcome, which have their own bars", () => {
    expect(hidesBottomBar("/app/leads/new")).toBe(true);
    expect(hidesBottomBar("/app/welcome")).toBe(true);
    expect(hidesBottomBar("/app/notifications")).toBe(false);
    expect(hidesBottomBar("/app/leads/0b6f6f0e-2c1a-4e8b-9a7d-5c3e2f1a0b9c/edit")).toBe(true);
    expect(hidesBottomBar("/app/leads")).toBe(false);
    expect(hidesBottomBar("/app")).toBe(false);
  });
});
