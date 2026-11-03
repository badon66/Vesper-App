import type { Metadata } from "next";
import { StepNotes } from "@/components/booking/step-notes";
import { LeadForm } from "@/components/leads/lead-form";
import { getViewer } from "@/lib/auth/profile";
import { getPublicEnv } from "@/lib/env";
import { openKnockSession, stepNotes } from "@/lib/leads/queries";
import { createClient } from "@/lib/supabase/server";
import { createLead } from "../actions";

export const metadata: Metadata = {
  title: "New lead",
};

export default async function NewLeadPage() {
  const { profile: me } = await getViewer();
  const supabase = await createClient();
  const [session, notes] = await Promise.all([openKnockSession(supabase, me.id), stepNotes(supabase)]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">New lead</h1>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">
            Saving needs the address, a first name, and an answer or Not collected for each question.
            {session ? ` It links to your knock session in ${session.neighbourhood}.` : ""}
          </p>
        </div>
        <StepNotes notes={notes} />
      </div>
      <LeadForm
        mode="create"
        action={createLead}
        userId={me.id}
        mapsKey={getPublicEnv().NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
        sessionNeighbourhood={session?.neighbourhood ?? null}
        cancelHref="/app/leads"
      />
    </div>
  );
}
