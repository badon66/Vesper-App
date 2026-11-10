import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { MeetingMode } from "@/components/meeting/meeting-mode";
import { NotForYourRole } from "@/components/not-for-your-role";
import { getViewer } from "@/lib/auth/profile";
import { loadMeetingPayload } from "@/lib/meeting/deck-payload";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Meeting",
};

// Meeting mode (M5, the deck from round 7): Keenan at the kitchen table,
// iPad in landscape, customer watching. Everything the meeting needs is
// loaded here, once (lib/meeting/deck-payload.ts), and handed to the client
// whole, so weak signal in the house changes nothing after this page opens.
// Owner only: this screen prices the house. View as a setter never opens it.
export default async function MeetingPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { profile } = await getViewer();
  if (profile.role !== "owner") return <NotForYourRole />;

  const { leadId } = await params;
  if (!z.uuid().safeParse(leadId).success) notFound();

  const supabase = await createClient();
  const payload = await loadMeetingPayload(supabase, leadId);
  if (!payload) notFound();

  return <MeetingMode payload={payload} />;
}
