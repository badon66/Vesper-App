"use client";

import { Plus, X } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { findLeadsAtPlace, type DuplicateLead } from "@/app/(app)/app/leads/actions";
import {
  searchLeadsForMeeting,
  startMeetingForNewPerson,
  type LeadMatch,
  type NewPersonState,
} from "@/app/(app)/app/(owner)/meetings/actions";
import { FieldError } from "@/components/field-error";
import { AddressField } from "@/components/leads/address-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitKeepingValues } from "@/lib/forms/submit";

// Start a meeting (Keenan, 2026-11-02), for someone not booked through the
// schedule: find their lead, or add them with a name and an address, and
// go straight into meeting mode. It opens on the page rather than in a
// pop-up, so the address suggestions and the iPad's keyboard have room,
// and the meeting lists step aside while it is open.
export function StartMeeting({ mapsKey, children }: { mapsKey: string | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Meetings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tonight and what&apos;s booked after it. Start opens meeting mode.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          aria-expanded={open}
          aria-controls="start-a-meeting"
          onClick={() => setOpen((current) => !current)}
        >
          {open ? <X aria-hidden="true" /> : <Plus aria-hidden="true" />}
          {open ? "Close" : "Start a meeting"}
        </Button>
      </div>
      {open ? <StartPanel mapsKey={mapsKey} /> : children}
    </div>
  );
}

const initialState: NewPersonState = {};

function StartPanel({ mapsKey }: { mapsKey: string | null }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LeadMatch[] | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const latest = useRef(0);
  const [neighbourhood, setNeighbourhood] = useState("");
  // New lead's own check: a house that already has a lead.
  const [sameHouse, setSameHouse] = useState<DuplicateLead[]>([]);
  // The gold goes to the next step: a found lead's Start, until a new
  // person's name is typed.
  const [hasName, setHasName] = useState(false);
  const foundSome = Boolean(results && results.length > 0);
  const [state, formAction, pending] = useActionState(async (previous: NewPersonState, formData: FormData) => {
    try {
      return await startMeetingForNewPerson(previous, formData);
    } catch {
      return { error: "No signal. They weren't added. Try again once you have signal." };
    }
  }, initialState);

  // Search as Keenan types, keeping only the newest answer.
  useEffect(() => {
    const asked = ++latest.current;
    const timer = window.setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults(null);
        setSearchError(null);
        return;
      }
      try {
        const answer = await searchLeadsForMeeting(query);
        if (asked !== latest.current) return;
        if (answer.ok) {
          setResults(answer.leads);
          setSearchError(null);
        } else {
          setSearchError(answer.error);
        }
      } catch {
        if (asked === latest.current) setSearchError("No signal. The search needs it.");
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Added: straight into meeting mode, with a full page load so the iPad
  // keeps the meeting for a reload without signal.
  useEffect(() => {
    if (state.leadId) window.location.assign(new URL(`/meeting/${state.leadId}#start`, window.location.origin).href);
  }, [state.leadId]);

  return (
    <section
      id="start-a-meeting"
      aria-label="Start a meeting"
      className="flex flex-col gap-6 rounded-xl border p-4 sm:p-6"
      data-testid="start-a-meeting"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="meeting-search">Find their lead</Label>
        <Input
          id="meeting-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Name, address or phone"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {searchError ? (
          <p role="alert" className="text-sm font-semibold">
            {searchError}
          </p>
        ) : null}
        {results && results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No lead matches. Add them below as someone new.</p>
        ) : null}
        {results && results.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-md border" aria-label="Matching leads">
            {results.map((lead) => (
              <li key={lead.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold">{lead.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {lead.address}
                    {lead.address ? " · " : ""}
                    {lead.status}
                  </p>
                </div>
                <Button asChild variant="outline" className="min-h-11 px-6">
                  <a href={`/meeting/${lead.id}#start`} aria-label={`Start the meeting with ${lead.name}`}>
                    Start
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <form onSubmit={submitKeepingValues(formAction)} noValidate className="flex flex-col gap-4 border-t pt-6">
        <h2 className="text-base font-semibold">Or someone new</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="start-first-name">First name</Label>
            <Input
              id="start-first-name"
              name="first_name"
              autoComplete="off"
              onChange={(event) => setHasName(event.target.value.trim() !== "")}
              aria-invalid={state.errors?.first_name ? true : undefined}
              aria-describedby={state.errors?.first_name ? "start-first-name-error" : undefined}
            />
            <FieldError id="start-first-name-error" message={state.errors?.first_name} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="start-last-name">Last name (if they gave it)</Label>
            <Input id="start-last-name" name="last_name" autoComplete="off" />
            <FieldError id="start-last-name-error" message={state.errors?.last_name} />
          </div>
        </div>
        <AddressField
          apiKey={mapsKey}
          error={state.errors?.address_line}
          place="house"
          onPicked={(picked) => {
            setNeighbourhood(picked?.neighbourhood ?? "");
            setSameHouse([]);
            if (picked?.placeId) findLeadsAtPlace(picked.placeId, null).then(setSameHouse, () => setSameHouse([]));
          }}
        />
        <input type="hidden" name="neighbourhood" value={neighbourhood} />
        {sameHouse.length > 0 ? (
          <div role="status" className="flex flex-col gap-2 rounded-md border border-foreground/60 px-4 py-3 text-sm">
            <p className="font-semibold">This address already has a lead. Start with it instead, so it stays with its setter:</p>
            <ul className="flex flex-col gap-2">
              {sameHouse.map((lead) => (
                <li key={lead.id} className="flex flex-wrap items-center justify-between gap-3">
                  <span>
                    {lead.name}, {lead.status}, added by {lead.addedBy} on {lead.addedOn}
                  </span>
                  <Button asChild variant="outline" className="min-h-11 px-6">
                    <a href={`/meeting/${lead.id}#start`} aria-label={`Start the meeting with ${lead.name}`}>
                      Start
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {state.error && !state.errors ? (
          <p role="alert" className="text-sm font-semibold text-destructive">
            {state.error}
          </p>
        ) : null}
        <Button
          type="submit"
          size="lg"
          variant={foundSome && !hasName ? "outline" : "default"}
          className="self-start sm:self-end"
          disabled={pending || Boolean(state.leadId)}
        >
          {pending || state.leadId ? "Opening meeting mode" : "Add them and start"}
        </Button>
      </form>
    </section>
  );
}
