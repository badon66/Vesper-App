"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import {
  acceptQuote,
  cancelSale,
  declineQuote,
  markInstalled,
  markNotInstalled,
  setInstallDay,
  undoAcceptance,
} from "@/app/(app)/app/leads/quote-outcome-actions";
import { ActionMessage } from "@/components/action-message";
import { AnswerGroup } from "@/components/leads/answer-group";
import { TrackColourForm } from "@/components/leads/track-colour-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABELS, type LeadStatus } from "@/lib/leads/status";
import { installedWords, notInstalledWords, voidWords } from "@/lib/quotes/outcome-card";
import {
  cancelWindowEndsAt,
  cancelWindowWords,
  commissionLine,
  insideCancelWindow,
  isOutcomeReason,
  lostReasonFor,
  OUTCOME_FALLBACK,
  OUTCOME_NOTE_MAX,
  OUTCOME_REASON_OPTIONS,
  outcomeActions,
  outcomeState,
  outcomeTitle,
  shortDay,
  type CommissionLine,
  type OutcomeReason,
  type QuoteStatus,
} from "@/lib/quotes/outcome";
import { addDays, formatDay } from "@/lib/time";
import { cn } from "@/lib/utils";

// The quote's outcome on the lead page (Keenan, 2026-11-09, round 8). Owner
// only, and never shown under View as: the page loads it for Keenan alone.
// Accepted moves the lead to Sold and locks the quote's numbers; Declined
// and Cancelled move it to Lost with a reason; Installed makes the setter's
// commission owed. Every tap goes to one database function that checks it
// all again; the card only says what each one will do.

// One choice on Accepted: the full quote, or the customer's "Start smaller"
// choice from Book my install while it still matches the quote.
export type OutcomeOption = {
  // 0-based run positions; null is the full quote.
  positions: number[] | null;
  label: string;
  detail: string;
  // Booked by the customer on their link.
  booked: boolean;
  // What accepting this option would pay the setter.
  commission: CommissionLine;
};

export type QuoteOutcomeData = {
  leadId: string;
  leadStatus: LeadStatus;
  // The planned install day (leads.install_on), YYYY-MM-DD.
  installOn: string | null;
  installedAt: string | null;
  quote: {
    id: string;
    status: QuoteStatus;
    acceptedAt: string | null;
    declinedAt: string | null;
    cancelledAt: string | null;
    declineReason: string | null;
    cancelReason: string | null;
    // The note that went with Other, only ever on the quote.
    note: string | null;
    // The accepted option in words, once there is one.
    option: { label: string; detail: string } | null;
  };
  options: OutcomeOption[];
  // The commission as it stands.
  commission: CommissionLine;
};

export type QuoteOutcomeProps = QuoteOutcomeData & {
  // The lead's track colour: Accepted needs one, and asks for it first.
  track: {
    set: boolean;
    text: string;
    options: { value: string; label: string }[];
    current: { choice: string | null; ralCode: string | null };
    ralNames: Record<string, string>;
  };
  // Calgary's date, from the server.
  today: string;
};

type Sheet = "accept" | "decline" | "cancel" | "undo" | "installed" | "not_installed" | "install_on" | null;
type Answer = { ok: true } | { ok: false; message: string };

const OPEN_FOR_ACCEPT: readonly QuoteStatus[] = ["draft", "presented", "declined", "cancelled"];

export function QuoteOutcome({
  leadId,
  leadStatus,
  installOn,
  installedAt,
  quote,
  options,
  commission,
  track,
  today,
}: QuoteOutcomeProps) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Accepted
  const [choice, setChoice] = useState(0);
  const [plannedOn, setPlannedOn] = useState("");
  const [trackSaved, setTrackSaved] = useState(false);
  // Declined and Cancelled
  const [reason, setReason] = useState<OutcomeReason | null>(null);
  const [note, setNote] = useState("");
  // Installed
  const [installedOn, setInstalledOn] = useState(today);

  const state = outcomeState(quote.status, leadStatus);
  const offered = outcomeActions(state);
  const sold = leadStatus === "sold";
  const can = {
    accept: offered.accept && OPEN_FOR_ACCEPT.includes(quote.status),
    decline: offered.decline && (quote.status === "draft" || quote.status === "presented"),
    installed: offered.installed && sold,
    notInstalled: offered.notInstalled && leadStatus === "installed",
    cancel: offered.cancel,
    undo: offered.undo && sold,
  };
  const title = outcomeTitle(
    {
      status: quote.status,
      accepted_at: quote.acceptedAt,
      declined_at: quote.declinedAt,
      cancelled_at: quote.cancelledAt,
      decline_reason: quote.declineReason,
      cancel_reason: quote.cancelReason,
    },
    { status: leadStatus, installed_at: installedAt },
  );
  const reasonWords = (value: string | null) => (isOutcomeReason(value) ? value : null);
  const declinedFor = reasonWords(quote.declineReason);
  const cancelledFor = reasonWords(quote.cancelReason);
  // A cancel came inside the 10-day window or after, worked out from the
  // two moments (nothing stores it).
  const cancelledInside =
    state === "cancelled" && quote.acceptedAt && quote.cancelledAt
      ? insideCancelWindow(quote.acceptedAt, quote.cancelledAt)
      : null;
  const trackReady = track.set || trackSaved;
  const chosen = options[Math.min(choice, options.length - 1)] ?? null;

  function open(next: Exclude<Sheet, null>) {
    setMessage(null);
    if (next === "accept") {
      setChoice(0);
      setPlannedOn(installOn ?? "");
      setTrackSaved(false);
    }
    if (next === "decline" || next === "cancel") {
      setReason(null);
      setNote("");
    }
    if (next === "installed") setInstalledOn(today);
    if (next === "install_on") setPlannedOn(installOn ?? "");
    setSheet(next);
  }

  function close() {
    if (!pending) setSheet(null);
  }

  function run(task: () => Promise<Answer>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await task();
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        setSheet(null);
      } catch {
        setMessage(OUTCOME_FALLBACK);
      }
    });
  }

  const description = (() => {
    switch (state) {
      case "open":
        return "No answer yet. Accepted moves the lead to Sold and makes the setter's commission; Declined moves it to Lost.";
      case "accepted":
        return "Sold. This quote's numbers are locked: undo the acceptance to change them in meeting mode.";
      case "installed":
        return commission.kind === "earning" && commission.status === "pending"
          ? "Installed. The setter's commission is owed until you mark it paid in Pay."
          : "Installed. The job is done.";
      // Lost with the reason, until Keenan moves the lead on (Follow up
      // for spring, say); then the card says where it is now.
      case "declined":
        if (leadStatus !== "lost") return `They said no. The lead is now ${STATUS_LABELS[leadStatus]}.`;
        return declinedFor ? `The lead is Lost: ${lostReasonFor("declined", declinedFor)}.` : "The lead is Lost.";
      case "cancelled":
        if (leadStatus !== "lost") return `The sale was cancelled. The lead is now ${STATUS_LABELS[leadStatus]}.`;
        return cancelledFor ? `The lead is Lost: ${lostReasonFor("cancelled", cancelledFor)}.` : "The lead is Lost.";
    }
  })();
  const showsCommission = state === "accepted" || state === "installed" || state === "cancelled";
  const showsOption = (state === "accepted" || state === "installed" || state === "cancelled") && quote.option;
  const noteField = (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="outcome-note">Note, if you like (only you see it)</Label>
      <Textarea
        id="outcome-note"
        rows={3}
        maxLength={OUTCOME_NOTE_MAX}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        className="min-h-20"
        data-testid="outcome-note"
      />
      <p className="text-sm text-muted-foreground">
        {[...note.trim()].length} of {OUTCOME_NOTE_MAX} characters. It stays on the quote, never on the lead or the timeline.
      </p>
    </div>
  );
  const reasonPicker = (legend: string) => (
    <AnswerGroup
      name="outcome-reason"
      legend={legend}
      options={[...OUTCOME_REASON_OPTIONS]}
      value={reason}
      columns={2}
      onChange={(value) => {
        setReason(isOutcomeReason(value) ? value : null);
        if (value !== "other") setNote("");
        setMessage(null);
      }}
    />
  );

  return (
    <Card id="quote-outcome" className="scroll-mt-24" data-testid="quote-outcome" data-state={state}>
      <CardHeader>
        <CardTitle>Outcome</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        {title ? (
          <p className="text-lg font-bold" data-testid="quote-outcome-title">
            {title.title}
          </p>
        ) : null}
        {state !== "open" ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            {title?.reason ? (
              <>
                <dt className="text-muted-foreground">Reason</dt>
                <dd className="font-semibold" data-testid="quote-outcome-reason">
                  {title.reason}
                  {cancelledInside !== null ? `, ${cancelWindowWords(cancelledInside)}` : ""}
                </dd>
              </>
            ) : null}
            {quote.note && (state === "declined" || state === "cancelled") ? (
              <>
                <dt className="text-muted-foreground">Note</dt>
                <dd className="text-pretty whitespace-pre-wrap">{quote.note}</dd>
              </>
            ) : null}
            {showsOption && quote.option ? (
              <>
                <dt className="text-muted-foreground">They said yes to</dt>
                <dd data-testid="quote-outcome-option">
                  <span className="font-semibold">{quote.option.label}</span>
                  <span className="block text-muted-foreground tabular-nums">{quote.option.detail}</span>
                </dd>
              </>
            ) : null}
            {state === "accepted" ? (
              <>
                <dt className="self-center text-muted-foreground">Install planned</dt>
                <dd className="flex flex-wrap items-center gap-x-3" data-testid="quote-outcome-install-on">
                  <span>{installOn ? formatDay(installOn) : "No day yet"}</span>
                  {sold ? (
                    <button
                      type="button"
                      onClick={() => open("install_on")}
                      className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="outcome-install-on"
                    >
                      {installOn ? "Change" : "Add a day"}
                    </button>
                  ) : null}
                </dd>
              </>
            ) : null}
            {showsCommission ? (
              <>
                <dt className="text-muted-foreground">Commission</dt>
                <dd className="text-pretty tabular-nums" data-testid="quote-outcome-commission">
                  {commissionLine(commission)}
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}

        {can.accept || can.decline || can.installed || can.notInstalled || can.cancel || can.undo ? (
          <div className="flex flex-wrap gap-3">
            {can.accept ? (
              <Button type="button" variant="outline" onClick={() => open("accept")} data-testid="outcome-accept">
                {state === "open" ? "Accepted" : "Accept again"}
              </Button>
            ) : null}
            {can.decline ? (
              <Button type="button" variant="outline" onClick={() => open("decline")} data-testid="outcome-decline">
                Declined
              </Button>
            ) : null}
            {can.installed ? (
              <Button type="button" variant="outline" onClick={() => open("installed")} data-testid="outcome-installed">
                Installed
              </Button>
            ) : null}
            {can.cancel ? (
              <Button type="button" variant="outline" onClick={() => open("cancel")} data-testid="outcome-cancel">
                Cancelled
              </Button>
            ) : null}
            {can.undo ? (
              <Button type="button" variant="ghost" onClick={() => open("undo")} data-testid="outcome-undo">
                Undo acceptance
              </Button>
            ) : null}
            {can.notInstalled ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => open("not_installed")}
                data-testid="outcome-not-installed"
              >
                Not installed yet
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>

      {/* Accepted: the track colour first if there is none, the option, the
          install day if he has one, and what the setter earns. */}
      <DialogPanel
        open={sheet === "accept"}
        onClose={close}
        title="Mark the quote accepted"
        testId="outcome-accept-sheet"
        actions={
          <>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Back
            </Button>
            <Button
              type="button"
              disabled={pending || !trackReady || !chosen}
              data-testid="outcome-accept-confirm"
              onClick={() =>
                chosen &&
                run(() =>
                  acceptQuote({
                    quoteId: quote.id,
                    leadId,
                    runs: chosen.positions,
                    installOn: plannedOn || null,
                  }),
                )
              }
            >
              {pending ? "Saving" : trackReady ? "Mark accepted" : "Set the track colour first"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 text-sm">
          {!trackReady ? (
            <section className="flex flex-col gap-3 rounded-md border border-input p-4" aria-label="Track colour">
              <p className="font-semibold text-pretty">
                Set the track colour first. It goes on the accepted quote.
              </p>
              <TrackColourForm
                leadId={leadId}
                options={track.options}
                current={track.current}
                ralNames={track.ralNames}
                requireColour
                onSaved={(picked) => setTrackSaved(picked !== null)}
              />
            </section>
          ) : (
            <p data-testid="outcome-accept-track">
              <span className="text-muted-foreground">Track colour: </span>
              <span className="font-semibold">{trackSaved && !track.set ? "Saved" : track.text}</span>
            </p>
          )}

          {options.length > 1 ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-semibold">What did they say yes to?</legend>
              {options.map((option, index) => (
                <label
                  key={option.positions?.join(",") ?? "all"}
                  className={cn(
                    "group flex min-h-14 cursor-pointer items-start gap-3 rounded-md border border-input bg-background px-4 py-3 transition-colors",
                    "has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background",
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
                  )}
                  data-testid="outcome-option"
                >
                  <input
                    type="radio"
                    name="outcome-option"
                    className="sr-only"
                    checked={choice === index}
                    onChange={() => setChoice(index)}
                  />
                  <Check aria-hidden="true" className="mt-0.5 hidden size-4 shrink-0 group-has-[:checked]:block" />
                  <span className="flex flex-col">
                    <span className="text-base font-semibold">{option.label}</span>
                    <span className="opacity-80 tabular-nums">
                      {option.detail}
                      {option.booked ? ". They booked this on their link." : ""}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : chosen ? (
            <p>
              <span className="text-muted-foreground">They said yes to: </span>
              <span className="font-semibold">{chosen.label}</span>, <span className="tabular-nums">{chosen.detail}</span>
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="outcome-planned-on">Install day, if you have one</Label>
            <Input
              id="outcome-planned-on"
              type="date"
              min={today}
              max={addDays(today, 365)}
              value={plannedOn}
              onChange={(event) => setPlannedOn(event.target.value)}
              className="sm:w-56"
              data-testid="outcome-planned-on"
            />
            <p className="text-muted-foreground">Leave it empty if there&apos;s no day yet. You can add it later.</p>
          </div>

          {chosen ? (
            <p className="text-pretty tabular-nums" data-testid="outcome-accept-commission">
              <span className="text-muted-foreground">Commission: </span>
              <span className="font-semibold">{commissionLine(chosen.commission)}</span>
            </p>
          ) : null}
          <p className="text-pretty text-muted-foreground">
            The lead moves to Sold and this quote&apos;s numbers lock. To change them later, undo the acceptance.
          </p>
          <ActionMessage text={message} />
        </div>
      </DialogPanel>

      {/* Declined: one tap for the reason, a note with Other only. */}
      <DialogPanel
        open={sheet === "decline"}
        onClose={close}
        title="Mark the quote declined"
        testId="outcome-decline-sheet"
        actions={
          <>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Back
            </Button>
            <Button
              type="button"
              disabled={pending || !reason}
              data-testid="outcome-decline-confirm"
              onClick={() =>
                reason && run(() => declineQuote({ quoteId: quote.id, leadId, reason, note: reason === "other" ? note : null }))
              }
            >
              {pending ? "Saving" : reason ? "Mark declined" : "Pick a reason"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 text-sm">
          {reasonPicker("Why did they say no?")}
          {reason === "other" ? noteField : null}
          <p className="text-pretty text-muted-foreground">
            {reason
              ? `The lead moves to Lost (Lost: ${lostReasonFor("declined", reason)}).`
              : "The lead moves to Lost with the reason."}{" "}
            Their quote link closes: it shows the quote has ended, with your call and text buttons.
          </p>
          <ActionMessage text={message} />
        </div>
      </DialogPanel>

      {/* Cancelled: a yes taken back, inside the 10-day window or after. */}
      <DialogPanel
        open={sheet === "cancel"}
        onClose={close}
        title="Cancel the sale"
        testId="outcome-cancel-sheet"
        actions={
          <>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Keep the sale
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || !reason}
              data-testid="outcome-cancel-confirm"
              onClick={() =>
                reason && run(() => cancelSale({ quoteId: quote.id, leadId, reason, note: reason === "other" ? note : null }))
              }
            >
              {pending ? "Saving" : reason ? "Cancel the sale" : "Pick a reason"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 text-sm">
          {quote.acceptedAt ? <CancelWindow acceptedAt={quote.acceptedAt} /> : null}
          {reasonPicker("Why did they take it back?")}
          {reason === "other" ? noteField : null}
          <ul className="flex list-disc flex-col gap-1 pl-5 text-pretty text-muted-foreground">
            <li>
              {reason
                ? `The lead moves to Lost (Lost: ${lostReasonFor("cancelled", reason)}).`
                : "The lead moves to Lost with the reason."}
            </li>
            {voidWords(commission) ? <li data-testid="outcome-cancel-commission">{voidWords(commission)}</li> : null}
            <li>Their quote link closes: it shows the quote has ended, with your call and text buttons.</li>
          </ul>
          <ActionMessage text={message} />
        </div>
      </DialogPanel>

      {/* Undo acceptance: back to a draft, the lead back where it was. */}
      <DialogPanel
        open={sheet === "undo"}
        onClose={close}
        title="Undo the acceptance?"
        testId="outcome-undo-sheet"
        actions={
          <>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Keep it accepted
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              data-testid="outcome-undo-confirm"
              onClick={() => run(() => undoAcceptance({ quoteId: quote.id, leadId }))}
            >
              {pending ? "Saving" : "Undo acceptance"}
            </Button>
          </>
        }
      >
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-pretty">
          <li>The quote goes back to a draft, so you can change it in meeting mode.</li>
          <li>The lead goes back to where it was before it was Sold.</li>
          {voidWords(commission) ? <li data-testid="outcome-undo-commission">{voidWords(commission)}</li> : null}
          {installOn ? <li>The planned install day comes off.</li> : null}
        </ul>
        <ActionMessage text={message} className="mt-4" />
      </DialogPanel>

      {/* Installed, on the day the crew finished. */}
      <DialogPanel
        open={sheet === "installed"}
        onClose={close}
        title="Mark the job installed"
        testId="outcome-installed-sheet"
        actions={
          <>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Back
            </Button>
            <Button
              type="button"
              disabled={pending || !installedOn}
              data-testid="outcome-installed-confirm"
              onClick={() => run(() => markInstalled({ leadId, on: installedOn }))}
            >
              {pending ? "Saving" : "Mark installed"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="outcome-installed-on">Install day</Label>
            <Input
              id="outcome-installed-on"
              type="date"
              max={today}
              required
              value={installedOn}
              onChange={(event) => setInstalledOn(event.target.value)}
              className="sm:w-56"
              data-testid="outcome-installed-on"
            />
            <p className="text-muted-foreground">Today or earlier: the day the crew finished.</p>
          </div>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-pretty text-muted-foreground">
            <li>The lead moves to Installed.</li>
            {installedWords(commission) ? <li data-testid="outcome-installed-commission">{installedWords(commission)}</li> : null}
          </ul>
          <ActionMessage text={message} />
        </div>
      </DialogPanel>

      {/* Not installed yet: a wrong Installed tap or day put right. */}
      <DialogPanel
        open={sheet === "not_installed"}
        onClose={close}
        title="Not installed yet?"
        testId="outcome-not-installed-sheet"
        actions={
          <>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Keep it installed
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              data-testid="outcome-not-installed-confirm"
              onClick={() => run(() => markNotInstalled({ leadId }))}
            >
              {pending ? "Saving" : "Back to Sold"}
            </Button>
          </>
        }
      >
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-pretty">
          <li>The lead goes back to Sold and its install day comes off, so you can mark it Installed again on the right day.</li>
          {notInstalledWords(commission) ? (
            <li data-testid="outcome-not-installed-commission">{notInstalledWords(commission)}</li>
          ) : null}
        </ul>
        <ActionMessage text={message} className="mt-4" />
      </DialogPanel>

      {/* The planned install day, added or changed after the yes. */}
      <DialogPanel
        open={sheet === "install_on"}
        onClose={close}
        title="Planned install day"
        testId="outcome-install-on-sheet"
        actions={
          <>
            {installOn ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => setInstallDay({ leadId, on: null }))}
              >
                No day yet
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Back
            </Button>
            <Button
              type="button"
              disabled={pending || !plannedOn || plannedOn === installOn}
              data-testid="outcome-install-on-confirm"
              onClick={() => run(() => setInstallDay({ leadId, on: plannedOn }))}
            >
              {pending ? "Saving" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="outcome-install-on">Install day</Label>
          <Input
            id="outcome-install-on"
            type="date"
            min={today}
            max={addDays(today, 365)}
            value={plannedOn}
            onChange={(event) => setPlannedOn(event.target.value)}
            className="sm:w-56"
          />
          <ActionMessage text={message} className="mt-3" />
        </div>
      </DialogPanel>
    </Card>
  );
}

// Inside the 10-day window or after it, said before Keenan cancels. Read
// from the device's clock while the sheet is open; the database works it
// out again for the timeline.
function CancelWindow({ acceptedAt }: { acceptedAt: string }) {
  const [now] = useState(() => Date.now());
  const inside = insideCancelWindow(acceptedAt, now);
  const ends = cancelWindowEndsAt(acceptedAt);
  return (
    <p className="font-semibold text-pretty" data-testid="outcome-cancel-window" data-inside={inside ? "yes" : "no"}>
      Accepted {shortDay(acceptedAt)}. This is {cancelWindowWords(inside)}
      {inside && ends ? `, which closes ${shortDay(ends)}` : ""}.
    </p>
  );
}
