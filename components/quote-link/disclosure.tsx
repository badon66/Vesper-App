"use client";

import { ChevronDown } from "lucide-react";
import { useRef, useState } from "react";
import { EASE_QUIET } from "@/components/quote-link/motion";
import { cn } from "@/lib/utils";

// Tap to open (2026-11-04): the browser's own details and summary, so it
// opens before the page's script has loaded and a screen reader hears
// whether it is open. Once the script is alive it opens gently over 220 ms
// and closes over 180 ms; with reduce motion on it simply opens.
export function Disclosure({
  title,
  meta,
  children,
  variant = "row",
  testId,
  onOpen,
}: {
  title: string;
  // A short note beside the title, like "6 photos".
  meta?: string;
  children: React.ReactNode;
  // row: a full-width row for the page's Tap to open list; inline: a quiet
  // text toggle inside a section.
  variant?: "row" | "inline";
  testId?: string;
  onOpen?: () => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const running = useRef<Animation | null>(null);
  const [open, setOpen] = useState(false);

  function toggle(event: React.MouseEvent) {
    const element = details.current;
    const content = body.current;
    if (!element || !content || typeof content.animate !== "function") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    event.preventDefault();
    running.current?.cancel();
    if (!element.open) {
      element.open = true;
      setOpen(true);
      onOpen?.();
      const height = content.scrollHeight;
      running.current = content.animate(
        [
          { height: "0px", opacity: 0 },
          { height: `${height}px`, opacity: 1 },
        ],
        { duration: 220, easing: EASE_QUIET },
      );
      running.current.onfinish = () => {
        running.current = null;
      };
    } else {
      setOpen(false);
      const height = content.offsetHeight;
      running.current = content.animate(
        [
          { height: `${height}px`, opacity: 1 },
          { height: "0px", opacity: 0 },
        ],
        { duration: 180, easing: EASE_QUIET },
      );
      running.current.onfinish = () => {
        element.open = false;
        running.current = null;
      };
    }
  }

  return (
    <details
      ref={details}
      data-testid={testId}
      onToggle={(event) => {
        // The browser's own toggle (reduce motion, or before the script).
        const now = (event.currentTarget as HTMLDetailsElement).open;
        if (running.current) return;
        setOpen(now);
        if (now) onOpen?.();
      }}
      className={cn(variant === "row" && "border-b")}
    >
      <summary
        onClick={toggle}
        className={cn(
          "flex cursor-pointer list-none items-center outline-none select-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden",
          variant === "row"
            ? "min-h-14 justify-between gap-4 px-5 py-3 focus-visible:ring-inset"
            : "-mx-1 min-h-11 w-fit gap-1.5 rounded-md px-1 text-base font-semibold underline-offset-4 hover:underline",
        )}
      >
        <span className={cn(variant === "row" && "flex min-w-0 flex-col")}>
          <span className={cn(variant === "row" && "text-lg font-semibold")}>{title}</span>
          {meta ? <span className="text-sm text-muted-foreground">{meta}</span> : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "shrink-0 transition-transform duration-200 motion-reduce:transition-none",
            variant === "row" ? "size-5" : "size-4",
            open && "rotate-180",
          )}
        />
      </summary>
      <div ref={body} className="overflow-hidden">
        <div className={cn(variant === "row" ? "px-5 pb-6" : "pt-2 pb-1")}>{children}</div>
      </div>
    </details>
  );
}
