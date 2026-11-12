import { NextResponse } from "next/server";
import { requireProfile } from "@/lib/auth/profile";
import { signedAgreement, signedFileName } from "@/lib/quote-link/agreement";
import { agreementPdf } from "@/lib/quote-link/agreement-pdf";
import { createClient } from "@/lib/supabase/server";
import { calgaryDateOf } from "@/lib/time";

// A signed agreement on the lead page (quote link take 3, 2026-11-11):
// Keenan's only. Read with his own session (the table is owner-only in the
// database), refused to anyone else and while he is viewing as someone,
// then made into the PDF from the record saved when the customer signed.
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; signature: string }> }) {
  const { id, signature } = await params;
  const profile = await requireProfile();
  if (profile.role !== "owner" || !UUID.test(id) || !UUID.test(signature)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("agreement_signatures")
    .select("signer_name, signed_at, offer_id, offer_name, signature_png, agreement_text, quote_snapshot, lead_snapshot")
    .eq("id", signature)
    .eq("lead_id", id)
    .maybeSingle();
  if (!row) return new NextResponse("Not found", { status: 404 });
  const agreement = signedAgreement({ ...row, quote: row.quote_snapshot, lead: row.lead_snapshot });
  if (!agreement) return new NextResponse("Not found", { status: 404 });
  const pdf = await agreementPdf(agreement);
  const name = signedFileName(agreement, calgaryDateOf(row.signed_at));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
