import type { Metadata } from "next";

import { NotForYourRole } from "@/components/not-for-your-role";
import { requireProfile } from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/server";

import { loadRehearsal } from "./data";
import { requestedLead } from "./rehearsal";
import { RehearsalView } from "./rehearsal-view";

export const metadata: Metadata = {
  title: "Rehearsal",
};

// The rehearsal view (round 7, rehearsal_and_references): the meeting's deck
// as a customer would see it, with an example to copy in every empty slot,
// under a permanent gold bar. Owner only, opened only from Settings (never
// from Tonight, Meetings or the lead page). The owner group's layout refuses
// everyone else, View as included; the page checks again before it reads
// anything, because a layout's gate only swaps what shows. It writes
// nothing, and the service worker never keeps it (public/sw.js).
export default async function RehearsalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireProfile();
  if (me.role !== "owner") return <NotForYourRole />;

  const { lead } = await searchParams;
  const supabase = await createClient();
  const data = await loadRehearsal(supabase, requestedLead(lead));

  return <RehearsalView {...data} />;
}
