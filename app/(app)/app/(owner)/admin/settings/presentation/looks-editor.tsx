"use client";

import { ArrowDown, ArrowUp, Check, ChevronDown, CircleAlert, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LitHouse } from "@/components/drawings/lit-house";
import { useBoxSize } from "@/components/lights/light-canvas";
import { FieldError } from "@/components/field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MAX_ACTIVE_LOOKS, MAX_LOOK_COLOURS, WORD_LIMITS, type Effect, type Look } from "@/lib/deck";
import { WARM_WHITE } from "@/lib/lights/looks";
import { smartApostrophes } from "@/lib/typography";
import {
  blankLook,
  isDraftLook,
  isHex,
  LOOK_ROW,
  MAX_LOOKS,
  nameLength,
  normaliseHex,
  OPENING_LOOK_KEY,
  type LookField,
  type LookIssues,
  type LooksIssues,
} from "@/lib/settings/deck-schema";
import { cn } from "@/lib/utils";
import { DraftTag } from "./page-words";

// The light picker's looks in Settings (round 7, light_picker.controls):
// a name, colour words, one to four light colours (a hex and a plain name
// each), lights per block, on or off, and the order. At most 6 on. Beside
// them, a live preview on the shared house drawing, the row of buttons as
// the meeting draws it, and Keenan's iPad setup note. No swatches: the lit
// house is the swatch.

export const lookFieldKey = (key: string, field: LookField) => `look.${key}.${field}`;
export const lookFieldId = (key: string, field: LookField) => `look-${key}-${field.replace(/\./g, "-")}`;

type Props = {
  looks: Look[];
  onLooks: (update: (looks: Look[]) => Look[]) => void;
  issues: LooksIssues;
  wrap: Record<string, LookIssues>;
  // Whether a field's message is due (touched, or a save was tried).
  due: (fieldKey: string) => boolean;
  onBlur: (fieldKey: string) => void;
  openKey: string | null;
  onOpen: (key: string | null) => void;
  // True for at most a second while the meeting's font loads.
  checking: boolean;
};

export function LooksEditor({ looks, onLooks, issues, wrap, due, onBlur, openKey, onOpen, checking }: Props) {
  const [effect, setEffect] = useState<Exclude<Effect, "off">>("steady");
  const on = looks.filter((look) => look.active).length;
  const previewed = looks.find((look) => look.key === openKey) ?? looks.find((look) => look.active) ?? null;
  const wrapped = looks.filter((look) => wrap[look.key]).map((look) => look.name.trim() || "New look");

  const change = (key: string, update: (look: Look) => Look) =>
    onLooks((previous) => previous.map((look) => (look.key === key ? update(look) : look)));
  const move = (key: string, delta: -1 | 1) =>
    onLooks((previous) => {
      const from = previous.findIndex((look) => look.key === key);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= previous.length) return previous;
      const next = [...previous];
      [next[from], next[to]] = [next[to], next[from]];
      return next;
    });

  return (
    <Card id="looks" data-testid="looks-editor" className="scroll-mt-24">
      <CardHeader>
        <h3 className="text-lg leading-tight font-bold">Looks</h3>
        <CardDescription>
          The buttons under their house, in this order, at most {MAX_ACTIVE_LOOKS} on. Every meeting opens on Warm white, steady.
          Words only on the buttons: the lit house is the swatch.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="flex flex-col gap-3">
          <ol className="flex flex-col gap-2" aria-label="Looks, in order">
            {looks.map((look, at) => (
              <LookItem
                key={look.key}
                look={look}
                at={at}
                count={looks.length}
                open={openKey === look.key}
                onToggle={() => onOpen(openKey === look.key ? null : look.key)}
                onChange={(update) => change(look.key, update)}
                onMove={(delta) => move(look.key, delta)}
                onRemove={() => {
                  onLooks((previous) => previous.filter((item) => item.key !== look.key));
                  onOpen(null);
                }}
                canTurnOn={look.active || on < MAX_ACTIVE_LOOKS}
                issues={issues.looks[look.key] ?? {}}
                wrap={wrap[look.key] ?? {}}
                due={due}
                onBlur={onBlur}
              />
            ))}
          </ol>
          {on >= MAX_ACTIVE_LOOKS ? (
            <p className="text-sm text-muted-foreground">{MAX_ACTIVE_LOOKS} looks are on, the most that fit one row. Turn one off to turn another on.</p>
          ) : null}
          {issues.list ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              {issues.list}
            </p>
          ) : null}
          {wrapped.length > 0 ? (
            <p role="alert" className="text-sm font-semibold text-destructive">
              With {on} {on === 1 ? "look" : "looks"} on, {wrapped.length === 1 ? "this label wraps" : "these labels wrap"} at the meeting:{" "}
              {wrapped.join(", ")}. Shorten {wrapped.length === 1 ? "it" : "them"}, or turn a look off.
            </p>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="self-start"
            disabled={looks.length >= MAX_LOOKS}
            onClick={() => {
              const look = blankLook(looks.map((item) => item.key));
              onLooks((previous) => [...previous, look]);
              onOpen(look.key);
            }}
          >
            <Plus aria-hidden="true" />
            Add a look
          </Button>
          {checking ? (
            <p role="status" className="text-sm text-muted-foreground">
              Checking whether each label fits the meeting&apos;s row.
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <LookPreview look={previewed} effect={effect} onEffect={setEffect} />
          <RowPreview looks={looks} chosenKey={previewed?.key ?? null} />
          <IpadNote />
        </div>
      </CardContent>
    </Card>
  );
}

function LookItem({
  look,
  at,
  count,
  open,
  onToggle,
  onChange,
  onMove,
  onRemove,
  canTurnOn,
  issues,
  wrap,
  due,
  onBlur,
}: {
  look: Look;
  at: number;
  count: number;
  open: boolean;
  onToggle: () => void;
  onChange: (update: (look: Look) => Look) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
  canTurnOn: boolean;
  issues: LookIssues;
  // A label that would wrap shows at once: turning a look on is what causes it.
  wrap: LookIssues;
  due: (fieldKey: string) => boolean;
  onBlur: (fieldKey: string) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const panelId = `look-${look.key}-panel`;
  const title = look.name.trim() || "New look";
  const shown = (field: LookField) => (due(lookFieldKey(look.key, field)) ? issues[field] : undefined) ?? wrap[field];
  const needsLook =
    Object.keys(wrap).length > 0 || Object.keys(issues).some((field) => due(lookFieldKey(look.key, field as LookField)));
  const opening = look.key === OPENING_LOOK_KEY;

  useEffect(() => {
    if (!confirmRemove) return;
    const timer = window.setTimeout(() => setConfirmRemove(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirmRemove]);

  return (
    <li className={cn("rounded-md border", open && "border-foreground")} data-testid="look-row">
      <div className="flex items-center gap-1 p-1.5 pl-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex min-w-0 flex-1 flex-col items-start">
            <span className="flex max-w-full min-w-0 items-center gap-2 font-semibold">
              <span className="truncate">{title}</span>
              {isDraftLook(look) ? <DraftTag /> : null}
              {needsLook ? (
                <>
                  <CircleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
                  <span className="sr-only">needs fixing</span>
                </>
              ) : null}
            </span>
            <span className="max-w-full truncate text-sm text-muted-foreground">{look.words.trim() || "No colour words yet"}</span>
            {opening ? <span className="text-sm text-muted-foreground">Always on: every meeting opens on it.</span> : null}
          </span>
          {/* The edit cue: the row opens to change the look. */}
          <ChevronDown aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground", open && "rotate-180")} />
        </button>
        <div className="flex items-center gap-2 px-1">
          <Switch
            checked={look.active}
            disabled={(opening && look.active) || (!look.active && !canTurnOn)}
            onCheckedChange={(active) => onChange((current) => ({ ...current, active }))}
            aria-label={`${title} on at meetings`}
          />
          <span className="w-7 text-sm font-semibold" aria-hidden="true">
            {look.active ? "On" : "Off"}
          </span>
        </div>
        <Button type="button" variant="ghost" size="icon" disabled={at === 0} onClick={() => onMove(-1)}>
          <ArrowUp aria-hidden="true" />
          <span className="sr-only">Move {title} up</span>
        </Button>
        <Button type="button" variant="ghost" size="icon" disabled={at === count - 1} onClick={() => onMove(1)}>
          <ArrowDown aria-hidden="true" />
          <span className="sr-only">Move {title} down</span>
        </Button>
      </div>
      {open ? (
        <div id={panelId} className="flex flex-col gap-5 border-t p-3">
          {opening ? <p className="text-sm text-muted-foreground">Every meeting opens on this look, so it stays on.</p> : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <CountedInput
              id={lookFieldId(look.key, "name")}
              label="Name"
              value={look.name}
              max={WORD_LIMITS.lookNameChars}
              error={shown("name")}
              onChange={(name) => onChange((current) => ({ ...current, name }))}
              onBlur={() => onBlur(lookFieldKey(look.key, "name"))}
            />
            <CountedInput
              id={lookFieldId(look.key, "words")}
              label="Colour words"
              hint="Under the name, like Red and gold."
              value={look.words}
              max={WORD_LIMITS.lookWordsChars}
              error={shown("words")}
              onChange={(words) => onChange((current) => ({ ...current, words }))}
              onBlur={() => onBlur(lookFieldKey(look.key, "words"))}
            />
          </div>
          <ColoursField look={look} onChange={onChange} shown={shown} onBlur={(field) => onBlur(lookFieldKey(look.key, field))} />
          {look.colours.length > 1 ? (
            <BlockField look={look} onChange={onChange} error={shown("block")} />
          ) : (
            <p className="text-sm text-muted-foreground">One colour, so every light is the same.</p>
          )}
          {!look.active && !opening ? (
            <Button
              type="button"
              variant="ghost"
              className={cn("self-start", confirmRemove ? "font-bold text-destructive" : "text-muted-foreground")}
              onClick={() => (confirmRemove ? onRemove() : setConfirmRemove(true))}
            >
              {confirmRemove ? "Tap again to remove this look" : "Remove this look"}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function CountedInput({
  id,
  label,
  hint,
  value,
  max,
  error,
  onChange,
  onBlur,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  max: number;
  error?: string;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const n = nameLength(value);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <Label htmlFor={id}>{label}</Label>
        <p id={`${id}-count`} className={cn("text-sm tabular-nums", n > max ? "font-semibold text-destructive" : "text-muted-foreground")}>
          {n} of {max}
        </p>
      </div>
      <Input
        id={id}
        value={value}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={[`${id}-count`, hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ")}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={onBlur}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

function ColoursField({
  look,
  onChange,
  shown,
  onBlur,
}: {
  look: Look;
  onChange: (update: (look: Look) => Look) => void;
  shown: (field: LookField) => string | undefined;
  onBlur: (field: LookField) => void;
}) {
  const setColour = (at: number, part: "hex" | "name", value: string) =>
    onChange((current) => ({
      ...current,
      colours: current.colours.map((colour, index) => (index === at ? { ...colour, [part]: value } : colour)),
    }));
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="text-sm font-semibold">Light colours</legend>
      <p className="-mt-1 text-sm text-muted-foreground">
        1 to {MAX_LOOK_COLOURS}, in the order they repeat along the roof. The hex is what is drawn; the name is for you.
      </p>
      {look.colours.map((colour, at) => {
        const hexId = lookFieldId(look.key, `colour.${at}.hex`);
        const nameId = lookFieldId(look.key, `colour.${at}.name`);
        const hexError = shown(`colour.${at}.hex`);
        const nameError = shown(`colour.${at}.name`);
        return (
          <div key={at} className="flex flex-col gap-1">
            <div className="flex items-start gap-2">
              <div className="flex w-32 shrink-0 flex-col gap-1">
                <Label htmlFor={hexId} className="sr-only">
                  Colour {at + 1} hex
                </Label>
                <Input
                  id={hexId}
                  value={colour.hex}
                  placeholder="#FFB46B"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  className="tabular-nums uppercase"
                  aria-invalid={hexError ? true : undefined}
                  aria-describedby={hexError ? `${hexId}-error` : undefined}
                  onChange={(event) => setColour(at, "hex", event.currentTarget.value)}
                  onBlur={() => {
                    if (isHex(colour.hex)) setColour(at, "hex", normaliseHex(colour.hex));
                    onBlur(`colour.${at}.hex`);
                  }}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <Label htmlFor={nameId} className="sr-only">
                  Colour {at + 1} name
                </Label>
                <Input
                  id={nameId}
                  value={colour.name}
                  placeholder="Warm white"
                  autoComplete="off"
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? `${nameId}-error` : undefined}
                  onChange={(event) => setColour(at, "name", event.currentTarget.value)}
                  onBlur={() => onBlur(`colour.${at}.name`)}
                />
              </div>
              {look.colours.length > 1 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onChange((current) => ({ ...current, colours: current.colours.filter((_, index) => index !== at) }))}
                >
                  <X aria-hidden="true" />
                  <span className="sr-only">Remove colour {at + 1}</span>
                </Button>
              ) : null}
            </div>
            <FieldError id={`${hexId}-error`} message={hexError} />
            <FieldError id={`${nameId}-error`} message={nameError} />
          </div>
        );
      })}
      {look.colours.length < MAX_LOOK_COLOURS ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange((current) => ({
              ...current,
              colours: [...current.colours, { hex: "", name: "" }],
              block: current.colours.length === 1 ? 3 : current.block,
            }))
          }
        >
          <Plus aria-hidden="true" className="size-4" />
          Add a colour
        </Button>
      ) : null}
    </fieldset>
  );
}

const BLOCKS = [2, 3, 4, 5, 6] as const;

function BlockField({ look, onChange, error }: { look: Look; onChange: (update: (look: Look) => Look) => void; error?: string }) {
  const name = `look-${look.key}-block`;
  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${name}-error` : `${name}-hint`}>
      <legend className="text-sm font-semibold">Lights of each colour in a row</legend>
      <div className="grid grid-cols-5 gap-2 sm:max-w-sm">
        {BLOCKS.map((block) => (
          <label
            key={block}
            className="group flex min-h-11 cursor-pointer items-center justify-center gap-1 rounded-md border border-input bg-background text-base font-semibold transition-colors has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background"
          >
            <input
              type="radio"
              name={name}
              value={block}
              checked={look.block === block}
              onChange={() => onChange((current) => ({ ...current, block }))}
              className="sr-only"
            />
            <Check aria-hidden="true" className="hidden size-4 shrink-0 group-has-[:checked]:block" />
            {block}
          </label>
        ))}
      </div>
      <p id={`${name}-hint`} className="text-sm text-muted-foreground">
        3 is about 60 cm of each colour, clear from across the room. Single lights of red and green blur into yellow.
      </p>
      <FieldError id={`${name}-error`} message={error} />
    </fieldset>
  );
}

const PREVIEW_EFFECTS: { key: Exclude<Effect, "off">; label: string }[] = [
  { key: "steady", label: "Steady" },
  { key: "twinkle", label: "Twinkle" },
  { key: "chase", label: "Chase" },
];

// The look on the shared house drawing, drawn by the meeting's own light
// renderer at the real spacing. Only colours that are complete are drawn.
function LookPreview({
  look,
  effect,
  onEffect,
}: {
  look: Look | null;
  effect: Exclude<Effect, "off">;
  onEffect: (effect: Exclude<Effect, "off">) => void;
}) {
  const colours = (look?.colours ?? []).filter((colour) => isHex(colour.hex)).map((colour) => ({ hex: normaliseHex(colour.hex), name: colour.name }));
  // Only what is drawn: typing a name never redraws the lights.
  const signature = JSON.stringify(
    look && colours.length > 0
      ? { key: look.key, name: "", words: "", colours, block: colours.length === 1 ? 1 : look.block >= 2 && look.block <= 6 ? look.block : 3, active: true }
      : WARM_WHITE,
  );
  const drawn = useMemo(() => JSON.parse(signature) as Look, [signature]);
  const label = `A drawing of a two-storey house at night, lit in ${look && colours.length > 0 ? look.name.trim() || "this look" : "warm white"}.`;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">
        Preview{look ? `: ${look.name.trim() || "New look"}` : ""}
        {look && colours.length === 0 ? <span className="font-normal text-muted-foreground">, warm white until a colour is complete</span> : null}
      </p>
      <LitHouse look={drawn} effect={effect} playing={effect !== "steady"} label={label} className="aspect-[378/206] w-full rounded-md border" />
      <div role="radiogroup" aria-label="Preview the look" className="grid grid-cols-3 gap-2">
        {PREVIEW_EFFECTS.map((option) => {
          const chosen = option.key === effect;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={chosen}
              onClick={() => onEffect(option.key)}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1 rounded-md border text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                chosen ? "border-foreground bg-foreground text-background" : "border-input bg-background",
              )}
            >
              {chosen ? <Check aria-hidden="true" className="size-4" /> : null}
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// The row of look buttons as the meeting's tray draws it at 1180 wide,
// laid out at full size and then scaled down to fit here, so a label too
// long for the meeting is cut short here too, at a glance.
const ROW_PREVIEW_PAD = 8;

function RowPreview({ looks, chosenKey }: { looks: Look[]; chosenKey: string | null }) {
  const [box, size] = useBoxSize<HTMLDivElement>();
  const [row, rowSize] = useBoxSize<HTMLDivElement>();
  const on = looks.filter((look) => look.active);
  const rowWidth = LOOK_ROW.viewportWidth - 2 * LOOK_ROW.sidePadding;
  const scale = size.width > 0 ? Math.min(1, size.width / rowWidth) : 0;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold">The row at the meeting</p>
      <div
        ref={box}
        className="dark relative overflow-hidden rounded-md border bg-background text-foreground"
        style={{ height: on.length > 0 && scale > 0 ? Math.ceil(rowSize.height * scale) + 2 * ROW_PREVIEW_PAD + 2 : undefined }}
        aria-hidden="true"
      >
        {on.length > 0 ? (
          <div
            ref={row}
            className="absolute left-0 flex"
            style={{
              top: ROW_PREVIEW_PAD,
              width: rowWidth,
              gap: LOOK_ROW.gap,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              visibility: scale > 0 ? undefined : "hidden",
            }}
          >
            {on.slice(0, MAX_ACTIVE_LOOKS).map((look) => {
              const chosen = look.key === chosenKey;
              return (
                <div
                  key={look.key}
                  className={cn(
                    "flex min-h-[72px] min-w-0 flex-1 flex-col justify-center rounded-md border",
                    chosen ? "border-foreground bg-foreground text-background" : "border-input",
                  )}
                  style={{ paddingInline: LOOK_ROW.buttonPadding }}
                >
                  <span className="flex max-w-full items-center font-semibold" style={{ fontSize: LOOK_ROW.name.size, lineHeight: 1.2 }}>
                    <span className="min-w-0 truncate">{smartApostrophes(look.name || "New look")}</span>
                    {/* The tick's room is kept on every button, as at the meeting. */}
                    <Check className={cn("size-5 shrink-0", !chosen && "invisible")} style={{ marginLeft: LOOK_ROW.tick - 20 }} />
                  </span>
                  <span
                    className={cn("max-w-full truncate", chosen ? undefined : "text-muted-foreground")}
                    style={{ fontSize: LOOK_ROW.words.size, lineHeight: 1.2, fontWeight: LOOK_ROW.words.weight }}
                  >
                    {smartApostrophes(look.words)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="p-3 text-sm text-muted-foreground">No looks on.</p>
        )}
      </div>
      <p className="text-sm text-muted-foreground">About how the buttons sit on an iPad Air, shrunk to fit.</p>
    </div>
  );
}

// Keenan's iPad, set up for a meeting (rehearsal_and_references). In
// Settings only, never on a meeting screen.
function IpadNote() {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 text-sm" data-testid="ipad-note">
      <p className="font-semibold">Before a meeting, on the iPad</p>
      <ul className="flex list-disc flex-col gap-1.5 pl-5 text-pretty">
        <li>Run meetings from the home-screen app, not Safari: the two keep separate offline copies.</li>
        <li>Night Shift off (it comes on at sunset and turns Cool white warm), and True Tone off.</li>
        <li>A Focus or Do Not Disturb on, so a notice naming another customer never drops over the presentation.</li>
        <li>Brightness up.</li>
        <li>Guided Access when you hand the iPad over.</li>
      </ul>
    </div>
  );
}
