"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { findLeadsNear, type DuplicateLead } from "@/app/(app)/app/leads/actions";
import { FieldError } from "@/components/field-error";
import { UseMyPosition } from "@/components/leads/use-my-position";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchAddressSuggestions,
  fetchNearestAddress,
  fetchPickedAddress,
  type AddressSuggestion,
  type NearestAddress,
  type PickedAddress,
} from "@/lib/places";
import { cn } from "@/lib/utils";

export type AddressDefaults = {
  addressLine: string;
  city: string;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  positionSource?: "picked" | "device" | null;
  accuracy?: number | null;
};

// Everything the field holds, as the booking sheet keeps it in its draft.
export type AddressFieldValue = {
  addressLine: string;
  city: string;
  postalCode: string;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  positionSource: "picked" | "device" | null;
  accuracy: number | null;
};

// Picked from the suggestions, or the phone's own position at the door for
// a brand-new street Google doesn't have yet.
type Position = {
  lat: number;
  lng: number;
  placeId: string | null;
  source: "picked" | "device";
  accuracy: number | null;
};

// The address with Google suggestions. Picking a suggestion saves the map
// position in hidden fields; editing the text afterwards drops it, so a
// position never belongs to the wrong address. Without a key, on a site the
// key does not allow, or without signal, it is a plain text box. For a
// brand-new street Google doesn't have yet, "Use where I'm standing" takes
// the phone's own position at the door instead, which typing does not drop.
export function AddressField({
  apiKey,
  defaults,
  fallbackNeighbourhood,
  error,
  onPicked,
  onEdited,
  onValue,
  onWorking,
  onLocateFailed,
  leadId = null,
  linkLeads = true,
  place = "door",
}: {
  apiKey: string | null;
  defaults?: AddressDefaults;
  fallbackNeighbourhood?: string | null;
  error?: string;
  onPicked: (picked: PickedAddress | null) => void;
  // Each change to the typed address or its map position, so the booking
  // sheet knows when its address step is done.
  onEdited?: (value: { addressLine: string; positioned: boolean }) => void;
  // Round 3, for the booking sheet: every change to what the field holds,
  // straight away, so a position or nearest address that lands after the
  // setter moves on still counts; whether it is still finding a position or
  // looking up an address; and why Use where I'm standing found nothing.
  onValue?: (value: AddressFieldValue) => void;
  onWorking?: (working: boolean) => void;
  onLocateFailed?: (title: string) => void;
  leadId?: string | null;
  // Where the person is standing when it's used: a setter at the door, or
  // Keenan at the house for a meeting nobody booked.
  place?: "door" | "house";
  // False inside the booking sheet, where a link would change the page
  // hidden behind it: nearby leads are named as text there.
  linkLeads?: boolean;
}) {
  const listId = useId();
  const [text, setText] = useState(defaults?.addressLine ?? "");
  const [city, setCity] = useState(defaults?.city ?? "");
  const [postalCode, setPostalCode] = useState(defaults?.postalCode ?? "");
  const [position, setPosition] = useState<Position | null>(() =>
    defaults && defaults.lat !== null && defaults.lng !== null
      ? {
          lat: defaults.lat,
          lng: defaults.lng,
          placeId: defaults.placeId,
          source: defaults.positionSource === "device" ? "device" : "picked",
          accuracy: defaults.accuracy ?? null,
        }
      : null,
  );
  const [nearby, setNearby] = useState<(DuplicateLead & { metres: number })[]>([]);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [unavailable, setUnavailable] = useState(!apiKey);
  const [picking, setPicking] = useState(false);
  // After "Use where I'm standing" (round 3): the nearest address Google
  // knows, filled in for the setter to check, or offered when something is
  // already typed.
  const [nearest, setNearest] = useState<{ state: "looking" | "filled" | "offered" | "none"; address: NearestAddress | null } | null>(null);
  const [locating, setLocating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const report = useRef({ onValue, onWorking });
  useEffect(() => {
    report.current = { onValue, onWorking };
  });
  const token = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    const pending = request;
    const wait = timer;
    return () => {
      if (wait.current) clearTimeout(wait.current);
      pending.current?.abort();
    };
  }, []);

  // What the field holds, reported on every change after the first render.
  const reported = useRef(false);
  useEffect(() => {
    if (!reported.current) {
      reported.current = true;
      return;
    }
    report.current.onValue?.({
      addressLine: text,
      city,
      postalCode,
      lat: position?.lat ?? null,
      lng: position?.lng ?? null,
      placeId: position?.placeId ?? null,
      positionSource: position?.source ?? null,
      accuracy: position?.accuracy ?? null,
    });
  }, [text, city, postalCode, position]);
  const working = locating || picking || nearest?.state === "looking";
  useEffect(() => {
    report.current.onWorking?.(working);
  }, [working]);

  function search(value: string) {
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
    if (!apiKey || unavailable || value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      token.current ??= crypto.randomUUID();
      const abort = new AbortController();
      request.current = abort;
      try {
        const found = await fetchAddressSuggestions(apiKey, value.trim(), token.current, abort.signal);
        if (abort.signal.aborted) return;
        setSuggestions(found);
        setOpen(found.length > 0);
        setActive(-1);
      } catch {
        if (abort.signal.aborted) return;
        setUnavailable(true);
        setSuggestions([]);
        setOpen(false);
      }
    }, 250);
  }

  function onChange(value: string) {
    setText(value);
    if (nearest?.state === "offered") setNearest(null);
    const dropped = position?.source === "picked";
    if (dropped) {
      setPosition(null);
      onPicked(null);
    }
    onEdited?.({ addressLine: value, positioned: !dropped && position !== null });
    search(value);
  }

  function useDevicePosition(found: { lat: number; lng: number; accuracy: number }) {
    // The position is taken, so the suggestions close and any search still
    // on its way is dropped; left open, they cover what comes next.
    if (timer.current) clearTimeout(timer.current);
    request.current?.abort();
    setSuggestions([]);
    setOpen(false);
    setPosition({ lat: found.lat, lng: found.lng, placeId: null, source: "device", accuracy: found.accuracy });
    onEdited?.({ addressLine: text, positioned: true });
    // The result where it belongs, by the address, brought into view.
    window.requestAnimationFrame(() => hintRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    findLeadsNear(found.lat, found.lng, leadId).then(setNearby, () => setNearby([]));
    void fillNearest(found.lat, found.lng);
  }

  // The nearest street address, filled in when the box is empty (the setter
  // checks the house number), or offered when something is already typed.
  // Without a key or signal the position still saves and the box is theirs.
  async function fillNearest(lat: number, lng: number) {
    if (!apiKey) {
      setNearest({ state: "none", address: null });
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    setNearest({ state: "looking", address: null });
    try {
      const address = await fetchNearestAddress(apiKey, lat, lng, fallbackNeighbourhood);
      if (!address) {
        setNearest({ state: "none", address: null });
        return;
      }
      const typed = inputRef.current?.value.trim() ?? "";
      if (typed === "") {
        applyNearest(address);
      } else {
        setNearest({ state: "offered", address });
      }
    } catch {
      setNearest({ state: "none", address: null });
    }
  }

  function applyNearest(address: NearestAddress) {
    setText(address.addressLine);
    setCity(address.city);
    setPostalCode(address.postalCode ?? "");
    setNearest({ state: "filled", address });
    onEdited?.({ addressLine: address.addressLine, positioned: true });
  }

  async function pick(suggestion: AddressSuggestion) {
    const session = token.current;
    if (!apiKey || !session) return;
    setOpen(false);
    setPicking(true);
    try {
      const picked = await fetchPickedAddress(apiKey, suggestion.placeId, session, fallbackNeighbourhood);
      setText(picked.addressLine);
      setCity(picked.city);
      setPostalCode(picked.postalCode ?? "");
      setPosition({ lat: picked.lat, lng: picked.lng, placeId: picked.placeId, source: "picked", accuracy: null });
      setNearby([]);
      onPicked(picked);
      onEdited?.({ addressLine: picked.addressLine, positioned: true });
    } catch {
      setUnavailable(true);
    } finally {
      token.current = null;
      setPicking(false);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === "Enter" && active >= 0) {
      event.preventDefault();
      void pick(suggestions[active]);
    } else if (event.key === "Escape") {
      // Closes only the suggestions, not a booking sheet or pop-up around them.
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
  }

  const where = place === "house" ? "this device at the house" : "this phone at the door";
  const hint = picking
    ? "Getting the map position."
    : position?.source === "device"
      ? `Position saved from ${where}, accurate to about ${Math.round(position.accuracy ?? 0)} m.`
      : position
        ? "Map position saved."
      : unavailable
        ? "Suggestions aren't available here. The typed address still saves."
        : text.trim()
          ? "Pick the address from the suggestions to save its map position."
          : "Start typing the street address.";

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="lead-address">Address</Label>
      <div className="relative">
        <Input
          ref={inputRef}
          id="lead-address"
          name="address_line"
          value={text}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby="lead-address-hint lead-address-error"
        />
        {open ? (
          <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-sm">
            <ul id={listId} role="listbox" aria-label="Address suggestions">
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.placeId}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => void pick(suggestion)}
                  className={cn(
                    "flex min-h-12 cursor-pointer flex-col justify-center border-b px-3 py-2 last:border-b-0",
                    index === active && "bg-muted",
                  )}
                >
                  <span className="font-semibold">{suggestion.main}</span>
                  {suggestion.secondary ? (
                    <span className="text-sm text-muted-foreground">{suggestion.secondary}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">Powered by Google</p>
          </div>
        ) : null}
      </div>
      {/* A saved position is said with a tick, so success is as plain as
          a failure (round 3). */}
      <p
        ref={hintRef}
        id="lead-address-hint"
        className={cn("text-sm text-pretty", position && !picking ? "flex gap-1.5 font-semibold text-foreground" : "text-muted-foreground")}
      >
        {position && !picking ? <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : null}
        <span>{hint}</span>
      </p>
      {position?.source === "device" && nearest ? (
        <div role="status" className="text-sm text-pretty" data-testid="nearest-address" data-state={nearest.state}>
          {nearest.state === "looking" ? <p className="text-muted-foreground">Looking up the nearest address.</p> : null}
          {nearest.state === "filled" && nearest.address ? (
            <p className="font-semibold">
              {nearest.address.exact
                ? "Filled in the nearest address Google knows. Check the house number is this house."
                : "Google only knows the street here. Add the house number."}
            </p>
          ) : null}
          {nearest.state === "offered" && nearest.address ? (
            <div className="flex flex-wrap items-center gap-x-3">
              <p>
                Nearest address: <span className="font-semibold">{nearest.address.addressLine}</span>
              </p>
              <button
                type="button"
                className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
                onClick={() => nearest.address && applyNearest(nearest.address)}
              >
                Use it
              </button>
            </div>
          ) : null}
          {nearest.state === "none" && text.trim() === "" ? <p className="font-semibold">Type the house number and street.</p> : null}
        </div>
      ) : null}
      <FieldError id="lead-address-error" message={error} />
      <input type="hidden" name="city" value={city} />
      <input type="hidden" name="postal_code" value={postalCode} />
      <input type="hidden" name="lat" value={position ? String(position.lat) : ""} />
      <input type="hidden" name="lng" value={position ? String(position.lng) : ""} />
      <input type="hidden" name="place_id" value={position?.placeId ?? ""} />
      <input type="hidden" name="position_source" value={position?.source ?? ""} />
      <input type="hidden" name="position_accuracy_m" value={position?.accuracy !== null && position?.accuracy !== undefined ? String(position.accuracy) : ""} />
      {position?.source !== "picked" && !picking ? (
        <div className="flex flex-col gap-1">
          {!position ? (
            <p className="text-sm text-muted-foreground">
              Brand-new street Google doesn&apos;t have yet? {place === "house" ? "At the house:" : "At the door:"}
            </p>
          ) : null}
          <UseMyPosition
            onPosition={useDevicePosition}
            onFinding={setLocating}
            onFailed={onLocateFailed}
            label={position ? "Take the position again" : "Use where I'm standing"}
            place={place}
          />
        </div>
      ) : null}
      {nearby.length > 0 ? (
        <div role="status" className="rounded-md border border-foreground/60 px-4 py-3 text-sm">
          <p className="font-semibold">Another lead is very close to here.</p>
          <ul className="mt-1 flex flex-col">
            {nearby.map((lead) => (
              <li key={lead.id}>
                {linkLeads ? (
                  <Link href={`/app/leads/${lead.id}`} className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">
                    {lead.name}
                  </Link>
                ) : (
                  <span className="font-semibold">{lead.name}</span>
                )}
                <span className="block text-muted-foreground">
                  About {lead.metres} m away. {lead.status}, added by {lead.addedBy} on {lead.addedOn}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
