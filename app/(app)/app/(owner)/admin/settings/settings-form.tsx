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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { POINT_ICON_NAMES } from "@/components/quote-link/point-icon";
import { submitKeepingValues } from "@/lib/forms/submit";
import { POINT_ICONS } from "@/lib/quote-link/view";
import { formatTime } from "@/lib/time";
import {
  DAY_OPTIONS,
  type BlackFridayKindInput,
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

// Black Friday (Keenan, 2026-11-10): None, Percent off or Dollars off, and
// the amount. Once set, meeting mode's price page shows a Black Friday
// button; None takes it away. The amount is checked on the server like the
// other prices.
function BlackFridayFields({ defaults, errors }: { defaults: SettingsFormDefaults; errors?: SettingsState["errors"] }) {
  const [kind, setKind] = useState<BlackFridayKindInput>(defaults.black_friday_kind);
  const hintId = "settings-black_friday-hint";
  return (
    <fieldset className="flex flex-col gap-3 sm:col-span-2" aria-describedby={hintId}>
      <legend className="mb-2 text-sm leading-none font-medium">Black Friday deal</legend>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="black_friday_kind" label="Deal" errors={errors}>
          {(p) => (
            <select
              {...p}
              value={kind}
              onChange={(event) => setKind(event.target.value as BlackFridayKindInput)}
              className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            >
              <option value="none">None</option>
              <option value="percent">Percent off</option>
              <option value="amount">Dollars off</option>
            </select>
          )}
        </Field>
        <Field name="black_friday_value" label={kind === "amount" ? "Dollars off ($)" : "Percent off (%)"} errors={errors}>
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              max={kind === "percent" ? "90" : undefined}
              disabled={kind === "none"}
              defaultValue={defaults.black_friday_value}
            />
          )}
        </Field>
      </div>
      <p id={hintId} className="text-sm text-muted-foreground">
        Once set, meeting mode&apos;s price page shows a Black Friday button. Tapped, every option shows its regular price struck
        through beside the Black Friday price. If the customer says yes with it on, the deal saves on their quote as a discount
        line. A percent is taken off each option&apos;s own total, up to 90%. None takes the button away; quotes already saved
        keep their line.
      </p>
    </fieldset>
  );
}

function formatSavedAt(iso: string) {
  return formatTime(iso);
}

// The presentation's words, photos and looks moved to their own page in
// round 7 (presentation/page.tsx); settings.presentation is no longer edited.
export function SettingsForm({ defaults }: { defaults: SettingsFormDefaults }) {
  const [state, formAction, pending] = useActionState(updateSettings, initialState);
  const errors = state.errors;

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="flex flex-col gap-6" noValidate>
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
          <BlackFridayFields defaults={defaults} errors={errors} />
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
          <Field name="commission_rate_percent" label="Commission (% of the lights and control boxes after discounts)" errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" max="99.99" defaultValue={defaults.commission_rate_percent} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Warranty</CardTitle>
          <CardDescription>
            Printed word for word on every quote. The presentation shows its
            first lines up front and every line behind The full warranty, one
            per line, as written here.
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
          <CardTitle>Meeting mode</CardTitle>
          <CardDescription>
            What the iPad shows and quotes at a meeting. A fee left blank keeps
            its line out of sight everywhere.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field name="price_hold_days" label="Prices held for (days)" hint="Each new quote holds its prices until this many days out, shown to the customer as Price held until. It can be changed on the quote." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min="1" max="365" defaultValue={defaults.price_hold_days} />}
          </Field>
          <Field name="rush_colour_fee" label="Rush colour fee ($ a job)" hint="One flat amount when a colour other than stock is powder coated this season instead of waiting for the spring factory order. Blank hides that choice on the quote and on the customer's link." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.rush_colour_fee} />}
          </Field>
          <Field name="upper_access_fee" label="Upper access ($)" hint="Added on its own to a quote with upper runs and no upper gable. Each quote keeps its own copy, and Keenan can change it in the quote builder. Blank: no line." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.upper_access_fee} />}
          </Field>
          <Field name="upper_gable_access_fee" label="Upper access with an upper gable ($)" hint="Added instead of the amount above when an upper gable is in the quote. Blank: no line." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.upper_gable_access_fee} />}
          </Field>
          <Field name="double_track_per_ft" label="Double track price per foot ($)" hint="For an area set to Double track in the quote editor. Hat track, the standard, is the price per foot above. Blank: Double track can't be picked yet. Each quote keeps the price it used." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.double_track_per_ft} />}
          </Field>
          <Field name="j_track_per_ft" label="J track price per foot ($)" hint="For an area set to J track, often the upper gables. Blank: J track can't be picked yet. Each quote keeps the price it used." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.j_track_per_ft} />}
          </Field>
          <Field name="service_call_fee" label="Service call fee ($)" hint="The flat fee for a service call in years 6 to 10 of the warranty. Blank means the warranty page names no amount." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.service_call_fee} />}
          </Field>
          <Field name="min_job_total" label="Minimum job total ($, before GST)" hint="When a quote, or a smaller choice on the customer's link, comes in under this, the total rises to it with a line saying so. Blank means no minimum. Each quote keeps the minimum it was saved with." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.01" min="0" defaultValue={defaults.min_job_total} />}
          </Field>
          <div className="sm:col-span-2">
            <Field name="faq_text" label="Common questions" hint="For the leave-behind folder, coming after the first meetings. This started as a draft; make it yours." errors={errors}>
              {(p) => <Textarea {...p} rows={10} defaultValue={defaults.faq_text} />}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customer quote page</CardTitle>
          <CardDescription>
            What every customer&apos;s quote link shows besides their own quote.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Switch id="settings-christmas_banner_on" name="christmas_banner_on" defaultChecked={defaults.christmas_banner_on} />
              <Label htmlFor="settings-christmas_banner_on">Show the Christmas banner</Label>
            </div>
            <p className="-mt-2 text-sm text-muted-foreground">
              It shows from September 1 to November 30 while this is on, and hides itself after that.
            </p>
            <Field name="christmas_banner_title" label="Banner heading" errors={errors}>
              {(p) => <Input {...p} maxLength={80} defaultValue={defaults.christmas_banner_title} />}
            </Field>
            <Field name="christmas_banner_text" label="Banner words" hint="No dates or promises: it reads like an invitation, not a deadline." errors={errors}>
              {(p) => <Textarea {...p} rows={2} maxLength={300} defaultValue={defaults.christmas_banner_text} />}
            </Field>
          </div>
          <fieldset className="flex flex-col gap-3" aria-describedby="settings-product_points-hint">
            <legend className="text-sm font-semibold">What you&apos;re getting</legend>
            <p id="settings-product_points-hint" className="text-sm text-muted-foreground">
              Six short lines, one each, with a line icon. A blank line is left out.
            </p>
            {defaults.product_points.map((point, at) => (
              <div key={at} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  name={`point_icon_${at}`}
                  aria-label={`Point ${at + 1} icon`}
                  defaultValue={point.icon}
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm sm:w-44"
                >
                  {POINT_ICONS.map((icon) => (
                    <option key={icon} value={icon}>
                      {POINT_ICON_NAMES[icon]}
                    </option>
                  ))}
                </select>
                <Input
                  name={`point_text_${at}`}
                  aria-label={`Point ${at + 1}`}
                  maxLength={160}
                  defaultValue={point.text}
                  className="min-w-0 flex-1"
                />
              </div>
            ))}
            <FieldError id="settings-product_points-error" message={errors?.product_points} />
          </fieldset>
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
          <Field name="distance_warning_km" label="Distance warning (km)" hint="Warn when a booking is further than this, in a straight line, from the meeting before or after it." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="decimal" step="0.1" min="0" defaultValue={defaults.distance_warning_km} />}
          </Field>
          <Field name="booking_cutoff_minutes" label="Booking cutoff (minutes)" hint="Setters can hold, book or move into a time until this long before it starts. You can until it starts." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min="0" max="240" step="5" defaultValue={defaults.booking_cutoff_minutes} />}
          </Field>
          <Field name="hold_minutes" label="Hold length (minutes)" hint="A tapped time is held this long, with a countdown. Adding time adds this much again. The timer is what frees a time." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min="1" max="30" defaultValue={defaults.hold_minutes} />}
          </Field>
          <Field name="booking_window_days" label="Booking window (days ahead)" hint="Tonight plus this many evenings can be booked." errors={errors}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min="1" max="60" defaultValue={defaults.booking_window_days} />}
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
          <CardTitle>Not qualified reasons</CardTitle>
          <CardDescription>
            The choices offered when you mark a meeting Not qualified. One per
            line. Other always asks for a few words.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field name="not_qualified_reasons" label="Reasons" errors={errors}>
            {(p) => <Textarea {...p} rows={5} defaultValue={defaults.not_qualified_reasons} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What to talk about</CardTitle>
          <CardDescription>
            One note for each step of the booking sheet, behind its &ldquo;?&rdquo;.
            New lead shows all three. Line breaks show as written.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field name="step_note_at_door" label="At the door" errors={errors}>
            {(p) => <Textarea {...p} rows={8} defaultValue={defaults.step_note_at_door} />}
          </Field>
          <Field name="step_note_after_door" label="After the door" errors={errors}>
            {(p) => <Textarea {...p} rows={5} defaultValue={defaults.step_note_after_door} />}
          </Field>
          <Field name="step_note_book" label="Book" errors={errors}>
            {(p) => <Textarea {...p} rows={4} defaultValue={defaults.step_note_book} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Confirming meetings</CardTitle>
          <CardDescription>
            The text the prep list puts in Messages when you confirm a meeting. You can change it before sending.
            {" {first_name}"}, {"{day}"} (tonight, tomorrow or the weekday) and {"{time}"} are filled in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field name="confirm_text" label="Confirmation text" errors={errors}>
            {(p) => <Textarea {...p} rows={3} defaultValue={defaults.confirm_text} />}
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
