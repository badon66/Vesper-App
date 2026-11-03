import type { PhotoSlot } from "@/lib/leads/door";
import { cn } from "@/lib/utils";

// The guided photos' example pictures (round 2, Keenan, 2026-11-03): a
// plain line drawing per slot showing the angle to shoot, in the text
// colour so it reads in both themes. The roofline, where the lights go, is
// drawn heavier. Decorative: each slot's label and hint say it in words.

const HOUSE_CORNER = (
  <>
    {/* the near corner, the front wall to the right, the side wall to the left */}
    <path d="M46 34 L46 66 M46 66 L100 63 L100 38 M46 66 L16 61 L16 39" />
    {/* windows and the door on the front wall */}
    <path d="M56 45 L68 45.8 L68 54 L56 53.4 Z M78 46.5 L90 47.2 L90 55 L78 54.4 Z M24 46 L33 44.6 L33 52 L24 53.2 Z" />
    {/* the roof: the front plane up to the ridge, the side gable */}
    <path d="M85 22 L31 18" />
    <path className="guide-roofline" d="M16 39 L31 18 L46 34 L100 38 L85 22" />
  </>
);

const DRAWINGS: Partial<Record<PhotoSlot, React.ReactNode>> = {
  front: (
    <>
      <path d="M24 38 L24 66 L96 66 L96 38" />
      <path d="M54 66 L54 49 L66 49 L66 66 M31 45 L45 45 L45 55 L31 55 Z M75 45 L89 45 L89 55 L75 55 Z" />
      <path className="guide-roofline" d="M14 39 L60 12 L106 39 Z" />
    </>
  ),
  left_corner: HOUSE_CORNER,
  right_corner: <g transform="translate(120 0) scale(-1 1)">{HOUSE_CORNER}</g>,
  soffit: (
    <>
      {/* the wall, the soffit under the eave, the fascia and the roof edge */}
      <path d="M30 34 L30 70" />
      <path d="M12 14 L102 27" />
      <path className="guide-roofline" d="M30 34 L102 34 L102 27" />
      {/* the track under the soffit, near the edge */}
      <path d="M84 34 L84 38 L98 38 L98 34" />
      {/* frame it close */}
      <rect x="58" y="20" width="54" height="26" rx="2" strokeDasharray="3 3" />
    </>
  ),
};

export function PhotoGuide({ slot, className }: { slot: PhotoSlot; className?: string }) {
  if (!DRAWINGS[slot]) return null;
  return (
    <svg
      viewBox="0 0 120 75"
      aria-hidden="true"
      focusable="false"
      data-guide={slot}
      className={cn(
        "fill-none stroke-current text-muted-foreground [&_.guide-roofline]:stroke-foreground [&_.guide-roofline]:[stroke-width:2.5]",
        className,
      )}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {DRAWINGS[slot]}
    </svg>
  );
}
