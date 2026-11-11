"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EditorClose, EditorSave } from "@/components/quotes/quote-editor/parts";
import { hasMeasuredRun, QuoteEditor } from "@/components/quotes/quote-editor/quote-editor";
import { useQuoteSave } from "@/components/quotes/quote-editor/use-quote-save";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { offerNameIssue, quoteSummary } from "@/lib/quotes/editor";
import type { LeadMockupItem } from "@/lib/leads/mockup-roles";
import { QUOTE_LOCKED_LEAD, savedLine } from "@/lib/quotes/draft";
import {
  defaultQuoteState,
  quoteFingerprint,
  quoteInputs,
  quoteOffers,
  quoteStateFromDraft,
  type QuoteContext,
  type QuoteDraft,
  type QuoteUIState,
} from "@/lib/meeting/state";
import { formatFullDate } from "@/lib/time";

// The lead page's Quote card and its Edit the quote sheet (round 9, the
// spec 3.7; Keenan only, never under View as: the page renders it only for
// the owner's own session). The card sums the quote up, every option a
// customer sees with its total, biggest first, and the price-held date.
// Edit the quote opens the shared editor full screen, iPad landscape first
// and usable on a phone, in the app's dark form style. It saves the same
// draft row meeting mode opens (one draft per lead), so the quote built
// here is the quote the meeting opens with. An accepted quote opens read
// only, saying why. Opened from prep with #edit-quote in the address, the
// sheet opens at once. Round 11: the lead's mockups go in for the photo
// spot on each offer, and a pick or an upload refreshes the page's read.
// Round 12: Close and Save changes are the editor's own pair (parts.tsx),
// the same two meeting mode's Edit layer shows.

export type QuoteEditorCardProps = {
  leadId: string;
  leadName: string;
  context: QuoteContext;
  // The lead's accepted quote, or its draft; null with neither.
  draft: QuoteDraft | null;
  // The lead's mockups (lib/leads/mockups.ts), for the photo on each offer,
  // and who is signed in, for an upload's folder.
  mockups?: LeadMockupItem[];
  userId?: string;
};

const OPEN_HASH = "#edit-quote";

export function QuoteEditorCard({ leadId, leadName, context, draft, mockups, userId }: QuoteEditorCardProps) {
  const [open, setOpen] = useState(false);
  // The quote as last saved from this page, until the page's own read
  // catches up with it.
  const [local, setLocal] = useState<{ state: QuoteUIState; savedAt: string } | null>(null);
  const fromServer = useMemo(() => (draft ? quoteStateFromDraft(draft, context) : null), [draft, context]);
  const latest =
    local && (!draft || Date.parse(local.savedAt) >= Date.parse(draft.updatedAt))
      ? { state: local.state, savedAt: local.savedAt, quoteId: draft?.quoteId ?? null }
      : fromServer && draft
        ? { state: fromServer, savedAt: draft.updatedAt, quoteId: draft.quoteId }
        : null;
  const accepted = draft?.accepted === true;
  const summary = latest
    ? quoteSummary(quoteInputs(latest.state, context.pricing), quoteOffers(latest.state), latest.state.validUntil, formatFullDate)
    : "";

  // Prep's Draft the quote comes here with #edit-quote: open the sheet.
  useEffect(() => {
    const check = () => {
      if (window.location.hash === OPEN_HASH) setOpen(true);
    };
    const timer = window.setTimeout(check, 0);
    window.addEventListener("hashchange", check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", check);
    };
  }, []);

  function close() {
    setOpen(false);
    if (window.location.hash === OPEN_HASH) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
  }

  return (
    <Card id="edit-quote" className="scroll-mt-24" data-testid="quote-summary">
      <CardHeader>
        <CardTitle>Quote</CardTitle>
        <CardDescription className="text-pretty">
          {accepted
            ? "Accepted, so its prices are locked."
            : latest
              ? "Meeting mode opens with this quote."
              : "No quote yet. Build it here before the meeting, and meeting mode opens with it."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
        {summary ? (
          <p className="text-base font-semibold text-pretty tabular-nums" data-testid="quote-summary-line">
            {summary}
          </p>
        ) : latest ? (
          <p className="text-sm text-muted-foreground">No option has measured runs yet.</p>
        ) : null}
        <Button type="button" variant="outline" onClick={() => setOpen(true)} data-testid="edit-quote">
          {accepted ? "See the quote" : "Edit the quote"}
        </Button>
      </CardContent>
      {open ? (
        <QuoteSheet
          leadId={leadId}
          leadName={leadName}
          context={context}
          start={latest}
          accepted={accepted}
          mockups={mockups}
          userId={userId}
          onSaved={(state, savedAt) => setLocal({ state, savedAt })}
          onClose={close}
        />
      ) : null}
    </Card>
  );
}

function QuoteSheet({
  leadId,
  leadName,
  context,
  start,
  accepted,
  mockups,
  userId,
  onSaved,
  onClose,
}: {
  leadId: string;
  leadName: string;
  context: QuoteContext;
  start: { state: QuoteUIState; savedAt: string; quoteId: string | null } | null;
  accepted: boolean;
  mockups?: LeadMockupItem[];
  userId?: string;
  onSaved: (state: QuoteUIState, savedAt: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<QuoteUIState>(() => start?.state ?? defaultQuoteState(context));
  const [saved, setSaved] = useState<{ fingerprint: string | null; at: string | null; quoteId: string | null }>(() => ({
    fingerprint: start ? quoteFingerprint(start.state) : null,
    at: start?.savedAt ?? null,
    quoteId: start?.quoteId ?? null,
  }));
  const [leaving, setLeaving] = useState(false);
  const { busy, message, save } = useQuoteSave({ leadId, pricing: context.pricing, from: "lead" });
  const dirty = saved.fingerprint === null ? hasMeasuredRun(state) : quoteFingerprint(state) !== saved.fingerprint;
  const nameIssue = quoteOffers(state).some((offer) => offerNameIssue(offer.name) !== null);
  const canSave = !accepted && !busy && hasMeasuredRun(state) && !nameIssue;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    title.current?.focus();
    return () => {
      if (element.open) element.close();
    };
  }, []);

  // "Close without saving" lasts a few seconds.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(false), 4000);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  function tryClose() {
    if (dirty && !accepted && !leaving) {
      setLeaving(true);
      return;
    }
    onClose();
  }

  async function onSave() {
    const result = await save(state, { quoteId: saved.quoteId });
    if (!result) return;
    setSaved({ fingerprint: result.fingerprint, at: result.savedAt, quoteId: result.quoteId });
    onSaved(state, result.savedAt);
  }

  const status = accepted
    ? null
    : dirty
      ? saved.at
        ? "Changes not saved yet."
        : "Not saved yet."
      : saved.at
        ? savedLine(saved.at)
        : null;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="quote-sheet-title"
      data-testid="quote-sheet"
      onCancel={(event) => {
        event.preventDefault();
        tryClose();
      }}
      className="dark fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none border-0 bg-background p-0 text-foreground backdrop:bg-background"
    >
      <div className="flex h-dvh flex-col">
        <header className="shrink-0 border-b pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 flex-col">
              <h2 id="quote-sheet-title" ref={title} tabIndex={-1} className="text-xl font-bold outline-none">
                {accepted ? "The quote" : "Edit the quote"}
              </h2>
              <p className="truncate text-sm text-muted-foreground">{leadName}</p>
            </div>
            <EditorClose onClick={tryClose} leaving={leaving} testId="quote-sheet-close" />
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
            <QuoteEditor
              state={state}
              onChange={setState}
              pricing={context.pricing}
              colourKind={context.lead.colourKind}
              colourText={context.lead.colourText}
              today={context.today}
              locked={accepted}
              lockedWords={QUOTE_LOCKED_LEAD}
              mockups={mockups}
              leadId={leadId}
              userId={userId}
              onMockupsRefresh={() => router.refresh()}
            />
          </div>
        </div>
        {/* An accepted quote says why at the top; it has nothing to save. */}
        {accepted ? null : (
          <footer className="shrink-0 border-t pb-[env(safe-area-inset-bottom)]">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 flex-col text-sm" aria-live="polite">
                {message ? (
                  <p role="alert" className="font-semibold text-pretty text-destructive" data-testid="quote-sheet-message">
                    {message}
                  </p>
                ) : (
                  <>
                    <p className="text-muted-foreground">Meeting mode opens with this quote.</p>
                    <p data-testid="quote-sheet-status">
                      {[status, nameIssue ? "An offer's name needs fixing first." : !hasMeasuredRun(state) ? "Measure an area to save." : null, "Saving needs signal."]
                        .filter(Boolean)
                        .join(" ")}
                    </p>
                  </>
              )}
            </div>
            <EditorSave onClick={() => void onSave()} disabled={!canSave} busy={busy} testId="quote-sheet-save" />
          </div>
        </footer>
        )}
      </div>
    </dialog>
  );
}
