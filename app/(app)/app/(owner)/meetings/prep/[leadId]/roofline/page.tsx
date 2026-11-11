import { notFound, redirect } from "next/navigation";
import { z } from "zod";

// The roofline tracer's old address (round 7, light_picker.tracing). Since
// 2026-11-11 (Keenan: no light picker, no editor) nothing traces a roofline:
// this goes back to the prep page, or to the lead page when it came from
// there (?from=lead). The tracer's code (components/roofline/*) and
// roofline-actions.ts stay in place, unused, and saved traces stay in the
// database untouched. The prep page and the lead page check the owner
// themselves.
export default async function RooflinePage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { leadId } = await params;
  const { from } = await searchParams;
  if (!z.uuid().safeParse(leadId).success) notFound();
  const fromLead = (Array.isArray(from) ? from[0] : from) === "lead";
  redirect(fromLead ? `/app/leads/${leadId}` : `/app/meetings/prep/${leadId}`);
}
