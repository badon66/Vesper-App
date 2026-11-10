import { cn } from "@/lib/utils";

// Text wordmark used until the real logo files land in brand/.
//
// hangDot (meeting mode's cover, round 7 review): the letters alone are
// centred, with the gold dot hanging outside them, and the tracking after
// the last letter taken back, so centred under it the address lines up with
// the letters rather than the letters and the dot.
export function Wordmark({ className, hangDot = false }: { className?: string; hangDot?: boolean }) {
  if (hangDot) {
    return (
      <span className={cn("relative inline-flex items-center font-bold tracking-[0.18em] uppercase", className)}>
        <span className="mr-[-0.18em]">Vesper</span>
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-full size-1.5 -translate-y-1/2 rounded-full bg-gold"
          style={{ marginLeft: "calc(0.18em + 0.5rem)" }}
        />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-bold tracking-[0.18em] uppercase",
        className,
      )}
    >
      <span>Vesper</span>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-gold" />
    </span>
  );
}
