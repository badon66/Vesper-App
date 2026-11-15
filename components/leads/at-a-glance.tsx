import { cn } from "@/lib/utils";

// Round 21 (Keenan, 2026-11-15): the lead page's At a glance panel, top right
// on an iPad or laptop and under the contact lines on a phone. Short lines
// only, each shown only when it applies: a quiet label, then the line.

export function AtAGlance({ children }: { children: React.ReactNode }) {
  return (
    <section aria-labelledby="at-a-glance-heading" className="rounded-xl border bg-card px-4 pt-3 pb-1 text-card-foreground" data-testid="at-a-glance">
      <h2 id="at-a-glance-heading" className="text-sm font-semibold text-muted-foreground">
        At a glance
      </h2>
      <dl className="flex flex-col divide-y">{children}</dl>
    </section>
  );
}

export function GlanceRow({
  label,
  children,
  testId,
  className,
}: {
  label: string;
  children: React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-x-3 py-1.5", className)} data-testid={testId}>
      <dt className="flex min-h-11 items-center text-sm text-muted-foreground">{label}</dt>
      <dd className="flex min-h-11 min-w-0 flex-col justify-center gap-1 text-sm">{children}</dd>
    </div>
  );
}
