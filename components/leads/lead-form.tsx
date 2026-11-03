"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useActionState, useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  findLeadsAtPlace,
  type DuplicateLead,
  type LeadFormState,
} from "@/app/(app)/app/leads/actions";
import { ActionMessage } from "@/components/action-message";
import { FieldError } from "@/components/field-error";
import { AddressField, type AddressDefaults } from "@/components/leads/address-field";
import { ChoiceGroup } from "@/components/leads/choice-group";
import { bookingRuledOut, LeadQuestions, type QuestionDefaults } from "@/components/leads/find-out-fields";
import { PhotoPicker } from "@/components/leads/photo-picker";
import { PhotoSlots } from "@/components/leads/photo-slots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { Textarea } from "@/components/ui/textarea";
import type { PhotoSlot } from "@/lib/leads/door";
import { defaultsFromDraft, draftFromFormData, draftHasContent, draftKey, draftPhotoPaths, readDraft } from "@/lib/leads/draft";
import { QUESTION_LABELS, type CountedQuestion } from "@/lib/leads/questions";
import { ANSWER_OR_NOT_COLLECTED, leadFormDataToInput, unansweredQuestions, type LeadFormErrors } from "@/lib/leads/schema";
import { PHOTO_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import {
  HOUSE_TYPE_OPTIONS,
  SOURCE_OPTIONS,
  type HouseType,
  type LeadSource,
} from "@/lib/leads/status";
import type { PickedAddress } from "@/lib/places";

export type LeadFormDefaults = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  neighbourhood: string;
  house_type: HouseType | null;
  // The answers as the form holds them: a choice, Not collected, or nothing.
  questions: QuestionDefaults;
  phone_not_collected: boolean;
  soffit_note: string;
  notes: string;
  source: LeadSource;
  address: AddressDefaults;
};

const initialState: LeadFormState = {};

const NOTHING_FOUND_OUT: QuestionDefaults = {
  owns_home: null,
  wants_price: null,
  both_decision_makers: null,
  soffit_colour: null,
  christmas_lights_now: null,
  looked_into_before: null,
  areas_wanted: null,
  install_timing: null,
};

// One screen for a new lead at the door, and the same form for editing.
// It needs a first name, an address, and every question answered or marked
// Not collected (round 2); the soffit colour and the photos follow the door
// process and are optional. Save sits at the bottom of the screen, within
// reach of a thumb.
export function LeadForm({
  mode,
  action,
  leadId,
  userId,
  mapsKey,
  sessionNeighbourhood,
  defaults,
  cancelHref,
}: {
  mode: "create" | "edit";
  action: (state: LeadFormState, formData: FormData) => Promise<LeadFormState>;
  leadId?: string;
  userId: string;
  mapsKey: string | null;
  sessionNeighbourhood: string | null;
  defaults?: LeadFormDefaults;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const [neighbourhood, setNeighbourhood] = useState(
    defaults?.neighbourhood ?? sessionNeighbourhood ?? "",
  );
  const [neighbourhoodEdited, setNeighbourhoodEdited] = useState(Boolean(defaults?.neighbourhood));
  // A new lead's draft (2026-11-03): kept on the phone while it is typed, so
  // a reload after the camera or a stray tap doesn't lose the door.
  const drafting = mode === "create";
  const storageKey = draftKey(userId);
  const formRef = useRef<HTMLFormElement>(null);
  const pendingRef = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const [restored, setRestored] = useState<{
    defaults: LeadFormDefaults;
    photos: Partial<Record<PhotoSlot, { path: string; preview: string }>>;
    extraPhotos: number;
  } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [discardOpen, setDiscardOpen] = useState(false);
  const shown = restored?.defaults ?? defaults;
  const [slotsBusy, setSlotsBusy] = useState(false);
  const [extrasBusy, setExtrasBusy] = useState(false);
  const photosBusy = slotsBusy || extrasBusy;
  const [duplicates, setDuplicates] = useState<DuplicateLead[]>([]);
  // The questions still open, once Save was tapped with some open: checked
  // before sending, and updated as they're answered.
  const [openNow, setOpenNow] = useState<CountedQuestion[] | null>(null);
  // Save and book steps back while the answers rule booking out (a phone or
  // a booking question Not collected, a No or a Not yet): the sheet would
  // hold a time it can't book.
  const [bookingBlocked, setBookingBlocked] = useState<boolean | null>(null);
  const markRestRef = useRef<(() => void) | null>(null);
  const blocked =
    bookingBlocked ??
    bookingRuledOut(shown?.questions ?? NOTHING_FOUND_OUT, Boolean(shown?.phone_not_collected) && !(shown?.phone ?? "").trim());
  const openErrors: LeadFormErrors = Object.fromEntries((openNow ?? []).map((question) => [question, ANSWER_OR_NOT_COLLECTED]));
  const errors: LeadFormErrors = { ...(state.errors ?? {}), ...openErrors };
  const openCount = openNow?.length ?? 0;

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Saved while typing, and at once when the phone hides the page (the
  // camera opening, another app). Never while the lead is being sent; the
  // page the save lands on clears it.
  const saveNow = useCallback(() => {
    if (!drafting || pendingRef.current || !formRef.current) return;
    const draft = draftFromFormData(new FormData(formRef.current), Date.now());
    try {
      if (draftHasContent(draft)) localStorage.setItem(storageKey, JSON.stringify(draft));
      else localStorage.removeItem(storageKey);
    } catch {
      // Private browsing or full storage: the form still works.
    }
  }, [drafting, storageKey]);
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(saveNow, 300);
  }, [saveNow]);

  useEffect(() => {
    if (!drafting) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") saveNow();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", saveNow);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", saveNow);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [drafting, saveNow]);

  // A photo's path is a hidden field once it has uploaded.
  useEffect(() => {
    if (!photosBusy) scheduleSave();
  }, [photosBusy, scheduleSave]);

  // Brings a draft back once, when New lead opens.
  useEffect(() => {
    if (!drafting) return;
    let cancelled = false;
    async function bringBack() {
      let raw: string | null = null;
      try {
        raw = localStorage.getItem(storageKey);
      } catch {
        return;
      }
      const draft = readDraft(raw, Date.now());
      if (!draft) return;
      const paths = Object.entries(draftPhotoPaths(draft)) as [PhotoSlot, string][];
      const photos: Partial<Record<PhotoSlot, { path: string; preview: string }>> = {};
      if (paths.length > 0) {
        const { data } = await createClient()
          .storage.from(PHOTO_BUCKET)
          .createSignedUrls(paths.map(([, path]) => path), 3600)
          .catch(() => ({ data: null }));
        for (const [slot, path] of paths) {
          const signed = data?.find((item) => item.path === path)?.signedUrl;
          if (signed) photos[slot] = { path, preview: signed };
        }
      }
      if (cancelled) return;
      const restoredDefaults = defaultsFromDraft(draft);
      setRestored({ defaults: restoredDefaults, photos, extraPhotos: draft.extraPhotos });
      setBookingBlocked(null);
      setNeighbourhood(restoredDefaults.neighbourhood || sessionNeighbourhood || "");
      setNeighbourhoodEdited(Boolean(restoredDefaults.neighbourhood));
      setFormKey((key) => key + 1);
      // A reload can reopen the page mid-form: show the notice first.
      requestAnimationFrame(() => window.scrollTo({ top: 0 }));
    }
    void bringBack();
    return () => {
      cancelled = true;
    };
  }, [drafting, storageKey, sessionNeighbourhood]);

  function startOver() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Nothing kept, nothing to clear.
    }
    setRestored(null);
    setDuplicates([]);
    setOpenNow(null);
    setBookingBlocked(null);
    setNeighbourhood(sessionNeighbourhood ?? "");
    setNeighbourhoodEdited(false);
    setFormKey((key) => key + 1);
  }

  // X leaves at once when nothing is entered; otherwise it asks first.
  function leave() {
    const form = formRef.current;
    if (form && draftHasContent(draftFromFormData(new FormData(form), Date.now()))) {
      setDiscardOpen(true);
      return;
    }
    router.push(cancelHref);
  }

  function discard() {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // Nothing kept.
    }
    setDiscardOpen(false);
    router.push(cancelHref);
  }

  function onPicked(picked: PickedAddress | null) {
    if (!picked) {
      setDuplicates([]);
      return;
    }
    if (!neighbourhoodEdited && picked.neighbourhood) setNeighbourhood(picked.neighbourhood);
    findLeadsAtPlace(picked.placeId, leadId ?? null).then(setDuplicates, () => setDuplicates([]));
    scheduleSave();
  }

  // Submitting through a transition keeps everything typed if the server
  // sends back a correction. A question with neither an answer nor Not
  // collected stops it first, and the first one comes into view.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const form = event.currentTarget;
    const formData = new FormData(form, submitter);
    const open = unansweredQuestions(leadFormDataToInput(formData));
    setOpenNow(open.length > 0 ? open : null);
    if (open.length > 0) {
      const first = form.querySelector<HTMLElement>(open[0] === "phone" ? "#lead-phone" : `[data-question="${open[0]}"] input`);
      first?.scrollIntoView({ block: "center" });
      first?.focus({ preventScroll: true });
      return;
    }
    startTransition(() => formAction(formData));
  }

  return (
    <form
      key={formKey}
      ref={formRef}
      onSubmit={onSubmit}
      onChange={drafting ? scheduleSave : undefined}
      noValidate
      className="flex flex-col gap-6 pb-36"
    >
      {leadId ? <input type="hidden" name="id" value={leadId} /> : null}

      {restored ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-x-3 rounded-md border border-primary bg-accent px-4 py-1 text-sm text-accent-foreground"
          data-testid="draft-restored"
        >
          <span className="py-2 text-pretty">
            Brought back what you entered before the page closed.
            {restored.extraPhotos > 0
              ? ` Add the ${restored.extraPhotos === 1 ? "extra photo" : `${restored.extraPhotos} extra photos`} again.`
              : ""}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={startOver}>
            Start over
          </Button>
        </div>
      ) : null}

      <AddressField
        apiKey={mapsKey}
        defaults={shown?.address}
        fallbackNeighbourhood={sessionNeighbourhood}
        error={errors.address_line}
        onPicked={onPicked}
        leadId={leadId ?? null}
      />

      {duplicates.length > 0 ? (
        <div
          role="status"
          className="rounded-md border border-foreground/60 px-4 py-3 text-sm"
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
            defaultValue={shown?.first_name}
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
            defaultValue={shown?.last_name}
            autoComplete="off"
            autoCapitalize="words"
            aria-invalid={errors.last_name ? true : undefined}
          />
          <FieldError id="lead-last_name-error" message={errors.last_name} />
        </div>
      </div>

      <LeadQuestions
        defaults={shown?.questions ?? NOTHING_FOUND_OUT}
        phone={shown?.phone ?? ""}
        phoneNotCollected={shown?.phone_not_collected ?? false}
        soffitNote={shown?.soffit_note ?? ""}
        errors={errors}
        onOpenChange={(open) => setOpenNow((current) => (current === null ? null : open.length > 0 ? open : null))}
        onBookingChange={setBookingBlocked}
        markRestRef={markRestRef}
      />

      {mode === "create" ? (
        <section aria-labelledby="photos-heading" className="flex flex-col gap-3">
          <h2 id="photos-heading" className="text-lg font-bold">
            Photos
          </h2>
          <PhotoSlots userId={userId} mode="form" onBusyChange={setSlotsBusy} initial={restored?.photos} />
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
        defaultValue={shown?.house_type}
        error={errors.house_type}
      />

      <div className="flex flex-col gap-2">
        <Label htmlFor="lead-notes">Notes</Label>
        <Textarea id="lead-notes" name="notes" rows={3} defaultValue={shown?.notes} />
        <FieldError id="lead-notes-error" message={errors.notes} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="lead-email">Email</Label>
        <Input
          id="lead-email"
          name="email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="off"
          defaultValue={shown?.email}
          aria-invalid={errors.email ? true : undefined}
        />
        <FieldError id="lead-email-error" message={errors.email} />
      </div>

      <ChoiceGroup
        name="source"
        legend="Where the lead came from"
        options={SOURCE_OPTIONS}
        defaultValue={shown?.source ?? "door"}
        error={errors.source}
      />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:left-20">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
          {openCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-x-3">
              <p role="alert" className="text-sm font-medium text-pretty text-destructive" data-testid="questions-still-open">
                {openCount === 1
                  ? `${QUESTION_LABELS[(openNow ?? [])[0]]} needs an answer, or mark it Not collected.`
                  : `${openCount} questions need an answer, or mark them Not collected.`}
              </p>
              <Button type="button" variant="link" size="sm" className="px-0" onClick={() => markRestRef.current?.()} data-testid="mark-rest-by-save">
                Mark the rest Not collected
              </Button>
            </div>
          ) : (
            <ActionMessage text={state.error} />
          )}
          {mode === "create" && blocked && openCount === 0 && !state.error ? (
            <p className="text-sm text-pretty text-muted-foreground" data-testid="booking-ruled-out">
              Booking needs a number and a Yes for owns the home, wants a price and everyone who decides, so this one saves as a lead.
            </p>
          ) : null}
          {mode === "create" ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="lg" className="w-12 shrink-0 px-0" aria-label="Cancel" onClick={leave}>
                <X aria-hidden="true" />
              </Button>
              <Button
                type="submit"
                name="intent"
                value="save"
                variant={blocked ? "default" : "outline"}
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
                variant={blocked ? "outline" : "default"}
                size="lg"
                className="flex-1 px-3"
                disabled={pending || photosBusy || blocked}
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

      <DialogPanel
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="Discard this lead?"
        testId="discard-lead"
        actions={
          <>
            <Button type="button" variant="outline" onClick={discard}>
              Discard
            </Button>
            <Button type="button" onClick={() => setDiscardOpen(false)}>
              Keep going
            </Button>
          </>
        }
      >
        <p className="text-base text-pretty">What you&apos;ve entered isn&apos;t saved yet. Discarding clears it from this phone.</p>
      </DialogPanel>
    </form>
  );
}
