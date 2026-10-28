"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FieldError } from "@/components/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchAddressSuggestions,
  fetchPickedAddress,
  type AddressSuggestion,
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
};

type Position = { lat: number; lng: number; placeId: string | null };

// The address with Google suggestions. Picking a suggestion saves the map
// position in hidden fields; editing the text afterwards drops it, so a
// position never belongs to the wrong address. Without a key, on a site the
// key does not allow, or without signal, it is a plain text box.
export function AddressField({
  apiKey,
  defaults,
  fallbackNeighbourhood,
  error,
  onPicked,
}: {
  apiKey: string | null;
  defaults?: AddressDefaults;
  fallbackNeighbourhood?: string | null;
  error?: string;
  onPicked: (picked: PickedAddress | null) => void;
}) {
  const listId = useId();
  const [text, setText] = useState(defaults?.addressLine ?? "");
  const [city, setCity] = useState(defaults?.city ?? "");
  const [postalCode, setPostalCode] = useState(defaults?.postalCode ?? "");
  const [position, setPosition] = useState<Position | null>(() =>
    defaults && defaults.lat !== null && defaults.lng !== null
      ? { lat: defaults.lat, lng: defaults.lng, placeId: defaults.placeId }
      : null,
  );
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [unavailable, setUnavailable] = useState(!apiKey);
  const [picking, setPicking] = useState(false);
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
    if (position) {
      setPosition(null);
      onPicked(null);
    }
    search(value);
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
      setPosition({ lat: picked.lat, lng: picked.lng, placeId: picked.placeId });
      onPicked(picked);
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
      setOpen(false);
    }
  }

  const hint = picking
    ? "Getting the map position."
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
      <p
        id="lead-address-hint"
        className={cn("text-sm", position ? "text-foreground" : "text-muted-foreground")}
      >
        {hint}
      </p>
      <FieldError id="lead-address-error" message={error} />
      <input type="hidden" name="city" value={city} />
      <input type="hidden" name="postal_code" value={postalCode} />
      <input type="hidden" name="lat" value={position ? String(position.lat) : ""} />
      <input type="hidden" name="lng" value={position ? String(position.lng) : ""} />
      <input type="hidden" name="place_id" value={position?.placeId ?? ""} />
    </div>
  );
}
