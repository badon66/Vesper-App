import { cn } from "@/lib/utils";

// The real Vesper Lighting logo (Keenan, 2026-11-11), in place of the text
// wordmark everywhere it showed. The originals are in brand/; web sizes in
// public/brand/ (1200 px wide, trimmed to the artwork). Two versions:
//   light  the white letters with the gold star, for navy and dark grounds
//          (the customer's navy band, a dark screen);
//   dark   the navy letters with the gold star, for white grounds;
//   theme  follows the app's theme: navy by day, white at night. The quote
//          page is always white, so inside it "theme" stays navy.
// The height is set by the caller (h-8, h-32 and so on); the width follows.
const SIZE = { light: { width: 1200, height: 411 }, dark: { width: 1200, height: 409 } } as const;

export function Logo({
  tone = "theme",
  className,
  alt = "Vesper Lighting",
}: {
  tone?: "light" | "dark" | "theme";
  className?: string;
  alt?: string;
}) {
  const image = (which: "light" | "dark", extra?: string, label = alt) => (
    // eslint-disable-next-line @next/next/no-img-element -- a small static logo, the same file on every page
    <img
      src={which === "light" ? "/brand/vesper-logo-white.png" : "/brand/vesper-logo-navy.png"}
      width={SIZE[which].width}
      height={SIZE[which].height}
      alt={label}
      draggable={false}
      decoding="async"
      className={cn("block w-auto max-w-none select-none", className, extra)}
      data-testid="vesper-logo"
      data-tone={which}
    />
  );
  if (tone !== "theme") return image(tone);
  // Both versions in the page; the theme shows one. The hidden one is out
  // of the accessibility tree, so the name is read once.
  return (
    <>
      {image("dark", "dark:hidden")}
      {image("light", "hidden dark:block")}
    </>
  );
}
