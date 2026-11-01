"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import {
  findLeadsAtPlace,
  type DuplicateLead,
  type LeadFormState,
} from "@/app/(app)/app/leads/actions";
import { FieldError } from "@/components/field-error";
import { AddressField, type AddressDefaults } from "@/components/leads/address-field";
import { ChoiceGroup } from "@/components/leads/choice-group";
import { FindOutFields } from "@/components/leads/find-out-fields";
import { PhotoPicker } from "@/components/leads/photo-picker";
import { PhotoSlots } from "@/components/leads/photo-slots";
import { HoldOnNewLead, type NewLeadBooking } from "@/components/schedule/hold-on-new-lead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FindOutField, PhotoSlot } from "@/lib/leads/door";
import {
  HOUSE_TYPE_OPTIONS,
  SOURCE_OPTIONS,
  type HouseType,
  type LeadSource,
} from "@/lib/leads/status";
import { formatPhone, normalizePhone } from "@/lib/phone";
import type { PickedAddress } from "@/lib/places";

export type LeadFormDefaults = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  neighbourhood: string;
  house_type: HouseType | null;
  // The Find out answers as the form holds them.
  find_out: Record<FindOutField, string | null>;
  soffit_note: string;
  notes: string;
  source: LeadSource;
  address: AddressDefaults;
};

const initialState: LeadFormState = {};

const NOTHING_FOUND_OUT: Record<FindOutField, string | null> = {
  owns_home: null,
  wants_price: null,
  soffit_colour: null,
  christmas_lights_now: null,
  areas_wanted: null,
  install_timing: null,
};

// One screen for a new lead at the door, and the same form for editing.
// Address and first name are the only required fields; the Find out
// questions and the photos follow the door process and are all optional.
// Save sits at the bottom of the screen, within reach of a thumb.
export function LeadForm({
  mode,
  action,
  leadId,
  userId,
  mapsKey,
  sessionNeighbourhood,
  defaults,
  cancelHref,
  booking,
}: {
  mode: "create" | "edit";
  action: (state: LeadFormState, formData: FormData) => Promise<LeadFormState>;
  leadId?: string;
  userId: string;
  mapsKey: string | null;
  sessionNeighbourhood: string | null;
  defaults?: LeadFormDefaults;
  cancelHref: string;
  // On New lead: the time picker and any time this person already holds.
  booking?: NewLeadBooking;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [, startTransition] = useTransition();
  const [neighbourhood, setNeighbourhood] = useState(
    defaults?.neighbourhood ?? sessionNeighbourhood ?? "",
  );
  const [neighbourhoodEdited, setNeighbourhoodEdited] = useState(Boolean(defaults?.neighbourhood));
  const [slotsBusy, setSlotsBusy] = useState(false);
  const [takenSlots, setTakenSlots] = useState<PhotoSlot[]>([]);
  const [extrasBusy, setExtrasBusy] = useState(false);
  const photosBusy = slotsBusy || extrasBusy;
  const [duplicates, setDuplicates] = useState<DuplicateLead[]>([]);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const errors = state.errors ?? {};

  function onPicked(picked: PickedAddress | null) {
    if (!picked) {
      setDuplicates([]);
      return;
    }
    if (!neighbourhoodEdited && picked.neighbourhood) setNeighbourhood(picked.neighbourhood);
    findLeadsAtPlace(picked.placeId, leadId ?? null).then(setDuplicates, () => setDuplicates([]));
  }

  // Submitting through a transition keeps everything typed if the server
  // sends back a correction.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(formData));
  }

  function onPhoneBlur(event: React.FocusEvent<HTMLInputElement>) {
    const result = normalizePhone(event.currentTarget.value);
    if (!result.ok) {
      setPhoneError(result.error);
      return;
    }
    setPhoneError(null);
    if (result.e164) event.currentTarget.value = formatPhone(result.e164);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 pb-36">
      {leadId ? <input type="hidden" name="id" value={leadId} /> : null}

      {booking ? (
        <HoldOnNewLead
          booking={booking}
          guidedPhotos={takenSlots.filter((slot) => slot !== "soffit").length}
        />
      ) : null}

      <AddressField
        apiKey={mapsKey}
        defaults={defaults?.address}
        fallbackNeighbourhood={sessionNeighbourhood}
        error={errors.address_line}
        onPicked={onPicked}
        leadId={leadId ?? null}
      />

      {duplicates.length > 0 ? (
        <div
          role="status"
          className="rounded-md border border-primary bg-accent px-4 py-3 text-sm text-accent-foreground"
        >
          <p className="font-semibold">This address already has a lead.</p>
          <ul className="mt-1 flex flex-col">
            {duplicates.map((duplicate) => (
              <li key={duplicate.id}>
                <Link
                  href={`/app/leads/${duplicate.id}`}
                  className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                >
                  {duplicate.name}
                </Link>
                <span className="block text-muted-foreground">
                  {duplicate.status}, added by {duplicate.addedBy} on {duplicate.addedOn}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="lead-neighbourhood">Neighbourhood</Label>
        <Input
          id="lead-neighbourhood"
          name="neighbourhood"
          value={neighbourhood}
          onChange={(event) => {
            setNeighbourhood(event.target.value);
            setNeighbourhoodEdited(true);
          }}
          autoComplete="off"
          autoCapitalize="words"
          aria-invalid={errors.neighbourhood ? true : undefined}
        />
        <FieldError id="lead-neighbourhood-error" message={errors.neighbourhood} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="lead-first_name">First name</Label>
          <Input
            id="lead-first_name"
            name="first_name"
            defaultValue={defaults?.first_name}
            autoComplete="off"
            autoCapitalize="words"
            aria-invalid={errors.first_name ? true : undefined}
            aria-describedby={errors.first_name ? "lead-first_name-error" : undefined}
          />
          <FieldError id="lead-first_name-error" message={errors.first_name} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="lead-last_name">Last name</Label>
          <Input
            id="lead-last_name"
            name="last_name"
            defaultValue={defaults?.last_name}
            autoComplete="off"
            autoCapitalize="words"
            aria-invalid={errors.last_name ? true : undefined}
          />
          <FieldError id="lead-last_name-error" message={errors.last_name} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lead-phone">Phone</Label>
        <Input
          id="lead-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          defaultValue={defaults?.phone}
          onBlur={onPhoneBlur}
          aria-invalid={errors.phone || phoneError ? true : undefined}
          aria-describedby="lead-phone-error"
        />
        <FieldError id="lead-phone-error" message={phoneError ?? errors.phone} />
      </div>

      <FindOutFields
        defaults={defaults?.find_out ?? NOTHING_FOUND_OUT}
        soffitNote={defaults?.soffit_note ?? ""}
        errors={errors}
      />

      {mode === "create" ? (
        <section aria-labelledby="photos-heading" className="flex flex-col gap-3">
          <h2 id="photos-heading" className="text-lg font-bold">
            Photos
          </h2>
          <PhotoSlots userId={userId} mode="form" onBusyChange={setSlotsBusy} onTakenChange={setTakenSlots} />
          <PhotoPicker
            userId={userId}
            mode="form"
            buttonLabel="More photos"
            onBusyChange={setExtrasBusy}
          />
          <FieldError id="lead-photo_paths-error" message={errors.photo_paths} />
        </section>
      ) : null}

      <ChoiceGroup
        name="house_type"
        legend="House type"
        options={HOUSE_TYPE_OPTIONS}
        defaultValue={defaults?.house_type}
        error={errors.house_type}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="lead-notes">Notes</Label>
        <Textarea id="lead-notes" name="notes" rows={3} defaultValue={defaults?.notes} />
        <FieldError id="lead-notes-error" message={errors.notes} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lead-email">Email (optional)</Label>
        <Input
          id="lead-email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="off"
          defaultValue={defaults?.email}
          aria-invalid={errors.email ? true : undefined}
        />
        <FieldError id="lead-email-error" message={errors.email} />
      </div>

      <ChoiceGroup
        name="source"
        legend="Where the lead came from"
        options={SOURCE_OPTIONS}
        defaultValue={defaults?.source ?? "door"}
        error={errors.source}
      />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:left-20">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          {state.error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {state.error}
            </p>
          ) : null}
          {mode === "create" ? (
            <div className="flex gap-2">
              <Button asChild variant="outline" size="lg" className="w-12 shrink-0 px-0">
                <Link href={cancelHref} aria-label="Cancel">
                  <X aria-hidden="true" />
                </Link>
              </Button>
              <Button
                type="submit"
                name="intent"
                value="save"
                variant="outline"
                size="lg"
                className="flex-1 px-3"
                disabled={pending || photosBusy}
              >
                {pending ? "Saving" : photosBusy ? "Uploading" : "Save lead"}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="book"
                size="lg"
                className="flex-1 px-3"
                disabled={pending || photosBusy}
              >
                Save and book
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              <Button asChild variant="outline" size="lg" className="flex-1">
                <Link href={cancelHref}>Cancel</Link>
              </Button>
              <Button type="submit" size="lg" className="flex-[2]" disabled={pending || photosBusy}>
                {pending ? "Saving" : photosBusy ? "Uploading photo" : "Save changes"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
