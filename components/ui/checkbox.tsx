"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

// hit: a 44 px tap area around the same 24 px box (round 20), for a
// checkbox that is a thumb target on its own.
function Checkbox({
  className,
  hit = false,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root> & { hit?: boolean }) {
  if (hit) {
    return (
      <CheckboxPrimitive.Root
        data-slot="checkbox"
        className={cn(
          "group peer -m-2.5 flex size-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-sm border border-input bg-background transition-colors group-data-[state=checked]:border-primary group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground"
        >
          <CheckboxPrimitive.Indicator data-slot="checkbox-indicator">
            <Check className="size-4" aria-hidden="true" />
          </CheckboxPrimitive.Indicator>
        </span>
      </CheckboxPrimitive.Root>
    );
  }
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer flex size-6 shrink-0 items-center justify-center rounded-sm border border-input bg-background transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator">
        <Check className="size-4" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
