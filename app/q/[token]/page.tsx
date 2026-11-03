import type { Metadata, Viewport } from "next";
import { CustomerQuoteView } from "@/components/quote-link/customer-quote";
import { ExpiredQuote, QuoteShell, QuoteUnavailable } from "@/components/quote-link/quote-shell";
import { loadCustomerQuote, type LoadedQuote } from "@/lib/quote-link/server";
import { FALLBACK_COMPANY } from "@/lib/quote-link/view";

// The customer's quote link (Keenan, 2026-11-02): a public page with no
// login, opened by an unguessable token. Read fresh on every visit through
// the one token function, never cached, never indexed, and it sends no
// referrer when they tap a link out of it.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Your Vesper quote" },
  description: "Your quote from Vesper Lighting.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  themeColor: "#132e3f",
};

export default async function QuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let view: LoadedQuote | null = null;
  try {
    view = await loadCustomerQuote(token);
  } catch {
    view = null;
  }

  return (
    <QuoteShell>
      {view === null ? (
        <QuoteUnavailable company={FALLBACK_COMPANY} />
      ) : view.state === "expired" ? (
        <ExpiredQuote company={view.company} />
      ) : (
        <CustomerQuoteView token={token} view={view} />
      )}
    </QuoteShell>
  );
}
