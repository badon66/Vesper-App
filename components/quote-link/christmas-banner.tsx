import type { ChristmasBanner as Banner } from "@/lib/quote-link/christmas";

// The Christmas banner at the very top of the customer's link (round 17,
// Keenan, 2026-11-12): a pine green band, full width on every screen, with a
// string of small lights along its top edge in red, green and warm white
// that twinkle slowly (still with reduce motion on). Before their book-by
// date it gives the date for their own track colour, one line about that
// track and how many days are left, the count in deep red; after it, until
// the season ends, Keenan's line that promises nothing. Keenan asked for the
// red and green here; everything else on the page stays navy and gold.

const PINE = "#1d4734";
const WIRE = "#0e2a1e";
const DEEP_RED = "#9e2a2f";
const BULBS = ["#e5484d", "#4fb37f", "#ffe1a1"];
// Enough bulbs for the widest screen; the string is clipped at its end.
const BULB_COUNT = 96;

export function ChristmasBanner({ banner }: { banner: Banner }) {
  return (
    <section
      aria-label="Christmas"
      className="relative overflow-hidden text-white"
      style={{ backgroundColor: PINE }}
      data-testid="quote-christmas"
      data-state={banner.state}
    >
      <LightString />
      <div className="mx-auto max-w-xl px-5 pt-8 pb-5 lg:max-w-6xl lg:px-11 lg:pt-9 lg:pb-6 2xl:max-w-7xl">
        {banner.state === "before" ? (
          <>
            <p className="text-xl leading-snug font-bold text-balance lg:text-2xl" data-testid="christmas-headline">
              {banner.headline}
            </p>
            {banner.line ? (
              <p className="mt-1.5 max-w-[62ch] text-base text-pretty text-white/90" data-testid="christmas-line">
                {banner.line}
              </p>
            ) : null}
            {banner.note ? (
              <p className="mt-1 max-w-[62ch] text-base text-pretty text-white/90" data-testid="christmas-note">
                {banner.note}
              </p>
            ) : null}
            <p
              className="mt-3 inline-flex items-center rounded-md px-2.5 py-1 text-sm font-semibold tabular-nums"
              style={{ backgroundColor: DEEP_RED }}
              data-testid="christmas-countdown"
            >
              {banner.countdown}
            </p>
          </>
        ) : (
          <p className="max-w-[62ch] text-base leading-relaxed font-semibold text-pretty lg:text-lg" data-testid="christmas-after">
            {banner.text}
          </p>
        )}
      </div>
    </section>
  );
}

// The string: a thin wire with bulbs hanging from it at an even spacing,
// each on its own slow beat. Decoration only, so screen readers skip it.
function LightString() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-6 overflow-hidden">
      <div className="absolute inset-x-0 top-[5px] h-px" style={{ backgroundColor: WIRE }} />
      <div className="absolute inset-x-0 top-[5px] flex gap-[22px] pl-3">
        {Array.from({ length: BULB_COUNT }, (_, at) => {
          const colour = BULBS[at % BULBS.length];
          return (
            <span key={at} className="flex shrink-0 flex-col items-center">
              <span className="block h-[3px] w-[4px] rounded-[1px]" style={{ backgroundColor: WIRE }} />
              <span
                className="xmas-bulb block h-[9px] w-[6px] rounded-full"
                style={{
                  backgroundColor: colour,
                  boxShadow: `0 1px 5px ${colour}`,
                  // Beats spread across the string, so it twinkles, not blinks.
                  animationDelay: `${((at * 7) % 19) * 0.2}s`,
                }}
              />
            </span>
          );
        })}
      </div>
    </div>
  );
}
