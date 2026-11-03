import { describe, expect, it } from "vitest";
import { platformOf, WELCOME_STEPS, welcomeHref, welcomeStep } from "@/lib/welcome";

// A setter's first sign-in (Keenan, 2026-11-03): three steps that get the
// phone ready, then how a door goes.

describe("the welcome's steps", () => {
  it("has the three phone steps, then the tour", () => {
    expect(WELCOME_STEPS.map((step) => step.label)).toEqual(["Home screen", "Location", "Notifications", "How a door goes"]);
  });

  it("reads the step from the address, starting at the first for anything else", () => {
    expect(welcomeStep("2")).toBe(2);
    expect(welcomeStep("4")).toBe(4);
    expect(welcomeStep(["3", "1"])).toBe(3);
    for (const value of [undefined, "", "0", "5", "1.5", "two", "-1"]) expect(welcomeStep(value)).toBe(1);
  });

  it("links each step", () => {
    expect(welcomeHref(1)).toBe("/app/welcome");
    expect(welcomeHref(3)).toBe("/app/welcome?step=3");
  });
});

describe("which phone's steps to show", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
  const iphoneChrome = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1";
  const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
  const android = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0 Mobile Safari/537.36";
  const mac = ipad;

  it("tells an iPhone in Safari, an iPhone in another browser, an iPad, Android and a computer apart", () => {
    expect(platformOf(iphone, 5)).toBe("iphone");
    expect(platformOf(iphoneChrome, 5)).toBe("iphone-other-browser");
    expect(platformOf(ipad, 5)).toBe("iphone");
    expect(platformOf(android, 5)).toBe("android");
    expect(platformOf(mac, 0)).toBe("computer");
  });
});
