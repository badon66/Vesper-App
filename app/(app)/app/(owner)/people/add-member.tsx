"use client";

import { useActionState, useState } from "react";
import { FieldError } from "@/components/field-error";
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
import { createPerson, type CreatePersonState } from "./actions";
import { PasswordBox } from "./password-box";

const initialState: CreatePersonState = {};

type RoleOption = { value: string; label: string };

export function AddMember({ roles }: { roles: RoleOption[] }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createPerson, initialState);

  if (!open && !state.created) {
    return (
      <div>
        <Button type="button" size="lg" onClick={() => setOpen(true)}>
          Add a Vesper member
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a Vesper member</CardTitle>
        <CardDescription>
          The app makes their password. You text it to them, and it stays
          their password until you reset it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {state.created ? (
          <PasswordBox
            title={`Login created for ${state.created.fullName}.`}
            email={state.created.email}
            password={state.created.password}
          />
        ) : null}

        <form
          action={formAction}
          className="grid gap-5 sm:grid-cols-2"
          noValidate
          key={state.created?.email ?? "new"}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="member-full_name">Full name</Label>
            <Input
              id="member-full_name"
              name="full_name"
              autoComplete="off"
              required
              aria-invalid={state.errors?.full_name ? true : undefined}
              aria-describedby={state.errors?.full_name ? "member-full_name-error" : undefined}
            />
            <FieldError id="member-full_name-error" message={state.errors?.full_name} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              required
              aria-invalid={state.errors?.email ? true : undefined}
              aria-describedby={state.errors?.email ? "member-email-error" : undefined}
            />
            <FieldError id="member-email-error" message={state.errors?.email} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="member-phone">Phone (optional)</Label>
            <Input
              id="member-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              aria-invalid={state.errors?.phone ? true : undefined}
              aria-describedby={state.errors?.phone ? "member-phone-error" : undefined}
            />
            <FieldError id="member-phone-error" message={state.errors?.phone} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="member-role">Role</Label>
            <select
              id="member-role"
              name="role"
              defaultValue={roles[0]?.value}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
              aria-invalid={state.errors?.role ? true : undefined}
            >
              {roles.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
            <FieldError id="member-role-error" message={state.errors?.role} />
          </div>
          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">
              {state.error}
            </p>
          ) : null}
          <div className="flex gap-3 sm:col-span-2">
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Creating" : "Create login"}
            </Button>
            <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
