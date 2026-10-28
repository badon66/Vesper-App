import type { Metadata } from "next";
import { LeadForm } from "@/components/leads/lead-form";
import { requireProfile } from "@/lib/auth/profile";
import { getPublicEnv } from "@/lib/env";
import { openKnockSession } from "@/lib/leads/queries";
import { createClient } from "@/lib/supabase/server";
import { createLead } from "../actions";

export const metadata: Metadata = {
  title: "New lead",
};

export default async function NewLeadPage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const session = await openKnockSession(supabase, me.id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">New lead</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {session
            ? `This lead links to your knock session in ${session.neighbourhood}.`
            : "Only the address and first name are needed to save."}
        </p>
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
