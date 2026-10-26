"use client";

import { useActionState } from "react";
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

const initialState: CreatePersonState = {};

export function AddPersonForm() {
  const [state, formAction, pending] = useActionState(createPerson, initialState);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a sales associate</CardTitle>
        <CardDescription>
          You get a temporary password to text them. They set their own the
          first time they sign in.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {state.created ? (
          <div
            role="status"
            className="flex flex-col gap-2 rounded-md border border-primary bg-accent px-4 py-3 text-sm"
          >
            <p className="font-semibold">
              Login created for {state.created.fullName}.
            </p>
            <p>
              Email: <span className="font-semibold">{state.created.email}</span>
            </p>
            <p>
              Temporary password:{" "}
              <span className="font-mono text-base font-semibold tracking-wide">
                {state.created.tempPassword}
              </span>
            </p>
            <p className="text-muted-foreground">
              Text both to them now. The password is not stored and will not
              be shown again.
            </p>
          </div>
        ) : null}

        <form action={formAction} className="grid gap-5 sm:grid-cols-2" noValidate key={state.created?.email ?? "new"}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="person-full_name">Full name</Label>
            <Input
              id="person-full_name"
              name="full_name"
              autoComplete="off"
              required
              aria-invalid={state.errors?.full_name ? true : undefined}
              aria-describedby={state.errors?.full_name ? "person-full_name-error" : undefined}
            />
            <FieldError id="person-full_name-error" message={state.errors?.full_name} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="person-email">Email</Label>
            <Input
              id="person-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="off"
              autoCapitalize="none"
              required
              aria-invalid={state.errors?.email ? true : undefined}
              aria-describedby={state.errors?.email ? "person-email-error" : undefined}
            />
            <FieldError id="person-email-error" message={state.errors?.email} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="person-phone">Phone (optional)</Label>
            <Input
              id="person-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              aria-invalid={state.errors?.phone ? true : undefined}
              aria-describedby={state.errors?.phone ? "person-phone-error" : undefined}
            />
            <FieldError id="person-phone-error" message={state.errors?.phone} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Role</Label>
            <p className="flex h-11 items-center text-base">Sales associate</p>
          </div>
          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive sm:col-span-2">
              {state.error}
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" disabled={pending}>
              {pending ? "Creating" : "Create login"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
