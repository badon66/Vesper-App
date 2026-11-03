import { isViewAsRefusal } from "@/lib/view-as";
import { cn } from "@/lib/utils";

// A server action's answer after a tap. "View as: nothing was saved." reads
// calmly, as a status; anything else that went wrong reads as an alert.
export function ActionMessage({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  const calm = isViewAsRefusal(text);
  return (
    <p
      role={calm ? "status" : "alert"}
      className={cn("text-sm font-medium text-pretty", calm ? "text-foreground" : "text-destructive", className)}
      data-testid={calm ? "view-as-nothing-saved" : undefined}
    >
      {text}
    </p>
  );
}
