import type { Metadata } from "next";
import { DoorGuide } from "@/components/leads/door-guide";
import { LeadForm } from "@/components/leads/lead-form";
import { getViewer } from "@/lib/auth/profile";
import { getPublicEnv } from "@/lib/env";
import { doorGuide, openKnockSession } from "@/lib/leads/queries";
import { activeHoldOf, bookingSettings, fetchBoard } from "@/lib/schedule/queries";
import { calgaryToday } from "@/lib/time";
import { createClient } from "@/lib/supabase/server";
import { createLead } from "../actions";

export const metadata: Metadata = {
  title: "New lead",
};

export default async function NewLeadPage() {
  const { profile: me, real } = await getViewer();
  const supabase = await createClient();
  const [session, guide, settings, board] = await Promise.all([
    openKnockSession(supabase, me.id),
    doorGuide(supabase),
    bookingSettings(supabase),
    fetchBoard(supabase, me, real.role),
  ]);
  const hold = await activeHoldOf(supabase, me.id, settings.graceMinutes);

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
      {guide ? <DoorGuide text={guide} /> : null}
      <LeadForm
        mode="create"
        action={createLead}
        userId={me.id}
        mapsKey={getPublicEnv().NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
        sessionNeighbourhood={session?.neighbourhood ?? null}
        cancelHref="/app/leads"
        booking={{
          board,
          today: calgaryToday(),
          windowDays: settings.windowDays,
          asSales: me.role !== "owner",
          viewerId: real.id !== me.id ? me.id : null,
          heldAt: hold?.startsAt ?? null,
        }}
      />
    </div>
  );
}
