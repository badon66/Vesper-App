"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  resetPassword,
  setPersonActive,
  type ResetPasswordState,
  type SetActiveState,
} from "./actions";
import { PasswordBox } from "./password-box";

const noActive: SetActiveState = {};
const noReset: ResetPasswordState = {};

export function PersonActions({
  id,
  name,
  active,
}: {
  id: string;
  name: string;
  active: boolean;
}) {
  const [activeState, activeAction, activePending] = useActionState(setPersonActive, noActive);
  const [resetState, resetAction, resetPending] = useActionState(resetPassword, noReset);
  const [confirmingReset, setConfirmingReset] = useState(false);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {confirmingReset ? (
          <form
            action={(formData) => {
              setConfirmingReset(false);
              resetAction(formData);
            }}
            className="flex items-center gap-2"
          >
            <input type="hidden" name="id" value={id} />
            <span className="text-sm">New password for {name}? The old one stops working.</span>
            <Button type="submit" size="sm" disabled={resetPending}>
              Yes, reset
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingReset(false)}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={resetPending}
            onClick={() => setConfirmingReset(true)}
          >
            {resetPending ? "Resetting" : "Reset password"}
          </Button>
        )}
        <form action={activeAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="active" value={active ? "false" : "true"} />
          <Button
            type="submit"
            variant={active ? "outline" : "secondary"}
            size="sm"
            disabled={activePending}
          >
            {activePending ? "Saving" : active ? "Deactivate" : "Reactivate"}
          </Button>
        </form>
      </div>
      {activeState.error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {activeState.error}
        </p>
      ) : null}
      {resetState.error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {resetState.error}
        </p>
      ) : null}
      {resetState.reset?.id === id ? (
        <div className="w-full max-w-sm text-left">
          <PasswordBox
            title={`New password for ${resetState.reset.fullName}.`}
            password={resetState.reset.password}
          />
        </div>
      ) : null}
    </div>
  );
}
