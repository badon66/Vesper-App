"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionMessage } from "@/components/action-message";
import { setLeadPosition } from "@/app/(app)/app/leads/actions";
import { UseMyPosition } from "@/components/leads/use-my-position";

// On a lead with no map position: take the phone's position at the door,
// for a brand-new street Google doesn't have yet.
export function LeadPosition({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2" data-testid="lead-position">
      <p className="text-sm text-muted-foreground">Brand-new street Google doesn&apos;t have yet? At the door:</p>
      <UseMyPosition
        onPosition={(position) =>
          startTransition(async () => {
            const result = await setLeadPosition(leadId, position);
            if (!result.ok) setMessage(result.error);
            else router.refresh();
          })
        }
      />
      {pending ? <p className="text-sm text-muted-foreground">Saving the position.</p> : null}
      <ActionMessage text={message} />
    </div>
  );
}
