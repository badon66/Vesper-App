import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { LeadForm } from "@/components/leads/lead-form";
import { NotForYourRole } from "@/components/not-for-your-role";
import { requireProfile } from "@/lib/auth/profile";
import { getPublicEnv } from "@/lib/env";
import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";
import { updateLead } from "../../actions";

export const metadata: Metadata = {
  title: "Edit lead",
};

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireProfile();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();
  if (me.role !== "owner" && lead.created_by !== me.id && lead.assigned_to !== me.id) {
    return <NotForYourRole message="You can only change your own leads." />;
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Edit lead</h1>
      <LeadForm
        mode="edit"
        action={updateLead}
        leadId={lead.id}
        userId={me.id}
        mapsKey={getPublicEnv().NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null}
        sessionNeighbourhood={null}
        cancelHref={`/app/leads/${lead.id}`}
        defaults={{
          first_name: lead.first_name,
          last_name: lead.last_name ?? "",
          phone: formatPhone(lead.phone),
          email: lead.email ?? "",
          neighbourhood: lead.neighbourhood ?? "",
          house_type: lead.house_type,
          soffit_colour: lead.soffit_colour,
          soffit_note: lead.soffit_note ?? "",
          notes: lead.notes ?? "",
          source: lead.source,
          address: {
            addressLine: lead.address_line,
            city: lead.city,
            postalCode: lead.postal_code,
            lat: lead.lat,
            lng: lead.lng,
            placeId: lead.place_id,
          },
        }}
      />
    </div>
  );
}
