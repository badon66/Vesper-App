"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth";
import { changeOwnPassword, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = {};

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changeOwnPassword, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your password</CardTitle>
        <CardDescription>
          Only you can change your own password. Everyone else gets theirs
          from you in People. At least {PASSWORD_MIN_LENGTH} characters.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-5 sm:grid-cols-2" noValidate key={state.ok ? "done" : "edit"}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="own-password">New password</Label>
            <Input
              id="own-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
              aria-invalid={state.error ? true : undefined}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="own-confirm">Type it again</Label>
            <Input
              id="own-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={PASSWORD_MIN_LENGTH}
              required
              aria-invalid={state.error ? true : undefined}
            />
          </div>
          <div className="flex flex-col gap-3 sm:col-span-2 sm:flex-row sm:items-center">
            <Button type="submit" size="lg" variant="outline" disabled={pending}>
              {pending ? "Saving" : "Change my password"}
            </Button>
            {state.ok ? (
              <p role="status" className="text-sm text-muted-foreground">
                Password changed.
              </p>
            ) : null}
            {state.error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {state.error}
              </p>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
