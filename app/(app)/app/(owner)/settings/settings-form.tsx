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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DAY_OPTIONS,
  type SettingsFormDefaults,
  type SettingsFormField,
} from "@/lib/settings/schema";
import { updateSettings, type SettingsState } from "./actions";

const initialState: SettingsState = {};

type FieldProps = {
  name: SettingsFormField;
  label: string;
  hint?: string;
  errors?: SettingsState["errors"];
  children: (props: {
    id: string;
    name: string;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
};

function Field({ name, label, hint, errors, children }: FieldProps) {
  const id = `settings-${name}`;
  const error = errors?.[name];
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        name,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function formatSavedAt(iso: string) {
  return new Date(iso).toLocaleTimeString("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Edmonton",
  });
}

export function SettingsForm({ defaults }: { defaults: SettingsFormDefaults }) {
  const [state, formAction, pending] = useActionState(updateSettings, initialState);
  const errors = state.errors;

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>Pricing</CardTitle>
          <CardDescription>
            Defaults for new quotes. Existing quotes keep the prices they were
            made with.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field name="price_per_ft" label="Price per foot ($)" errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.price_per_ft} />}
          </Field>
          <Field name="box_price" label="Control box price ($)" errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.box_price} />}
          </Field>
          <Field name="neighbour_discount" label="Neighbour discount ($)" errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.neighbour_discount} />}
          </Field>
          <Field name="referral_credit" label="Referral credit ($)" errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.referral_credit} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GST</CardTitle>
          <CardDescription>
            Off until the company is registered. While off, prices show with no
            mention of GST.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="flex items-center gap-3">
            <Switch id="settings-gst_enabled" name="gst_enabled" defaultChecked={defaults.gst_enabled} />
            <Label htmlFor="settings-gst_enabled">Charge GST on quotes</Label>
          </div>
          <Field name="gst_rate_percent" label="GST rate (%)" errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" max="99.99" defaultValue={defaults.gst_rate_percent} />}
          </Field>
          <Field name="gst_number" label="GST number" hint="Printed on quotes and invoices once GST is on." errors={errors}>
            {(p) => <Input {...p} autoComplete="off" defaultValue={defaults.gst_number} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Setter pay</CardTitle>
          <CardDescription>
            A change applies to new earnings only. Every earning keeps the rate
            it was calculated at.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field name="booking_pay" label="Booking pay per qualified booking ($)" errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.booking_pay} />}
          </Field>
          <Field name="commission_rate_percent" label="Commission (% of the accepted quote before GST)" errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" max="99.99" defaultValue={defaults.commission_rate_percent} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Warranty</CardTitle>
          <CardDescription>
            Printed word for word on every quote and shown in the presentation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field name="warranty_text" label="Warranty text" errors={errors}>
            {(p) => <Textarea {...p} rows={6} defaultValue={defaults.warranty_text} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Meeting slots</CardTitle>
          <CardDescription>
            The evening template. Open slots are these minus booked meetings
            and blocked time, in Calgary time.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <fieldset className="flex flex-col gap-2 sm:col-span-2">
            <legend className="text-sm font-semibold">Days</legend>
            <div className="flex flex-wrap gap-4 pt-1">
              {DAY_OPTIONS.map((day) => (
                <div key={day.value} className="flex items-center gap-2">
                  <Checkbox
                    id={`settings-day-${day.value}`}
                    name="meeting_days"
                    value={String(day.value)}
                    defaultChecked={defaults.meeting_days.includes(day.value)}
                  />
                  <Label htmlFor={`settings-day-${day.value}`}>{day.label}</Label>
                </div>
              ))}
            </div>
            <FieldError id="settings-meeting_days-error" message={errors?.meeting_days} />
          </fieldset>
          <Field name="meeting_start" label="First slot starts at" errors={errors}>
            {(p) => <Input {...p} type="time" step={300} defaultValue={defaults.meeting_start} />}
          </Field>
          <Field name="meeting_slot_minutes" label="Slot length (minutes)" errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min="15" max="180" step="5" defaultValue={defaults.meeting_slot_minutes} />}
          </Field>
          <Field name="meeting_slot_count" label="Slots per evening" errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min="1" max="12" defaultValue={defaults.meeting_slot_count} />}
          </Field>
          <Field name="distance_warning_km" label="Distance warning (km)" hint="Warn when a booking is further than this from the meeting before or after it." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.1" min="0" defaultValue={defaults.distance_warning_km} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lost reasons</CardTitle>
          <CardDescription>
            The choices offered when a lead is marked lost. One per line.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field name="lost_reasons" label="Reasons" errors={errors}>
            {(p) => <Textarea {...p} rows={5} defaultValue={defaults.lost_reasons} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
          <CardDescription>Printed on quotes. Fill in anything that is blank.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field name="company_name" label="Company name" errors={errors}>
            {(p) => <Input {...p} defaultValue={defaults.company_name} autoComplete="organization" />}
          </Field>
          <Field name="company_phone" label="Phone" errors={errors}>
            {(p) => <Input {...p} type="tel" inputMode="tel" defaultValue={defaults.company_phone} autoComplete="tel" />}
          </Field>
          <Field name="company_email" label="Email" errors={errors}>
            {(p) => <Input {...p} type="email" inputMode="email" defaultValue={defaults.company_email} autoComplete="email" />}
          </Field>
          <Field name="company_address" label="Address" errors={errors}>
            {(p) => <Input {...p} defaultValue={defaults.company_address} autoComplete="street-address" />}
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving" : "Save settings"}
        </Button>
        {state.ok && state.savedAt ? (
          <p role="status" className="text-sm text-muted-foreground">
            Saved at {formatSavedAt(state.savedAt)}.
          </p>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
