"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";

// Sign out asks once (2026-11-03): it sits in the header on every screen,
// and a setter can't reset their own password, so a stray tap shouldn't
// mean hunting for it at the next door.
export function SignOutButton({ action, disabled }: { action: () => Promise<void>; disabled: boolean }) {
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
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Stay signed in
            </Button>
            <form action={action}>
              <Button type="submit">Sign out</Button>
            </form>
          </>
        }
      >
        <p className="text-base text-pretty">You&apos;ll need your password to sign in again.</p>
      </DialogPanel>
    </>
  );
}
