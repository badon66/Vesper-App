import { NextResponse } from "next/server";
import { signedAgreement, signedFileName } from "@/lib/quote-link/agreement";
import { agreementPdf } from "@/lib/quote-link/agreement-pdf";
import { anonymousClient } from "@/lib/quote-link/server";
import { TOKEN_PATTERN } from "@/lib/quote-link/view";
import { calgaryDateOf } from "@/lib/time";

// The customer's own signed copy (quote link take 3, 2026-11-11), from
// their link: read through the token as an anonymous caller, like the rest
// of the page, and made into the PDF from the record the database saved
// when they signed. Never cached or indexed (proxy.ts sets the headers on
// every /q/ address).
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_PATTERN.test(token)) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await anonymousClient().rpc("quote_link_signed_copy", { p_token: token });
  if (error || !data) return new NextResponse("Not found", { status: 404 });
  const agreement = signedAgreement(data);
  if (!agreement) return new NextResponse("Not found", { status: 404 });
  const pdf = await agreementPdf(agreement);
  const signedAt = (data as { signed_at?: string }).signed_at ?? new Date().toISOString();
  const name = signedFileName(agreement, calgaryDateOf(signedAt));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Referrer-Policy": "no-referrer",
    },
  });
}
