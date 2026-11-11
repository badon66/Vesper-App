"use client";

import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { addLeadMockups, setLeadMockupOffer } from "@/app/(app)/app/leads/mockup-actions";
import { Button } from "@/components/ui/button";
import type { LeadMockupItem } from "@/lib/leads/mockup-roles";
import { MEETING_PHOTO_MAX_EDGE, PHOTO_BUCKET, photoPath, shrinkPhoto } from "@/lib/photos";
import { offerPhoto, pickMockupForOffer } from "@/lib/quotes/editor";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// A photo on every offer (round 11, Keenan, 2026-11-11). Each offer card has
// a photo spot: the lead's mockup marked for this offer, else the Main with
// the words "Main shows". Pick opens a row of the lead's mockups to tap;
// Upload takes one picture, adds it to the lead's mockups and marks it for
// this offer. The marks are the mockups' own "for an offer" marks
// (lead_mockups.offer_ids), one picture per offer: picking moves the mark
// off the picture that had it. The deck and the customer's link already
// show an offer's own picture, else the Main, so nothing else changes.
// Only on the lead page (meeting mode's Edit layer passes no mockups), and
// never while the quote is locked.

const FAILED = "That didn't save. Check your signal and try again.";

export type OfferPhotos = {
  list: LeadMockupItem[];
  // A picture on its way up, shown in its offer's spot until the page's
  // mockups catch up.
  pending: { offerId: string; url: string } | null;
  // The offer whose picture is uploading, if any.
  busy: string | null;
  message: { offerId: string; text: string } | null;
  pick: (offerId: string, mockupId: string) => Promise<void>;
  upload: (offerId: string, file: File) => Promise<void>;
};

// The lead's mockups as the cards show them: the page's list, with taps
// shown at once and put back if a save didn't go through. Null when the
// editor was given no mockups (meeting mode), so no spot shows.
export function useOfferPhotos({
  mockups,
  leadId,
  userId,
  onRefresh,
}: {
  mockups?: LeadMockupItem[];
  leadId?: string;
  userId?: string;
  onRefresh?: () => void;
}): OfferPhotos | null {
  const [list, setList] = useState<LeadMockupItem[]>(mockups ?? []);
  const [from, setFrom] = useState(mockups);
  const [pending, setPending] = useState<{ offerId: string; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ offerId: string; text: string } | null>(null);
  if (from !== mockups) {
    setFrom(mockups);
    setList(mockups ?? []);
    setPending(null);
  }
  useEffect(() => {
    if (!pending) return;
    const { url } = pending;
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  if (!mockups) return null;

  async function pick(offerId: string, mockupId: string) {
    const before = list;
    const { list: next, previous } = pickMockupForOffer(list, mockupId, offerId);
    setList(next);
    setMessage(null);
    try {
      if (previous) {
        const off = await setLeadMockupOffer(previous, offerId, false);
        if (!off.ok) {
          setList(before);
          setMessage({ offerId, text: off.message });
          return;
        }
      }
      const on = await setLeadMockupOffer(mockupId, offerId, true);
      if (!on.ok) {
        setList(before);
        setMessage({ offerId, text: on.message });
        return;
      }
      onRefresh?.();
    } catch {
      setList(before);
      setMessage({ offerId, text: FAILED });
    }
  }

  async function upload(offerId: string, file: File) {
    if (!leadId || !userId || busy) return;
    setBusy(offerId);
    setMessage(null);
    try {
      let small: Blob;
      try {
        small = await shrinkPhoto(file, MEETING_PHOTO_MAX_EDGE);
      } catch {
        setMessage({ offerId, text: "That picture couldn't be read. Save it as a JPEG and try again." });
        return;
      }
      setPending({ offerId, url: URL.createObjectURL(small) });
      const supabase = createClient();
      const path = photoPath(userId, crypto.randomUUID());
      const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, small, { contentType: "image/jpeg", upsert: false });
      if (error) {
        setPending(null);
        setMessage({ offerId, text: "The picture didn't upload. Check your signal and try again." });
        return;
      }
      const added = await addLeadMockups(leadId, [{ path }]);
      if (!added.ok) {
        setPending(null);
        setMessage({ offerId, text: added.message });
        return;
      }
      // Its row, to mark it for this offer (the owner's own session reads it).
      const { data: row } = await supabase.from("lead_mockups").select("id").eq("storage_path", path).is("removed_at", null).maybeSingle();
      if (row) {
        const previous = list.find((item) => item.offers.includes(offerId));
        if (previous) await setLeadMockupOffer(previous.id, offerId, false);
        const marked = await setLeadMockupOffer(row.id, offerId, true);
        if (!marked.ok) setMessage({ offerId, text: marked.message });
      } else {
        setMessage({ offerId, text: "The picture is in Mockups now. Pick it for this offer." });
      }
      onRefresh?.();
    } catch {
      setPending(null);
      setMessage({ offerId, text: FAILED });
    } finally {
      setBusy(null);
    }
  }

  return { list, pending, busy, message, pick, upload };
}

// The spot on an offer card.
export function OfferPhoto({ offerId, photos, locked }: { offerId: string; photos: OfferPhotos; locked: boolean }) {
  const [picking, setPicking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const uploading = photos.busy === offerId;
  const pending = photos.pending?.offerId === offerId ? photos.pending : null;
  const found = pending ? null : offerPhoto(photos.list, offerId);
  const shown = pending
    ? { url: pending.url, own: true, words: "Uploading" }
    : found
      ? { url: found.item.url, own: found.own, words: found.own ? found.item.name.trim() || "Its own picture" : "Main shows" }
      : null;
  const message = photos.message?.offerId === offerId ? photos.message.text : null;

  return (
    <div className="flex flex-col gap-2" data-testid="offer-photo" data-own={shown?.own ? "true" : "false"}>
      <p className="text-sm font-semibold text-muted-foreground">Picture</p>
      <div className="flex items-start gap-3">
        <div className="aspect-[3/2] w-32 shrink-0 overflow-hidden rounded-md border bg-muted">
          {shown?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private photo behind a short-lived signed link, or a local preview
            <img src={shown.url} alt="" className="size-full object-cover" />
          ) : (
            <p className="flex size-full items-center justify-center px-2 text-center text-xs text-muted-foreground">
              {shown ? "Reload for the picture" : "No picture yet"}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm text-pretty text-muted-foreground" data-testid="offer-photo-words">
            {uploading ? "Uploading" : shown ? shown.words : "The Main mockup shows once there is one."}
          </p>
          {!locked ? (
            <div className="flex flex-wrap gap-2">
              {photos.list.length > 0 ? (
                <Button type="button" variant="outline" size="sm" aria-expanded={picking} onClick={() => setPicking((now) => !now)} data-testid="offer-photo-pick">
                  Pick
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => input.current?.click()} data-testid="offer-photo-upload">
                <ImagePlus aria-hidden="true" className="size-4" />
                Upload
              </Button>
              <input
                ref={input}
                type="file"
                accept="image/*"
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
                data-testid="offer-photo-input"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0] ?? null;
                  event.currentTarget.value = "";
                  if (file) void photos.upload(offerId, file);
                }}
              />
            </div>
          ) : null}
        </div>
      </div>
      {picking && !locked ? (
        <div role="group" aria-label="Pick a mockup" className="flex gap-2 overflow-x-auto pb-1">
          {photos.list.map((item) => {
            const on = item.offers.includes(offerId);
            const name = item.name.trim() || (item.main ? "Main" : "Mockup");
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={on}
                aria-label={`${name}${item.main ? ", the Main" : ""}`}
                onClick={() => {
                  setPicking(false);
                  void photos.pick(offerId, item.id);
                }}
                className={cn(
                  "flex w-28 shrink-0 flex-col overflow-hidden rounded-md border-2 bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-foreground" : "border-input",
                )}
                data-testid="offer-photo-choice"
                data-mockup={item.id}
              >
                <span className="block aspect-[3/2] w-full overflow-hidden">
                  {item.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a private photo behind a short-lived signed link
                    <img src={item.url} alt="" className="size-full object-cover" />
                  ) : null}
                </span>
                <span className="block truncate bg-card px-1.5 py-1 text-xs font-semibold">{name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm font-semibold text-destructive" data-testid="offer-photo-message">
          {message}
        </p>
      ) : null}
    </div>
  );
}
