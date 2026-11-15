"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { loadQuickEdit, saveQuickEdit, type QuickEditData } from "@/app/(app)/app/leads/quick-edit-actions";
import { AddressField, type AddressFieldValue } from "@/components/leads/address-field";
import { Button } from "@/components/ui/button";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getPublicEnv } from "@/lib/env";
import { quickTabs, type QuickTab } from "@/lib/leads/quick-edit";
import { LEAD_TABS, tabOf } from "@/lib/leads/tabs";
import { formatPhone } from "@/lib/phone";
import { calgaryToday } from "@/lib/time";
import { cn } from "@/lib/utils";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Round 20 (Keenan, 2026-11-14): a lead's name on Leads, Home and Meetings
// opens a small pop-up with the common fields on a double tap (or a double
// click), or a press and hold. A single tap still does what it did (opens
// the lead), a moment later so a second tap can land; a modifier click or
// the keyboard goes straight through. On a phone or iPad a double tap on
// the name never zooms the page (touch-action: manipulation), and holding
// it never brings up the copy menu.

const DOUBLE_TAP_MS = 280;
const HOLD_MS = 500;

export function QuickEditName({
  leadId,
  name,
  href = null,
  canEdit,
  className,
}: {
  leadId: string;
  name: string;
  href?: string | null;
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);

  useEffect(
    () => () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  if (!canEdit) return <span className={className}>{name}</span>;

  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  return (
    <>
      <span
        className={cn("cursor-pointer touch-manipulation select-none [-webkit-touch-callout:none]", className)}
        data-testid="quick-edit-name"
        data-lead={leadId}
        title="Double tap to edit"
        onClick={(event) => {
          // Cmd or Ctrl click, middle click and the keyboard open the link
          // as they always did.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || event.detail === 0) return;
          event.preventDefault();
          event.stopPropagation();
          if (held.current) {
            held.current = false;
            return;
          }
          if (tapTimer.current) {
            clearTimeout(tapTimer.current);
            tapTimer.current = null;
            setOpen(true);
            return;
          }
          tapTimer.current = setTimeout(() => {
            tapTimer.current = null;
            if (href) router.push(href);
          }, DOUBLE_TAP_MS);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          start.current = { x: event.clientX, y: event.clientY };
          held.current = false;
          cancelHold();
          holdTimer.current = setTimeout(() => {
            holdTimer.current = null;
            held.current = true;
            if (tapTimer.current) clearTimeout(tapTimer.current);
            tapTimer.current = null;
            setOpen(true);
          }, HOLD_MS);
        }}
        onPointerMove={(event) => {
          const from = start.current;
          if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > 10) cancelHold();
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onContextMenu={(event) => event.preventDefault()}
      >
        {name}
      </span>
      {open
        ? createPortal(
            // Clicks inside the pop-up stay inside it: the name usually sits
            // in a link, and React passes a portal's events up to it.
            <div onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
              <QuickEditDialog leadId={leadId} name={name} onClose={() => setOpen(false)} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function QuickEditDialog({ leadId, name, onClose }: { leadId: string; name: string; onClose: () => void }) {
  const router = useRouter();
  const [data, setData] = useState<QuickEditData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loads, setLoads] = useState(0);

  useEffect(() => {
    let live = true;
    loadQuickEdit(leadId).then(
      (result) => {
        if (!live) return;
        if (result.ok) {
          setData(result.data);
          setLoadError(null);
        } else setLoadError(result.message);
      },
      () => live && setLoadError("That didn't load. Check your signal and try again."),
    );
    return () => {
      live = false;
    };
  }, [leadId, loads]);

  return (
    <DialogPanel open onClose={onClose} title={`Edit ${name}`} testId="quick-edit">
      {data ? (
        <QuickEditForm
          key={data.stamp}
          data={data}
          onClose={onClose}
          onSaved={() => {
            router.refresh();
            onClose();
          }}
          onReopen={() => {
            setData(null);
            setLoads((n) => n + 1);
          }}
        />
      ) : loadError ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-sm font-semibold text-destructive">
            {loadError}
          </p>
          <Button type="button" variant="outline" className="self-end" onClick={onClose}>
            Close
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground" role="status">
          Opening...
        </p>
      )}
    </DialogPanel>
  );
}

function QuickEditForm({
  data,
  onClose,
  onSaved,
  onReopen,
}: {
  data: QuickEditData;
  onClose: () => void;
  onSaved: () => void;
  onReopen: () => void;
}) {
  const ids = useId();
  const today = calgaryToday();
  const startTab = tabOf(data.status);
  const [firstName, setFirstName] = useState(data.firstName);
  const [lastName, setLastName] = useState(data.lastName);
  const [phone, setPhone] = useState(formatPhone(data.phone) || data.phone);
  const [email, setEmail] = useState(data.email);
  const [address, setAddress] = useState<AddressFieldValue | null>(null);
  const [tab, setTab] = useState<QuickTab>(startTab);
  const [followUpOn, setFollowUpOn] = useState(data.followUpOn ?? "");
  const [lostReason, setLostReason] = useState("");
  const [assignedTo, setAssignedTo] = useState(data.assignedTo ?? "");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [viewAsNote, setViewAsNote] = useState(false);
  const [pending, start] = useTransition();
  const tabs = quickTabs(data.owner ? "owner" : "sales", data.status);
  const mapsKey = getPublicEnv().NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;

  const addressChanged =
    address !== null &&
    (address.addressLine.trim() !== data.address.addressLine ||
      address.lat !== data.address.lat ||
      address.lng !== data.address.lng);

  const save = () => {
    setError(null);
    setChanged(false);
    start(async () => {
      const result = await saveQuickEdit({
        id: data.id,
        stamp: data.stamp,
        firstName,
        lastName,
        phone,
        email,
        address: addressChanged && address
          ? {
              addressLine: address.addressLine,
              city: address.city,
              postalCode: address.postalCode,
              lat: address.lat,
              lng: address.lng,
              placeId: address.placeId,
              positionSource: address.positionSource,
              accuracy: address.accuracy,
            }
          : null,
        tab,
        followUpOn: tab === "later" ? followUpOn || null : null,
        lostReason: tab === "closed" && startTab !== "closed" ? lostReason || null : null,
        assignedTo: data.owner ? assignedTo || null : undefined,
        note,
      });
      if (result.ok) {
        onSaved();
        return;
      }
      if (result.message === VIEW_AS_READ_ONLY) {
        setViewAsNote(true);
        return;
      }
      setChanged(Boolean(result.changed));
      setError(result.message);
    });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
      data-testid="quick-edit-form"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-first`}>First name</Label>
          <Input id={`${ids}-first`} value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="off" data-testid="quick-edit-first" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-last`}>Last name</Label>
          <Input id={`${ids}-last`} value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="off" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-phone`}>Phone</Label>
          <Input id={`${ids}-phone`} type="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="off" data-testid="quick-edit-phone" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-email`}>Email</Label>
          <Input id={`${ids}-email`} type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" />
        </div>
      </div>

      <AddressField
        apiKey={mapsKey}
        defaults={{
          addressLine: data.address.addressLine,
          city: data.address.city,
          postalCode: data.address.postalCode,
          lat: data.address.lat,
          lng: data.address.lng,
          placeId: data.address.placeId,
          positionSource: data.address.positionSource,
          accuracy: data.address.accuracy,
        }}
        onPicked={() => undefined}
        onValue={setAddress}
        leadId={data.id}
        linkLeads={false}
        place={data.owner ? "house" : "door"}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">Tab</legend>
        <div className="grid grid-cols-4 gap-1 rounded-md border p-1" role="radiogroup" aria-label="Tab">
          {LEAD_TABS.map((entry) => {
            const allowed = tabs.includes(entry.value);
            const on = tab === entry.value;
            return (
              <button
                key={entry.value}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={!allowed}
                onClick={() => setTab(entry.value)}
                className={cn(
                  "h-11 rounded text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
                  on ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
                data-testid={`quick-edit-tab-${entry.value}`}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
        {tab === "later" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-follow`}>Follow up on</Label>
            <Input
              id={`${ids}-follow`}
              type="date"
              min={today}
              value={followUpOn}
              onChange={(event) => setFollowUpOn(event.target.value)}
              data-testid="quick-edit-follow-up"
            />
          </div>
        ) : null}
        {tab === "closed" && startTab !== "closed" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-reason`}>Reason</Label>
            <select
              id={`${ids}-reason`}
              value={lostReason}
              onChange={(event) => setLostReason(event.target.value)}
              className="h-11 rounded-md border border-border bg-background px-3 text-base"
            >
              <option value="">Pick one</option>
              {data.lostReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </fieldset>

      {data.owner ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-setter`}>Setter</Label>
          <select
            id={`${ids}-setter`}
            value={assignedTo}
            onChange={(event) => setAssignedTo(event.target.value)}
            className="h-11 rounded-md border border-border bg-background px-3 text-base"
            data-testid="quick-edit-setter"
          >
            {data.assignedTo === null ? <option value="">No setter</option> : null}
            {data.setters.map((setter) => (
              <option key={setter.id} value={setter.id}>
                {setter.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-note`}>Add a note</Label>
        <Textarea id={`${ids}-note`} rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" />
      </div>

      {viewAsNote ? (
        <p className="text-sm text-muted-foreground" role="status" data-testid="quick-edit-view-as">
          {VIEW_AS_READ_ONLY}
        </p>
      ) : null}
      {error ? (
        <div className="flex flex-col gap-2" role="alert" data-testid="quick-edit-error">
          <p className="text-sm font-semibold text-destructive text-pretty">{error}</p>
          {changed ? (
            <Button type="button" variant="outline" className="self-start" onClick={onReopen} data-testid="quick-edit-reopen">
              Reopen
            </Button>
          ) : null}
        </div>
      ) : null}

      {/* Stuck to the panel's bottom edge (the body's own 16 px padding
          would otherwise let the note show under it). */}
      <div className="sticky -bottom-4 z-10 -mx-5 -mb-4 flex justify-end gap-3 border-t bg-background px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} data-testid="quick-edit-save">
          {pending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
