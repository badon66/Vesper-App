import { STATUS_LABELS, type LeadStatus } from "@/lib/leads/status";
import { cn } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        status === "new" && "border-primary text-foreground",
        status === "lost" && "text-muted-foreground",
        status !== "new" && status !== "lost" && "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
