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
  setSiteVisitDay,
  setSiteVisitDone,
  undoAcceptance,
} from "@/app/(app)/app/leads/quote-outcome-actions";
import { ActionMessage } from "@/components/action-message";
import { AnswerGroup } from "@/components/leads/answer-group";
import { TrackColourForm } from "@/components/leads/track-colour-form";
import { DateField } from "@/components/quotes/quote-editor/parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STATUS_LABELS, type LeadStatus } from "@/lib/leads/status";
import {
  installedWords,
  notInstalledWords,
  offerCommissionWords,
  startingChoice,
  choiceSources,
  voidWords,
  type AcceptOption,
} from "@/lib/quotes/outcome-card";
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
import { addDays, calgaryDateOf, formatDay } from "@/lib/time";
import { cn } from "@/lib/utils";

// The quote's outcome on the lead page (Keenan, 2026-11-09, round 8). Owner
// only, and never shown under View as: the page loads it for Keenan alone.
// Accepted moves the lead to Sold and locks the quote's numbers; Declined
// and Cancelled move it to Lost with a reason; Installed makes the setter's
// commission owed. Every tap goes to one database function that checks it
// all again; the card only says what each one will do.

// One choice on Accepted: an offer on the quote, biggest first (round 9,
// Keenan, 2026-11-10), with what it covers, its price and what accepting it
// would pay the setter. The one the customer booked on their link is
// marked and chosen to start. Accepting passes the offer's runs (null for
// every run), so the database's commission uses that offer's lights and
// boxes.
export type OutcomeOption = AcceptOption;

export type QuoteOutcomeData = {
  leadId: string;
  leadStatus: LeadStatus;
  // The planned install day (leads.install_on), YYYY-MM-DD.
  installOn: string | null;
  // The day picked at the table (quotes.meeting_install_on), which
  // prefills Accepted when no day is set yet.
  meetingInstallOn: string | null;
  installedAt: string | null;
  // Round 17: the site visit (lead_site_visits), step 3 of Where you're at
  // on their link: its day, and when Keenan marked it Done.
  siteVisit: { on: string | null; doneAt: string | null };
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

type Sheet = "accept" | "decline" | "cancel" | "undo" | "installed" | "not_installed" | "install_on" | "site_visit" | null;
type Answer = { ok: true } | { ok: false; message: string };

const OPEN_FOR_ACCEPT: readonly QuoteStatus[] = ["draft", "presented", "declined", "cancelled"];

export function QuoteOutcome({
  leadId,
  leadStatus,
  installOn,
  meetingInstallOn,
  installedAt,
  siteVisit,
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
  const [choice, setChoice] = useState(() => startingChoice(options));
  const [plannedOn, setPlannedOn] = useState("");
  const [trackSaved, setTrackSaved] = useState(false);
  // Declined and Cancelled
  const [reason, setReason] = useState<OutcomeReason | null>(null);
  const [note, setNote] = useState("");
  // Installed
  const [installedOn, setInstalledOn] = useState(today);
  // The site visit's day (round 17)
  const [visitOn, setVisitOn] = useState("");

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
      setChoice(startingChoice(options));
      setPlannedOn(installOn ?? meetingInstallOn ?? "");
      setTrackSaved(false);
    }
    if (next === "decline" || next === "cancel") {
      setReason(null);
      setNote("");
    }
    if (next === "installed") setInstalledOn(today);
    if (next === "install_on") setPlannedOn(installOn ?? "");
    if (next === "site_visit") setVisitOn(siteVisit.on ?? "");
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
  // Round 17: the site visit, step 3 of Where you're at on their link. Set
  // while the quote is open or accepted; read only once Installed; gone on
  // a declined or cancelled quote's lead, which has no next step.
  const showsSiteVisit = state === "open" || state === "accepted" || state === "installed";
  const visitEditable = (state === "open" || state === "accepted") && leadStatus !== "lost";
  const visitDone = siteVisit.doneAt !== null;
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
        {state !== "open" || showsSiteVisit ? (
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
            {showsSiteVisit ? (
              <>
                <dt className="self-center text-muted-foreground">Site visit</dt>
                <dd className="flex flex-wrap items-center gap-x-3" data-testid="quote-outcome-site-visit" data-done={visitDone}>
                  {visitDone ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold" data-testid="site-visit-state">
                      <Check aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      Done{siteVisit.doneAt ? `, ${formatDay(calgaryDateOf(siteVisit.doneAt))}` : ""}
                    </span>
                  ) : (
                    <span data-testid="site-visit-state">{siteVisit.on ? formatDay(siteVisit.on) : "No day yet"}</span>
                  )}
                  {visitEditable && !visitDone ? (
                    <button
                      type="button"
                      onClick={() => open("site_visit")}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      data-testid="outcome-site-visit-day"
                    >
                      {siteVisit.on ? "Change" : "Add a day"}
                    </button>
                  ) : null}
                  {visitEditable ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setSiteVisitDone({ leadId, done: !visitDone }))}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center font-semibold underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      data-testid="outcome-site-visit-done"
                    >
                      {visitDone ? "Not done yet" : "Done"}
                    </button>
                  ) : null}
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

        {/* A tap on the card itself (Done on the site visit) says what went wrong here. */}
        {sheet === null ? <ActionMessage text={message} /> : null}

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

      {/* Accepted: the track colour first if there is none, the offer they
          said yes to, the install day if he has one, and what the setter
          earns. */}
      <DialogPanel
        open={sheet === "accept"}
        onClose={close}
        title="Mark the quote accepted"
        testId="outcome-accept-sheet"
        actions={
          <>
            {/* Round 13: while it saves, the sheet says what it is doing
                (it was only "Saving" on the button for a few seconds). */}
            {pending ? (
              <p role="status" className="mr-auto max-w-prose self-center text-sm text-pretty text-muted-foreground" data-testid="outcome-accept-working">
                Marking it accepted, moving the lead to Sold and working out the commission.
              </p>
            ) : null}
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
                    offerId: chosen.id,
                    runs: chosen.positions,
                    installOn: plannedOn || null,
                  }),
                )
              }
            >
              {pending ? "Marking accepted" : trackReady ? "Mark accepted" : "Set the track colour first"}
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
              <legend className="mb-2 font-semibold">Which option did they say yes to?</legend>
              {choiceSources(options).map((line) => (
                <p key={line} className="text-muted-foreground" data-testid="outcome-choice-source">
                  {line}
                </p>
              ))}
              {options.map((option, index) => (
                <label
                  key={option.id}
                  className={cn(
                    "group flex min-h-14 cursor-pointer items-start gap-3 rounded-md border border-input bg-background px-4 py-3 transition-colors",
                    "has-[:checked]:border-foreground has-[:checked]:bg-foreground has-[:checked]:text-background",
                    "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background",
                  )}
                  data-testid="outcome-option"
                  data-offer={option.id}
                  data-booked={option.booked ? "yes" : "no"}
                  data-meeting={option.meeting ? "yes" : "no"}
                >
                  <input
                    type="radio"
                    name="outcome-option"
                    className="sr-only"
                    checked={choice === index}
                    onChange={() => setChoice(index)}
                  />
                  <Check aria-hidden="true" className="mt-1 hidden size-4 shrink-0 group-has-[:checked]:block" />
                  <OfferText option={option} withCommission />
                </label>
              ))}
            </fieldset>
          ) : chosen ? (
            <div
              className="flex flex-col gap-1"
              data-testid="outcome-option-only"
              data-offer={chosen.id}
              data-booked={chosen.booked ? "yes" : "no"}
            >
              <p className="text-muted-foreground">They said yes to</p>
              <OfferText option={chosen} />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="outcome-planned-on">Install day, if you have one</Label>
            {/* In words over the phone's own picker (round 12), like the editor's dates. */}
            <DateField
              id="outcome-planned-on"
              min={today}
              max={addDays(today, 365)}
              value={plannedOn}
              onChange={setPlannedOn}
              empty="No day yet"
              testId="outcome-planned-on"
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
            <DateField
              id="outcome-installed-on"
              max={today}
              required
              value={installedOn}
              onChange={setInstalledOn}
              testId="outcome-installed-on"
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
          <DateField id="outcome-install-on" min={today} max={addDays(today, 365)} value={plannedOn} onChange={setPlannedOn} empty="No day yet" />
          <ActionMessage text={message} className="mt-3" />
        </div>
      </DialogPanel>

      {/* Round 17: the site visit's day. Their link shows it under Site
          visit until he marks it Done. */}
      <DialogPanel
        open={sheet === "site_visit"}
        onClose={close}
        title="Site visit"
        testId="outcome-site-visit-sheet"
        actions={
          <>
            {siteVisit.on ? (
              <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => setSiteVisitDay({ leadId, on: null }))}>
                No day yet
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Back
            </Button>
            <Button
              type="button"
              disabled={pending || !visitOn || visitOn === siteVisit.on}
              data-testid="outcome-site-visit-confirm"
              onClick={() => run(() => setSiteVisitDay({ leadId, on: visitOn }))}
            >
              {pending ? "Saving" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5 text-sm">
          <Label htmlFor="outcome-site-visit">Day of the site visit</Label>
          <DateField id="outcome-site-visit" min={addDays(today, -60)} max={addDays(today, 365)} value={visitOn} onChange={setVisitOn} empty="No day yet" />
          <p className="text-muted-foreground text-pretty">Their link shows this day under Site visit until you mark it Done.</p>
          <ActionMessage text={message} className="mt-3" />
        </div>
      </DialogPanel>
    </Card>
  );
}

// An offer on the Accepted sheet: its name and price, what it covers, the
// commission it would make (in the list; the line under it says who gets
// it), and whether the customer booked it on their link.
function OfferText({ option, withCommission = false }: { option: OutcomeOption; withCommission?: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold text-pretty">{option.label}</span>
        <span className="shrink-0 font-semibold tabular-nums" data-testid="outcome-option-total">
          {option.total}
        </span>
      </span>
      <span className="opacity-80 tabular-nums text-pretty">{option.detail}</span>
      {withCommission ? (
        <span className="opacity-80 tabular-nums" data-testid="outcome-option-commission">
          {offerCommissionWords(option.commission)}
        </span>
      ) : null}
      {option.booked ? (
        <span className="font-semibold" data-testid="outcome-option-booked">
          They booked this on their link
        </span>
      ) : null}
      {/* Round 13: the sheet opens on what they booked; the table's choice
          is marked on its own row, beside it. */}
      {option.meeting ? (
        <span className="font-semibold" data-testid="outcome-option-meeting">
          Chosen at the meeting
        </span>
      ) : null}
    </span>
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
