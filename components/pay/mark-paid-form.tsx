"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { markPaid } from "@/app/(app)/app/schedule/actions";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/pay/earnings";

// Keenan ticks the owed lines he has paid (outside the app) and marks them
// paid in one batch. Paid lines never change after that.
export function MarkPaidForm({
  setterName,
  lines,
}: {
  setterName: string;
  lines: { id: string; label: string; amount: number }[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState(async (previous: Awaited<ReturnType<typeof markPaid>>, formData: FormData) => {
    const result = await markPaid(previous, formData);
    if (result?.ok) {
      setPicked(new Set());
      router.refresh();
    }
    return result;
  }, null);
  const total = lines.filter((line) => picked.has(line.id)).reduce((sum, line) => sum + line.amount, 0);

  function toggle(id: string) {
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" data-testid="mark-paid">
      <ul className="flex flex-col divide-y rounded-md border" aria-label={`${setterName}'s owed lines`}>
        {lines.map((line) => (
          <li key={line.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2 text-sm">
              <input
                type="checkbox"
                name="earning_id"
                value={line.id}
                checked={picked.has(line.id)}
                onChange={() => toggle(line.id)}
                className="size-5 accent-[var(--primary)]"
              />
              <span className="flex-1">{line.label}</span>
              <span className="font-semibold tabular-nums">{formatMoney(line.amount)}</span>
            </label>
          </li>
        ))}
      </ul>
      {state && !state.ok ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" className="min-h-11 w-full sm:w-fit" disabled={pending || picked.size === 0}>
        {pending ? "Saving" : picked.size === 0 ? "Tick the lines you've paid" : `Mark ${formatMoney(total)} paid`}
      </Button>
    </form>
  );
}
