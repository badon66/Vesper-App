import { cn } from "@/lib/utils";

// Text wordmark used until the real logo files land in brand/.
export function Wordmark({ className }: { className?: string }) {
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
