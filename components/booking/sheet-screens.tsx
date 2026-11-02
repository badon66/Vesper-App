"use client";

import { Check } from "lucide-react";
import type { RefObject } from "react";
import { AddressField } from "@/components/leads/address-field";
import { AnswerGroup } from "@/components/leads/answer-group";
import { PhotoSlots } from "@/components/leads/photo-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { guidedPhotoCount, PROBLEM_SCREENS, readinessLead, type SheetDraft, type SheetScreen } from "@/lib/booking/sheet";
import { FIND_OUT_QUESTIONS, yesNoChoice, type FindOutField, type PhotoSlot } from "@/lib/leads/door";
import type { PickedAddress } from "@/lib/places";
import { SOFFIT_OPTIONS, type SoffitColour } from "@/lib/leads/status";
import { formatPhone } from "@/lib/phone";
import { leadReadiness, PHOTO_SKIP_OPTIONS, type PhotoSkip } from "@/lib/schedule/readiness";
import { cn } from "@/lib/utils";

type Change = (patch: Partial<SheetDraft>) => void;

// ---------------------------------------------------------------- At the door

export function WhoScreen({
  draft,
  onChange,
  onExisting,
}: {
  draft: SheetDraft;
  onChange: Change;
  onExisting: (() => void) | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      {onExisting ? (
        <div className="-mt-2 flex justify-end">
          <Button type="button" variant="link" size="sm" className="px-0" onClick={onExisting}>
            Existing lead instead
          </Button>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="sheet-first-name">First name</Label>
          <Input
            id="sheet-first-name"
            autoComplete="off"
            autoCapitalize="words"
            value={draft.first_name}
            maxLength={80}
            onChange={(event) => onChange({ first_name: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="sheet-last-name">Last name</Label>
          <Input
            id="sheet-last-name"
            autoComplete="off"
            autoCapitalize="words"
            value={draft.last_name}
            maxLength={80}
            onChange={(event) => onChange({ last_name: event.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="sheet-phone">Phone</Label>
        <Input
          id="sheet-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={draft.phone}
          maxLength={40}
          onChange={(event) => onChange({ phone: event.target.value })}
        />
        <p className="text-sm text-muted-foreground">Needed to confirm the meeting.</p>
      </div>
    </div>
  );
}

// The Find out questions on one screen, as one-tap answers.
export function FindOutScreen({ fields, draft, onChange }: { fields: FindOutField[]; draft: SheetDraft; onChange: Change }) {
  return (
    <div className="flex flex-col gap-5">
      {fields.map((field) => {
        const question = FIND_OUT_QUESTIONS.find((item) => item.field === field);
        if (!question) return null;
        const value =
          field === "owns_home"
            ? yesNoChoice(draft.owns_home, "no")
            : field === "wants_price"
              ? yesNoChoice(draft.wants_price, "not_yet")
              : ((draft[field as keyof SheetDraft] as string | null) ?? null);
        return (
          <AnswerGroup
            key={field}
            name={`sheet-${field}`}
            legend={question.question}
            options={question.options}
            columns={question.columns === 4 ? 4 : question.columns}
            value={value}
            onChange={(next) => {
              if (field === "owns_home") onChange({ owns_home: next === null ? null : next === "yes" });
              else if (field === "wants_price") onChange({ wants_price: next === null ? null : next === "yes" });
              else onChange({ [field]: next } as Partial<SheetDraft>);
            }}
          />
        );
      })}
    </div>
  );
}

export function EveryoneScreen({ draft, onChange }: { draft: SheetDraft; onChange: Change }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-base text-pretty text-muted-foreground">
        Ask who else decides on the house, and that they can be at the meeting.
      </p>
      <button
        type="button"
        aria-pressed={draft.everyone}
        onClick={() => onChange({ everyone: !draft.everyone })}
        data-testid="sheet-everyone"
        className={cn(
          "flex min-h-20 w-full items-center gap-4 rounded-md border px-4 py-3 text-left text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
          draft.everyone ? "border-foreground bg-foreground text-background" : "border-input bg-background",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md border-2",
            draft.everyone ? "border-background" : "border-input",
          )}
        >
          {draft.everyone ? <Check className="size-5" /> : null}
        </span>
        Yes, everyone who decides will be there
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- After the door

export function AddressScreen({
  draft,
  formRef,
  apiKey,
  onPicked,
}: {
  draft: SheetDraft;
  formRef: RefObject<HTMLFormElement | null>;
  apiKey: string | null;
  onPicked: (picked: PickedAddress | null) => void;
}) {
  return (
    <form ref={formRef} onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-3">
      <AddressField
        apiKey={apiKey}
        leadId={draft.leadId}
        fallbackNeighbourhood={draft.neighbourhood || null}
        onPicked={onPicked}
        defaults={{
          addressLine: draft.address_line,
          city: draft.city,
          postalCode: draft.postal_code || null,
          lat: draft.lat,
          lng: draft.lng,
          placeId: draft.place_id,
          positionSource: draft.position_source,
          accuracy: draft.position_accuracy_m,
        }}
      />
    </form>
  );
}

export function SoffitScreen({ draft, onChange }: { draft: SheetDraft; onChange: Change }) {
  return (
    <div className="flex flex-col gap-4">
      <AnswerGroup
        name="sheet-soffit"
        legend="Soffit colour"
        options={SOFFIT_OPTIONS}
        columns={2}
        value={draft.soffit_colour}
        onChange={(next) => onChange({ soffit_colour: next as SoffitColour | null })}
      />
      {draft.soffit_colour === "other" ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="sheet-soffit-note">Which colour?</Label>
          <Input
            id="sheet-soffit-note"
            value={draft.soffit_note}
            maxLength={200}
            onChange={(event) => onChange({ soffit_note: event.target.value })}
          />
        </div>
      ) : null}
      <p className="text-sm text-pretty text-muted-foreground">
        White is the only stock track colour, so off-white matters. Not sure is fine.
      </p>
    </div>
  );
}

export function PhotosScreen({
  draft,
  userId,
  photos,
  onChange,
  onBusyChange,
  skipOpen,
  onSkipOpen,
}: {
  draft: SheetDraft;
  userId: string;
  photos: Partial<Record<PhotoSlot, string>>;
  onChange: Change;
  onBusyChange: (busy: boolean) => void;
  skipOpen: boolean;
  onSkipOpen: () => void;
}) {
  const complete = guidedPhotoCount(draft) >= 3;
  return (
    <div className="flex flex-col gap-4">
      {draft.leadId ? (
        <PhotoSlots
          userId={userId}
          mode="attach"
          leadId={draft.leadId}
          saved={photos}
          onBusyChange={onBusyChange}
          onTakenChange={(slots) => {
            const merged = Array.from(new Set([...draft.photo_slots, ...slots]));
            if (merged.length !== draft.photo_slots.length) onChange({ photo_slots: merged });
          }}
        />
      ) : null}
      {complete ? null : skipOpen || draft.skip ? (
        <div className="flex flex-col gap-3" data-testid="sheet-photo-skip">
          <AnswerGroup
            name="sheet-photos-skipped"
            legend="Why can't you get them?"
            options={PHOTO_SKIP_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            value={draft.skip}
            onChange={(next) => onChange({ skip: next as PhotoSkip | null })}
          />
          {draft.skip === "other" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="sheet-photos-skip-note">Say why</Label>
              <Input
                id="sheet-photos-skip-note"
                value={draft.skip_note}
                maxLength={300}
                onChange={(event) => onChange({ skip_note: event.target.value })}
              />
            </div>
          ) : null}
        </div>
      ) : (
        <Button type="button" variant="link" size="sm" className="self-start px-0" onClick={onSkipOpen}>
          Can&apos;t get the photos?
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Book

export function BookScreen({
  draft,
  name,
  when,
  warnings,
  onFix,
}: {
  draft: SheetDraft;
  name: string;
  when: string;
  warnings: string[];
  onFix: (screen: SheetScreen) => void;
}) {
  const guided = guidedPhotoCount(draft);
  const items = [
    ...leadReadiness(readinessLead(draft), guided).map((item) => ({
      key: item.key as string,
      label: item.label,
      ok:
        item.key === "photos"
          ? guided >= 3 || (draft.skip !== null && (draft.skip !== "other" || draft.skip_note.trim() !== ""))
          : item.ok,
      done:
        item.key === "photos" && guided < 3 && draft.skip
          ? `Photos skipped: ${PHOTO_SKIP_OPTIONS.find((option) => option.value === draft.skip)?.label ?? ""}`
          : null,
    })),
    { key: "everyone_deciding_present", label: "Everyone who decides will be there", ok: draft.everyone, done: null },
  ];
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-md border bg-card px-4 py-3" data-testid="sheet-summary">
        <p className="text-lg font-bold text-balance">{name}</p>
        <p className="text-sm text-muted-foreground">
          {[draft.address_line, draft.neighbourhood].filter(Boolean).join(", ") || "No address yet"}
          {draft.phone ? ` · ${formatPhone(draft.phone) || draft.phone}` : ""}
        </p>
        <p className="mt-2 text-base font-semibold">{when}</p>
      </div>

      <section aria-labelledby="sheet-ready-heading" className="flex flex-col gap-2">
        <h3 id="sheet-ready-heading" className="text-base font-bold">
          Before you book
        </h3>
        <ul className="flex flex-col divide-y rounded-md border" data-testid="readiness">
          {items.map((item) => (
            <li key={item.key} className="flex min-h-12 items-center justify-between gap-3 px-3 py-1" data-ok={item.ok ? "yes" : "no"}>
              <span className="flex items-center gap-2 text-sm">
                {item.ok ? (
                  <Check aria-label="Done" className="size-5 shrink-0" />
                ) : (
                  <span aria-label="Missing" className="size-5 shrink-0 rounded-full border-2 border-muted-foreground" />
                )}
                <span className={item.ok ? "" : "font-semibold"}>{item.done ?? item.label}</span>
              </span>
              {!item.ok ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onFix(PROBLEM_SCREENS[item.key] ?? "who")}
                  aria-label={`Fix: ${item.label}`}
                >
                  Fix
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      {warnings.length > 0 ? (
        <div role="status" className="rounded-md border px-4 py-3 text-sm" data-testid="distance-warning">
          {warnings.map((warning) => (
            <p key={warning} className="font-semibold">
              {warning}
            </p>
          ))}
          <p className="text-muted-foreground">You can still book it, or pick another time.</p>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- Existing lead

export function ExistingScreen({
  leads,
  loading,
  onPick,
}: {
  leads: { id: string; name: string; address: string; status: string }[];
  loading: boolean;
  onPick: (leadId: string) => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading your leads.</p>;
  if (leads.length === 0) {
    return <p className="text-sm text-muted-foreground">No New or Follow up leads of yours yet. Go back and add this person instead.</p>;
  }
  return (
    <ul className="flex flex-col divide-y rounded-md border" aria-label="Your leads">
      {leads.map((lead) => (
        <li key={lead.id}>
          <button
            type="button"
            onClick={() => onPick(lead.id)}
            className="flex min-h-14 w-full flex-col justify-center px-4 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-semibold">{lead.name}</span>
            <span className="text-sm text-muted-foreground">
              {lead.address} · {lead.status}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
