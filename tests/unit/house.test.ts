import { describe, expect, it } from "vitest";
import { houseDescription, segmentFor, segmentsFor, segmentStates } from "@/lib/quote-link/house";
import type { QuoteRun } from "@/lib/pricing";

// The quote link's house diagram (2026-11-04): where each run is drawn,
// and how each drawn part looks for the runs switched on.

const run = (name: string, level: "lower" | "upper", feet = 20, part?: QuoteRun["part"]): QuoteRun => ({ name, feet, level, part });

describe("where a run is drawn", () => {
  it("puts eaves, gables and sides on the roof their level names", () => {
    expect(segmentFor(run("Front", "lower"))).toBe("lower-eave");
    expect(segmentFor(run("Upper Front Eave", "upper"))).toBe("upper-eave");
    expect(segmentFor(run("Garage Gable", "lower"))).toBe("garage-gable");
    expect(segmentFor(run("Two Upper Gables", "upper"))).toBe("upper-gable");
    expect(segmentFor(run("Left side", "lower"))).toBe("lower-sides");
    expect(segmentFor(run("Sides", "upper"))).toBe("upper-sides");
  });

  it("lights both sides for a sides run named for both floors", () => {
    expect(segmentsFor(run("Upper & Lower Sides", "lower"))).toEqual(["lower-sides", "upper-sides"]);
    expect(segmentsFor(run("Lower sides", "lower"))).toEqual(["lower-sides"]);
    expect(segmentsFor(run("Shed", "lower"))).toEqual([]);
  });

  it("draws a garage line and a porch in one place whatever the level, and doesn't draw other", () => {
    expect(segmentFor(run("Garage Eave", "lower"))).toBe("garage");
    expect(segmentFor(run("Garage", "upper"))).toBe("garage");
    expect(segmentFor(run("Porch", "upper"))).toBe("porch");
    expect(segmentFor(run("Shed", "lower"))).toBeNull();
    expect(segmentFor(run("Front", "lower", 20, "porch"))).toBe("porch");
  });
});

describe("how each part looks", () => {
  const todd = [
    run("Garage Gable", "lower", 34),
    run("Garage Eave", "lower", 30),
    run("Lower Porch Eave", "lower", 13),
    run("Upper Front Eave", "upper", 32),
    run("Two Upper Gables", "upper", 30),
    run("Upper & Lower Sides", "lower", 26),
  ];

  it("lights every part in the quote, and leaves the rest as the outline", () => {
    const states = segmentStates(todd.map((r) => ({ run: r, on: true })));
    expect(states).toEqual({
      "garage-gable": "on",
      garage: "on",
      "lower-eave": "none",
      porch: "on",
      "upper-eave": "on",
      "upper-gable": "on",
      "lower-sides": "on",
      "upper-sides": "on",
    });
  });

  it("dashes a part only when every run drawn there is off", () => {
    const states = segmentStates(todd.map((r) => ({ run: r, on: r.level === "lower" })));
    expect([states["upper-eave"], states["upper-gable"], states.porch]).toEqual(["off", "off", "on"]);
    const both = segmentStates([
      { run: run("Front", "lower"), on: false },
      { run: run("Back", "lower"), on: true },
    ]);
    expect(both["lower-eave"]).toBe("on");
  });

  it("ignores runs with no feet", () => {
    expect(segmentStates([{ run: run("Porch", "lower", 0), on: true }]).porch).toBe("none");
  });

  it("says in words what is lit and what is switched off", () => {
    const states = segmentStates(todd.map((r) => ({ run: r, on: r.level === "lower" })));
    expect(houseDescription(states)).toBe(
      "A drawing of a two-storey house with lights on the garage gable, the garage line, the porch, the main floor sides and the upper sides. Switched off: the upper eave and the upper gable.",
    );
    expect(houseDescription(segmentStates([]))).toBe("A drawing of a two-storey house.");
  });
});
