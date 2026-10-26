"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { setPersonActive, type SetActiveState } from "./actions";

const initialState: SetActiveState = {};

export function PersonActions({ id, active }: { id: string; active: boolean }) {
  const [state, formAction, pending] = useActionState(setPersonActive, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "false" : "true"} />
      <Button
        type="submit"
        variant={active ? "outline" : "secondary"}
        size="sm"
        disabled={pending}
      >
        {pending ? "Saving" : active ? "Deactivate" : "Reactivate"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
