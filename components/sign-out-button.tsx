"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";

// Sign out asks once (2026-11-03): it sits in the header on every screen,
// and a setter can't reset their own password, so a stray tap shouldn't
// mean hunting for it at the next door.
export function SignOutButton({
  action,
  disabled,
  askKeenan,
}: {
  action: () => Promise<void>;
  disabled: boolean;
  // Setters can't reset their own password: say who can.
  askKeenan: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
        Sign out
      </Button>
      <DialogPanel
        open={open}
        onClose={() => setOpen(false)}
        title="Sign out of Vesper?"
        testId="sign-out"
        actions={
          <>
            <form action={action}>
              <Button type="submit" variant="outline">
                Sign out
              </Button>
            </form>
            <Button type="button" onClick={() => setOpen(false)}>
              Stay signed in
            </Button>
          </>
        }
      >
        <p className="text-base text-pretty">
          You&apos;ll need your password to sign in again.{askKeenan ? " If you don't have it, ask Keenan." : ""}
        </p>
      </DialogPanel>
    </>
  );
}
