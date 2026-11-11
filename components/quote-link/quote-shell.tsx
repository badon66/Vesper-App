import { Mail, MessageSquare, Phone } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { phoneHref, type Company } from "@/lib/quote-link/view";
import { cn } from "@/lib/utils";

// The customer quote page's frame (2026-11-02; slimmed 2026-11-04): always
// white with a slim navy band and the Vesper logo (its white version, 2026-11-11), whatever theme the phone
// uses, like the documents. It scrolls away with the page. No app chrome:
// no tabs, no account, nothing internal.
export function QuoteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="quote-light min-h-dvh bg-background text-foreground selection:bg-accent selection:text-foreground">
      <header className="bg-navy pt-[env(safe-area-inset-top)] text-white">
        <div className="mx-auto flex h-14 max-w-xl items-center px-5">
          <Logo tone="light" className="h-9" />
        </div>
      </header>
      {children}
    </div>
  );
}

const contactButton =
  "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md border border-input bg-background px-4 text-base font-semibold text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

// Call, text and (unless left out) email Vesper, with the numbers from Settings.
export function ContactButtons({
  company,
  email = true,
  className,
}: {
  company: Company;
  email?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex gap-3">
        <a href={phoneHref(company.phone, "tel")} className={contactButton}>
          <Phone aria-hidden="true" className="size-5" />
          Call
        </a>
        <a href={phoneHref(company.phone, "sms")} className={contactButton}>
          <MessageSquare aria-hidden="true" className="size-5" />
          Text
        </a>
      </div>
      {email ? (
        <a href={`mailto:${company.email}?subject=${encodeURIComponent("My Vesper quote")}`} className={contactButton}>
          <Mail aria-hidden="true" className="size-5" />
          Email {company.email}
        </a>
      ) : null}
      <p className="text-sm text-muted-foreground tabular-nums">{company.phone}</p>
    </div>
  );
}

// Once Keenan turns the link off (links don’t expire, 2026-11-04): no
// name, no prices, just the way to ask for an up-to-date quote, with Call
// and Text in the same bar along the bottom as the quote page, in thumb
// reach.
export function ClosedQuote({ company }: { company: Company }) {
  return (
    <>
      <main className="mx-auto flex max-w-xl flex-col gap-3 px-5 pt-10 pb-32" data-testid="quote-closed">
        <h1 className="text-3xl font-bold text-balance">This quote link is closed.</h1>
        <p className="text-lg text-pretty text-muted-foreground">Call or text Keenan for an up&#8209;to&#8209;date quote.</p>
        <p className="text-base text-muted-foreground tabular-nums">{company.phone}</p>
      </main>
      <aside aria-label="Call or text us" className="fixed inset-x-0 bottom-0 z-20 border-t bg-background pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-xl gap-2 px-4 py-2.5">
          <a href={phoneHref(company.phone, "tel")} className={contactButton}>
            <Phone aria-hidden="true" className="size-5" />
            Call
          </a>
          <a href={phoneHref(company.phone, "sms")} className={contactButton}>
            <MessageSquare aria-hidden="true" className="size-5" />
            Text
          </a>
        </div>
      </aside>
    </>
  );
}

// When the quote can't be read at all (no signal, or the server is down).
export function QuoteUnavailable({ company }: { company: Company }) {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 pt-10 pb-16" data-testid="quote-unavailable">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold text-balance">Your quote didn’t load</h1>
        <p className="text-lg text-pretty text-muted-foreground">
          Check your signal and open the link again in a minute. If it still doesn’t load, call or text Keenan.
        </p>
      </div>
      <ContactButtons company={company} email={false} />
    </main>
  );
}
