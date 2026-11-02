// The presentation (M5): six pages in settings.presentation, each with a
// kind the iPad renders by. This module is the one reader and writer of
// that jsonb's shape, shared by meeting mode, Settings and the actions.

import type { Json } from "@/types/database";

export const PRESENTATION_KINDS = [
  "what_vesper_is",
  "hidden_by_day",
  "whites_first",
  "install_day",
  "warranty",
  "gallery",
] as const;
export type PresentationKind = (typeof PRESENTATION_KINDS)[number];

export type PresentationPage = {
  kind: PresentationKind;
  title: string;
  body: string;
  image_paths: string[];
};

// Which pages carry images, and how many.
export const PAGE_IMAGE_SLOTS: Partial<Record<PresentationKind, { slots: string[] | null; max: number }>> = {
  // image_paths[0] is the day photo, [1] the night photo.
  hidden_by_day: { slots: ["Day photo", "Night photo"], max: 2 },
  gallery: { slots: null, max: 24 },
};

export const PAGE_LABELS: Record<PresentationKind, string> = {
  what_vesper_is: "What Vesper is",
  hidden_by_day: "Hidden by day",
  whites_first: "The whites first",
  install_day: "How install day works",
  warranty: "The warranty",
  gallery: "Gallery",
};

// The jsonb as stored, made safe: every kind present once, in order, with
// strings where strings belong. Unknown entries are ignored.
export function parsePresentation(value: Json): PresentationPage[] {
  const raw = Array.isArray(value) ? value : [];
  const byKind = new Map<string, { title?: unknown; body?: unknown; image_paths?: unknown }>();
  for (const entry of raw) {
    if (entry && typeof entry === "object" && !Array.isArray(entry) && typeof entry.kind === "string") {
      byKind.set(entry.kind, entry as { title?: unknown; body?: unknown; image_paths?: unknown });
    }
  }
  return PRESENTATION_KINDS.map((kind) => {
    const entry = byKind.get(kind) ?? {};
    const images = Array.isArray(entry.image_paths) ? entry.image_paths : [];
    return {
      kind,
      title: typeof entry.title === "string" ? entry.title : PAGE_LABELS[kind],
      body: typeof entry.body === "string" ? entry.body : "",
      // Empty strings stay: hidden_by_day keeps day at 0 and night at 1
      // even when only one is uploaded.
      image_paths: images.filter((path): path is string => typeof path === "string"),
    };
  });
}

// Whether a page has enough to be shown. A page with no content is
// skipped on the iPad, never shown empty (Keenan, 2026-11-02).
export function pageHasContent(page: PresentationPage, warrantyText: string): boolean {
  switch (page.kind) {
    case "hidden_by_day":
      return Boolean(page.image_paths[0]) && Boolean(page.image_paths[1]);
    case "gallery":
      return page.image_paths.some(Boolean);
    case "warranty":
      return warrantyText.trim() !== "";
    default:
      return page.body.trim() !== "";
  }
}

// The Settings save: new titles and bodies over the stored image paths.
export function mergePresentationText(
  current: Json,
  pages: { kind: PresentationKind; title: string; body: string }[],
): PresentationPage[] {
  const stored = parsePresentation(current);
  return stored.map((page) => {
    const edit = pages.find((item) => item.kind === page.kind);
    return edit ? { ...page, title: edit.title, body: edit.body } : page;
  });
}

// An upload: into a fixed slot (day or night), or appended (the gallery).
export function withPresentationImage(
  current: Json,
  kind: PresentationKind,
  path: string,
  slotIndex: number | null,
): PresentationPage[] {
  return parsePresentation(current).map((page) => {
    if (page.kind !== kind) return page;
    const config = PAGE_IMAGE_SLOTS[kind];
    if (!config) return page;
    const images = [...page.image_paths];
    if (slotIndex === null) {
      if (images.length >= config.max) return page;
      images.push(path);
    } else {
      while (images.length <= slotIndex) images.push("");
      images[slotIndex] = path;
    }
    return { ...page, image_paths: images };
  });
}

export function withoutPresentationImage(current: Json, kind: PresentationKind, path: string): PresentationPage[] {
  return parsePresentation(current).map((page) => {
    if (page.kind !== kind) return page;
    const images =
      kind === "hidden_by_day"
        ? page.image_paths.map((item) => (item === path ? "" : item))
        : page.image_paths.filter((item) => item !== path && item !== "");
    return { ...page, image_paths: images };
  });
}
