"use client";

import { Check, ImagePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  addLeadMockups,
  removeLeadMockup,
  renameLeadMockup,
  setLeadMockupOffer,
  setLeadMockupRole,
} from "@/app/(app)/app/leads/mockup-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MOCKUP_NAME_MAX,
  MOCKUP_ROLES,
  withOffer,
  withRole,
  type LeadMockupItem,
  type MockupOffer,
  type MockupRole,
} from "@/lib/leads/mockup-roles";
import { MEETING_PHOTO_MAX_EDGE, PHOTO_BUCKET, photoPath, shrinkPhoto } from "@/lib/photos";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Mockups per house (round 10, Keenan, 2026-11-10): Keenan's alone, on the
// lead page and the prep list. He uploads as many as he likes from the iPad
// or his phone, names each one ("Christmas", "Warm white") and marks what
// each is for, one tap each, saved on the tap: Main (lights on), Day, Night,
// a Phone scene, and the offers on the quote it shows. One picture can do
// more than one job. Remove takes a second tap.
// bare: without the card around it, for the prep list.
export function MockupsCard({
  leadId,
  userId,
  mockups,
  offers,
  bare = false,
  primary = false,
}: {
  leadId: string;
  userId: string;
  mockups: LeadMockupItem[];
  offers: MockupOffer[];
  bare?: boolean;
  // The prep list: gold only on the first thing still to do.
  primary?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  // What's on screen: the server's list, with taps shown at once.
  const [list, setList] = useState(mockups);
  const [from, setFrom] = useState(mockups);
  if (from !== mockups) {
    setFrom(mockups);
    setList(mockups);
  }
  const [uploading, setUploading] = useState<{ done: number; of: number; previews: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    const chosen = Array.from(files ?? []).filter((file) => file.type === "" || file.type.startsWith("image/"));
    if (input.current) input.current.value = "";
    if (chosen.length === 0) return;
    const batch = chosen.slice(0, 12);
    const previews: string[] = [];
    setError(null);
    setUploading({ done: 0, of: batch.length, previews });
    const supabase = createClient();
    const added: { path: string }[] = [];
    let failed = chosen.length - batch.length;
    // A file the browser can't read (a HEIC from the Files app on an older
    // iPad, say; Photos hands over a JPEG) is told apart from an upload
    // that failed on signal.
    let unreadable = 0;
    for (const file of batch) {
      let small: Blob;
      try {
        small = await shrinkPhoto(file, MEETING_PHOTO_MAX_EDGE);
      } catch {
        unreadable += 1;
        setUploading({ done: added.length + failed + unreadable, of: batch.length, previews: [...previews] });
        continue;
      }
      try {
        previews.push(URL.createObjectURL(small));
        setUploading({ done: added.length + failed + unreadable, of: batch.length, previews: [...previews] });
        const path = photoPath(userId, crypto.randomUUID());
        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, small, { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw uploadError;
        added.push({ path });
      } catch {
        failed += 1;
      }
      setUploading({ done: added.length + failed + unreadable, of: batch.length, previews: [...previews] });
    }
    try {
      if (added.length > 0) {
        const result = await addLeadMockups(leadId, added);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        router.refresh();
      }
      const problems = [
        unreadable === 1
          ? "One picture couldn't be read, so it was skipped. Save it as a JPEG and add it again."
          : unreadable > 1
            ? `${unreadable} pictures couldn't be read, so they were skipped. Save them as JPEGs and add them again.`
            : null,
        failed === 1
          ? "One picture didn't upload. Check your signal and add it again."
          : failed > 1
            ? `${failed} pictures didn't upload. Check your signal and add them again.`
            : null,
      ].filter((line): line is string => line !== null);
      if (problems.length > 0) setError(problems.join(" "));
    } catch {
      setError("The mockups didn't save. Check your signal and try again.");
    } finally {
      for (const url of previews) URL.revokeObjectURL(url);
      setUploading(null);
    }
  }

  // A tap: shown at once, saved, put back if the save didn't go through.
  async function save(next: LeadMockupItem[], send: () => Promise<{ ok: true } | { ok: false; message: string }>) {
    const before = list;
    setList(next);
    setError(null);
    try {
      const result = await send();
      if (!result.ok) {
        setList(before);
        setError(result.message);
        return;
      }
      router.refresh();
    } catch {
      setList(before);
      setError("That didn't save. Check your signal and try again.");
    }
  }

  const none = list.length === 0;
  const busy = uploading !== null;
  const add = (
    <>
      <Button
        type="button"
        variant={bare && primary && none ? "default" : "outline"}
        size={bare ? "lg" : "default"}
        className={bare ? "h-12 px-5" : "h-11"}
        disabled={busy}
        onClick={() => input.current?.click()}
        data-testid="mockups-add"
      >
        <ImagePlus aria-hidden="true" />
        {busy ? `Uploading ${Math.min(uploading.done + 1, uploading.of)} of ${uploading.of}` : none ? (bare ? "Upload the mockup" : "Upload mockups") : "Add mockups"}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        data-testid="mockup-input"
        onChange={(event) => void onFiles(event.currentTarget.files)}
      />
    </>
  );

  const body = (
    <div className="flex flex-col gap-4" data-testid="mockups">
      {none && !busy ? (
        <p className="text-sm text-pretty text-muted-foreground" data-testid="mockups-empty">
          No mockups yet. Upload one or more, name each, and mark what it&apos;s for: Main shows full screen with the
          lights on, Day and Night share the slider, Phone scenes are the buttons on the phone page.
        </p>
      ) : null}
      {list.length > 0 || busy ? (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((item) => (
            <MockupTile
              key={item.id}
              item={item}
              offers={offers}
              onRename={(name) =>
                save(
                  list.map((other) => (other.id === item.id ? { ...other, name } : other)),
                  () => renameLeadMockup(item.id, name),
                )
              }
              onRole={(role, on) => save(withRole(list, item.id, role, on), () => setLeadMockupRole(item.id, role, on))}
              onOffer={(offerId, on) =>
                save(withOffer(list, item.id, offerId, on), () => setLeadMockupOffer(item.id, offerId, on))
              }
              onRemove={() =>
                save(
                  list.filter((other) => other.id !== item.id),
                  () => removeLeadMockup(item.id),
                )
              }
            />
          ))}
          {(uploading?.previews ?? []).map((url) => (
            <li key={url} className="overflow-hidden rounded-md border" data-testid="mockup-uploading">
              <div className="aspect-[3/2] bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview while it uploads */}
                <img src={url} alt="" className="size-full object-contain opacity-60" />
              </div>
              <p className="px-3 py-2 text-sm text-muted-foreground">Uploading</p>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">{add}</div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-destructive" data-testid="mockups-error">
          {error}
        </p>
      ) : null}
    </div>
  );

  if (bare) return <div data-testid="mockup-card">{body}</div>;

  return (
    <Card id="mockup" className="scroll-mt-24" data-testid="mockup-card">
      <CardHeader>
        <CardTitle>Mockups</CardTitle>
        <CardDescription>
          Your pictures of this house, for meeting mode and their quote link. Mark what each one is for; one picture can do
          more than one job. Only you see these here.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild className="h-11">
            {/* A full page load on purpose: it lets the service worker keep
                the meeting page for a reload without signal. */}
            <a href={`/meeting/${leadId}#start`}>Open meeting mode</a>
          </Button>
        </div>
        {body}
      </CardContent>
    </Card>
  );
}

function MockupTile({
  item,
  offers,
  onRename,
  onRole,
  onOffer,
  onRemove,
}: {
  item: LeadMockupItem;
  offers: MockupOffer[];
  onRename: (name: string) => Promise<void>;
  onRole: (role: MockupRole, on: boolean) => Promise<void>;
  onOffer: (offerId: string, on: boolean) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [name, setName] = useState(item.name);
  const [saved, setSaved] = useState(item.name);
  if (saved !== item.name) {
    setSaved(item.name);
    setName(item.name);
  }
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  function commitName() {
    const next = name.trim().slice(0, MOCKUP_NAME_MAX);
    if (next === item.name) {
      setName(next);
      return;
    }
    void onRename(next);
  }

  const label = item.name.trim() || "Mockup";
  return (
    <li className="flex flex-col overflow-hidden rounded-md border" data-testid="mockup-tile" data-mockup={item.id}>
      <div className="aspect-[3/2] bg-muted">
        {item.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a private photo behind a short-lived signed link
          <img src={item.url} alt={`${label}, a mockup of this house`} className="size-full object-contain" />
        ) : (
          <p className="flex size-full items-center justify-center px-4 text-sm text-muted-foreground">
            The picture needs a refresh. Reload the page.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3 p-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name</span>
          <input
            type="text"
            value={name}
            maxLength={MOCKUP_NAME_MAX}
            placeholder="Like Christmas or Warm white"
            enterKeyHint="done"
            onChange={(event) => setName(event.currentTarget.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            className="h-11 rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
            data-testid="mockup-name"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Shows as</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label={`What ${label} shows as`}>
            {MOCKUP_ROLES.map(({ role, label: roleLabel, hint }) => (
              <Chip
                key={role}
                on={item[role]}
                onToggle={() => void onRole(role, !item[role])}
                label={`${roleLabel}: ${hint}`}
                testId={`mockup-role-${role}`}
              >
                {roleLabel}
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">For an offer</span>
          {offers.length > 0 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label={`The offers ${label} shows`}>
              {offers.map((offer) => {
                const on = item.offers.includes(offer.id);
                return (
                  <Chip
                    key={offer.id}
                    on={on}
                    onToggle={() => void onOffer(offer.id, !on)}
                    testId="mockup-offer"
                    className="max-w-full"
                  >
                    <span className="truncate">{offer.name}</span>
                  </Chip>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-pretty text-muted-foreground">
              The offers show here once the quote is saved in meeting mode.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (confirming) {
              setConfirming(false);
              void onRemove();
            } else {
              setConfirming(true);
            }
          }}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 self-start rounded-md px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring",
            confirming ? "border border-destructive text-destructive" : "text-muted-foreground hover:bg-muted",
          )}
          data-testid="mockup-remove"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {confirming ? "Tap again to remove" : "Remove"}
        </button>
      </div>
    </li>
  );
}

// A one-tap toggle: filled navy when on, with a tick, so it never relies on
// colour alone.
function Chip({
  on,
  onToggle,
  children,
  label,
  testId,
  className,
}: {
  on: boolean;
  onToggle: () => void;
  children: ReactNode;
  label?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onToggle}
      data-testid={testId}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on ? "border-foreground bg-foreground text-background" : "border-input bg-background text-foreground hover:bg-muted",
        className,
      )}
    >
      {on ? <Check aria-hidden="true" className="size-4 shrink-0" /> : null}
      {children}
    </button>
  );
}
