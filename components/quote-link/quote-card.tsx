"use client";

import { Copy, ExternalLink, Link2Off, MessageSquare, Phone, Send, Share } from "lucide-react";
import { useState } from "react";
import { sendQuoteLink, turnOffQuoteLink } from "@/app/(app)/app/leads/quote-link-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogPanel } from "@/components/ui/dialog-panel";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { phoneHref, quoteLinkMessage } from "@/lib/quote-link/view";
import { formatDateTime, formatLongDay } from "@/lib/time";

// Times end in "p.m.", so a sentence ending in one gets no second full stop.
const sentence = (text: string) => (text.endsWith(".") ? text : `${text}.`);

// The quote on the lead page (Keenan, 2026-11-02; owner only): the total,
// the valid-until date and the customer's link: whether it went out, how
// often it was opened, what they are looking at, and Book my install.
// Send quote link hands Keenan a link and a text to send himself; nothing
// sends from the app.

export type QuoteCardLink = {
  live: boolean;
  link: string;
  previewUrl: string;
  createdAt: string;
  revokedAt: string | null;
  views: number;
  lastViewedAt: string | null;
  looking: { option: string; total: string } | null;
  booked: { at: string; option: string; total: string | null } | null;
};

export type QuoteCardProps = {
  leadId: string;
  firstName: string;
  // Vesper's number, for the text Keenan sends.
  phone: string;
  // The customer's own number, for Call and Text it, when the lead has one.
  customerPhone: string | null;
  quote: { total: string; feet: number; validUntil: string | null; expired: boolean } | null;
  link: QuoteCardLink | null;
};

export function QuoteCard({ leadId, firstName, phone, customerPhone, quote, link }: QuoteCardProps) {
  const [sheet, setSheet] = useState<{ link: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const [copied, setCopied] = useState<"link" | "text" | null>(null);

  async function openSheet() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await sendQuoteLink(leadId);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setCopied(null);
      setSheet({
        link: result.link,
        text: quoteLinkMessage({ firstName, link: result.link, validUntil: quote?.validUntil ?? null, phone }),
      });
    } catch {
      setMessage("The link couldn't be made. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await turnOffQuoteLink(leadId);
      setConfirmOff(false);
      if (!result.ok) setMessage(result.message);
    } catch {
      setMessage("The link couldn't be turned off. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(kind: "link" | "text", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
    } catch {
      setCopied(null);
    }
  }

  async function share(text: string) {
    try {
      await navigator.share({ text });
    } catch {
      // Closing the share sheet without sending is fine.
    }
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const who = firstName.trim() || "them";
  // Once they've asked to book, calling them is the next thing to do.
  const bookedNow = link?.live && link.booked ? link.booked : null;

  return (
    <Card id="quote" className="scroll-mt-24" data-testid="quote-card">
      <CardHeader>
        <CardTitle>Quote</CardTitle>
        <CardDescription>
          {quote
            ? "What the customer's link shows. Changing the quote in meeting mode changes the same link."
            : "No quote yet. Price it in meeting mode; once it's saved, the link can go out from here."}
        </CardDescription>
      </CardHeader>
      {quote ? (
        <CardContent className="flex flex-col gap-4 text-sm">
          {bookedNow ? (
            <div className="flex flex-col gap-0.5 rounded-md border border-input px-4 py-3" data-testid="quote-card-booked">
              <p className="text-lg font-bold text-pretty">
                {who === "them" ? "They" : who} asked to book: {bookedNow.option}
                {bookedNow.total ? `, ${bookedNow.total}` : ""}.
              </p>
              <p className="text-muted-foreground">{sentence(formatDateTime(bookedNow.at))}</p>
            </div>
          ) : null}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted-foreground">Quoted total, all parts</dt>
            <dd className="font-semibold tabular-nums" data-testid="quote-card-total">
              {quote.total}
            </dd>
            <dt className="text-muted-foreground">Feet</dt>
            <dd className="tabular-nums">{quote.feet} ft</dd>
            {quote.validUntil ? (
              <>
                <dt className="text-muted-foreground">Good until</dt>
                <dd>
                  {formatLongDay(quote.validUntil)}
                  {quote.expired ? (
                    <span className="block font-semibold">
                      Passed: the link shows the quote as expired. Change the date in meeting mode to bring it back.
                    </span>
                  ) : null}
                </dd>
              </>
            ) : null}
          </dl>

          <div className="flex flex-col gap-1.5 border-t pt-4" data-testid="quote-link-status">
            <p className="font-semibold">Customer&apos;s link</p>
            {!link ? (
              <p className="text-muted-foreground">Not sent yet.</p>
            ) : !link.live ? (
              <p className="text-muted-foreground">
                {sentence(`Turned off ${formatDateTime(link.revokedAt ?? link.createdAt)}`)} Send quote link makes a new one.
              </p>
            ) : (
              <>
                <p>{sentence(`Made ${formatDateTime(link.createdAt)}`)}</p>
                <p data-testid="quote-link-views">
                  {link.views === 0
                    ? "Not opened yet."
                    : sentence(`Opened ${link.views === 1 ? "once" : `${link.views} times`}, last ${formatDateTime(link.lastViewedAt ?? link.createdAt)}`)}
                </p>
                {link.looking ? (
                  <p data-testid="quote-link-looking">
                    Looking at {link.looking.option}, {link.looking.total}.
                  </p>
                ) : null}
                {link.booked ? (
                  <p className="font-semibold" data-testid="quote-link-booked">
                    Tapped Book my install {formatDateTime(link.booked.at)}: {link.booked.option}
                    {link.booked.total ? `, ${link.booked.total}` : ""}.
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {bookedNow && customerPhone ? (
              <Button asChild>
                <a href={phoneHref(customerPhone, "tel")}>
                  <Phone aria-hidden="true" />
                  Call {who}
                </a>
              </Button>
            ) : null}
            <Button type="button" variant={bookedNow && customerPhone ? "outline" : "default"} onClick={() => void openSheet()} disabled={busy}>
              <Send aria-hidden="true" />
              Send quote link
            </Button>
            {link?.live ? (
              <>
                <Button asChild variant="outline">
                  <a href={link.previewUrl} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden="true" />
                    Preview
                  </a>
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmOff(true)} disabled={busy}>
                  <Link2Off aria-hidden="true" />
                  Turn off link
                </Button>
              </>
            ) : null}
          </div>
          {link?.live ? (
            <p className="text-muted-foreground">Preview opens it signed in, so your visits and taps there don&apos;t count.</p>
          ) : null}
          {message ? (
            <p role="alert" className="font-semibold text-destructive">
              {message}
            </p>
          ) : null}
        </CardContent>
      ) : null}

      <DialogPanel
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title="Send quote link"
        testId="send-quote-link"
        actions={
          <Button type="button" variant="outline" onClick={() => setSheet(null)}>
            Done
          </Button>
        }
      >
        {sheet ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-pretty text-muted-foreground">
              Nothing is sent from the app. Edit the text if you like, then send it from your own Messages or email.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quote-link-text">Text</Label>
              <Textarea
                id="quote-link-text"
                rows={10}
                value={sheet.text}
                onChange={(event) => setSheet({ ...sheet, text: event.target.value })}
              />
            </div>
            <div className="flex flex-wrap gap-3">
              {customerPhone ? (
                <Button asChild>
                  <a href={`${phoneHref(customerPhone, "sms")}?&body=${encodeURIComponent(sheet.text)}`}>
                    <MessageSquare aria-hidden="true" />
                    Text it to {who}
                  </a>
                </Button>
              ) : null}
              {canShare ? (
                <Button type="button" variant={customerPhone ? "outline" : "default"} onClick={() => void share(sheet.text)}>
                  <Share aria-hidden="true" />
                  Share
                </Button>
              ) : null}
              <Button type="button" variant={canShare || customerPhone ? "outline" : "default"} onClick={() => void copy("text", sheet.text)}>
                <Copy aria-hidden="true" />
                {copied === "text" ? "Text copied" : "Copy text"}
              </Button>
              <Button type="button" variant="outline" onClick={() => void copy("link", sheet.link)}>
                <Copy aria-hidden="true" />
                {copied === "link" ? "Link copied" : "Copy link"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogPanel>

      <DialogPanel
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title="Turn off this link?"
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => setConfirmOff(false)}>
              Keep it
            </Button>
            <Button type="button" variant="destructive" onClick={() => void turnOff()} disabled={busy}>
              Turn off link
            </Button>
          </>
        }
      >
        <p className="text-sm text-pretty">
          {firstName.trim() || "The customer"} will see that the quote has expired. Send quote link afterwards makes a
          new link.
        </p>
      </DialogPanel>
    </Card>
  );
}
