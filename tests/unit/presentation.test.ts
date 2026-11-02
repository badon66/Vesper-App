import { describe, expect, it } from "vitest";
import {
  PRESENTATION_KINDS,
  mergePresentationText,
  pageHasContent,
  parsePresentation,
  withPresentationImage,
  withPresentationImageMoved,
  withoutPresentationImage,
  type PresentationPage,
} from "@/lib/presentation";

const page = (pages: PresentationPage[], kind: PresentationPage["kind"]) => pages.find((item) => item.kind === kind)!;

describe("reading the stored presentation", () => {
  it("always gives the six pages once, in order, whatever is stored", () => {
    const pages = parsePresentation([
      { kind: "gallery", title: "Our installs", body: "", image_paths: ["a.jpg"] },
      { kind: "nonsense", title: "Ignored" },
      "not an object",
      { kind: "what_vesper_is", title: 7, body: null },
    ]);
    expect(pages.map((item) => item.kind)).toEqual([...PRESENTATION_KINDS]);
    expect(page(pages, "gallery").image_paths).toEqual(["a.jpg"]);
    expect(page(pages, "what_vesper_is").title).toBe("What Vesper is");
    expect(page(pages, "what_vesper_is").body).toBe("");
  });

  it("survives a value that is not a list at all", () => {
    expect(parsePresentation(null).map((item) => item.kind)).toEqual([...PRESENTATION_KINDS]);
    expect(parsePresentation({ kind: "gallery" }).every((item) => item.image_paths.length === 0)).toBe(true);
  });

  it("keeps an empty day slot, so the night photo stays the night photo", () => {
    const pages = parsePresentation([{ kind: "hidden_by_day", title: "Hidden by day", body: "", image_paths: ["", "night.jpg"] }]);
    expect(page(pages, "hidden_by_day").image_paths).toEqual(["", "night.jpg"]);
  });
});

describe("which pages show", () => {
  const blank = parsePresentation([]);

  it("a text page needs words; the warranty page needs the warranty text", () => {
    expect(pageHasContent(page(blank, "what_vesper_is"), "")).toBe(false);
    expect(pageHasContent({ ...page(blank, "what_vesper_is"), body: "  \n " }, "")).toBe(false);
    expect(pageHasContent({ ...page(blank, "what_vesper_is"), body: "Track under the soffit." }, "")).toBe(true);
    expect(pageHasContent(page(blank, "warranty"), "")).toBe(false);
    expect(pageHasContent(page(blank, "warranty"), "10 years parts.")).toBe(true);
  });

  it("Hidden by day needs both photos; the gallery needs one", () => {
    const pair = page(blank, "hidden_by_day");
    expect(pageHasContent({ ...pair, image_paths: ["day.jpg"] }, "")).toBe(false);
    expect(pageHasContent({ ...pair, image_paths: ["", "night.jpg"] }, "")).toBe(false);
    expect(pageHasContent({ ...pair, image_paths: ["day.jpg", "night.jpg"] }, "")).toBe(true);
    expect(pageHasContent({ ...page(blank, "gallery"), image_paths: [""] }, "")).toBe(false);
    expect(pageHasContent({ ...page(blank, "gallery"), image_paths: ["a.jpg"] }, "")).toBe(true);
  });
});

describe("editing the presentation", () => {
  it("a text save changes words and keeps the photos", () => {
    const stored = [{ kind: "hidden_by_day", title: "Old", body: "Old words", image_paths: ["day.jpg", "night.jpg"] }];
    const pages = mergePresentationText(stored, [{ kind: "hidden_by_day", title: "New", body: "New words" }]);
    expect(page(pages, "hidden_by_day")).toEqual({
      kind: "hidden_by_day",
      title: "New",
      body: "New words",
      image_paths: ["day.jpg", "night.jpg"],
    });
  });

  it("the night photo can go up before the day photo, each in its own slot", () => {
    const night = withPresentationImage([], "hidden_by_day", "night.jpg", 1);
    expect(page(night, "hidden_by_day").image_paths).toEqual(["", "night.jpg"]);
    const both = withPresentationImage(night, "hidden_by_day", "day.jpg", 0);
    expect(page(both, "hidden_by_day").image_paths).toEqual(["day.jpg", "night.jpg"]);
    const replaced = withPresentationImage(both, "hidden_by_day", "day-2.jpg", 0);
    expect(page(replaced, "hidden_by_day").image_paths).toEqual(["day-2.jpg", "night.jpg"]);
  });

  it("gallery photos append in order, up to the limit; text pages take no photos", () => {
    let pages = withPresentationImage([], "gallery", "1.jpg", null);
    pages = withPresentationImage(pages, "gallery", "2.jpg", null);
    expect(page(pages, "gallery").image_paths).toEqual(["1.jpg", "2.jpg"]);
    for (let at = 3; at <= 30; at++) pages = withPresentationImage(pages, "gallery", `${at}.jpg`, null);
    expect(page(pages, "gallery").image_paths).toHaveLength(24);
    expect(page(withPresentationImage([], "warranty", "x.jpg", null), "warranty").image_paths).toEqual([]);
  });

  it("removing the day photo leaves the night photo in its slot; removing from the gallery closes the gap", () => {
    const pair = [{ kind: "hidden_by_day", title: "t", body: "", image_paths: ["day.jpg", "night.jpg"] }];
    expect(page(withoutPresentationImage(pair, "hidden_by_day", "day.jpg"), "hidden_by_day").image_paths).toEqual(["", "night.jpg"]);
    const gallery = [{ kind: "gallery", title: "t", body: "", image_paths: ["1.jpg", "2.jpg", "3.jpg"] }];
    expect(page(withoutPresentationImage(gallery, "gallery", "2.jpg"), "gallery").image_paths).toEqual(["1.jpg", "3.jpg"]);
  });

  it("a gallery photo moves one place at a time and never past either end", () => {
    const gallery = [{ kind: "gallery", title: "t", body: "", image_paths: ["1.jpg", "2.jpg", "3.jpg"] }];
    expect(page(withPresentationImageMoved(gallery, "gallery", "3.jpg", -1), "gallery").image_paths).toEqual(["1.jpg", "3.jpg", "2.jpg"]);
    expect(page(withPresentationImageMoved(gallery, "gallery", "1.jpg", 1), "gallery").image_paths).toEqual(["2.jpg", "1.jpg", "3.jpg"]);
    expect(page(withPresentationImageMoved(gallery, "gallery", "1.jpg", -1), "gallery").image_paths).toEqual(["1.jpg", "2.jpg", "3.jpg"]);
    expect(page(withPresentationImageMoved(gallery, "gallery", "3.jpg", 1), "gallery").image_paths).toEqual(["1.jpg", "2.jpg", "3.jpg"]);
    expect(page(withPresentationImageMoved(gallery, "gallery", "missing.jpg", 1), "gallery").image_paths).toEqual(["1.jpg", "2.jpg", "3.jpg"]);
  });

  it("the day and night slots never move", () => {
    const pair = [{ kind: "hidden_by_day", title: "t", body: "", image_paths: ["day.jpg", "night.jpg"] }];
    expect(page(withPresentationImageMoved(pair, "hidden_by_day", "day.jpg", 1), "hidden_by_day").image_paths).toEqual([
      "day.jpg",
      "night.jpg",
    ]);
  });
});
