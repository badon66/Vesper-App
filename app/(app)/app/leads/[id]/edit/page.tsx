import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import type { QuestionDefaults } from "@/components/leads/find-out-fields";
import { LeadForm } from "@/components/leads/lead-form";
import { NotForYourRole } from "@/components/not-for-your-role";
import { ScrollToHash } from "@/components/scroll-to-hash";
import { requireProfile } from "@/lib/auth/profile";
import { getPublicEnv } from "@/lib/env";
import { answersOf } from "@/lib/leads/questions";
import { formatPhone } from "@/lib/phone";
import { maySeeContact } from "@/lib/leads/contact-rules";
import { contactFor } from "@/lib/leads/contacts";
import { notesFor } from "@/lib/leads/notes";
import { LEAD_FIELDS } from "@/lib/leads/fields";
import { createClient } from "@/lib/supabase/server";
import { updateLead } from "../../actions";

export const metadata: Metadata = {
  title: "Edit lead",
};

// The lead's answers as the form holds them, Not collected included.
function questionDefaults(lead: Parameters<typeof answersOf>[0] & { soffit_colour: string | null }): QuestionDefaults {
  const answers = answersOf(lead);
  return {
    owns_home: answers.owns_home ?? null,
    wants_price: answers.wants_price ?? null,
    both_decision_makers: answers.both_decision_makers ?? null,
    soffit_colour: lead.soffit_colour,
    christmas_lights_now: answers.christmas_lights_now ?? null,
    looked_into_before: answers.looked_into_before ?? null,
  };
}

export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireProfile();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: row } = await supabase.from("leads").select(LEAD_FIELDS).eq("id", id).maybeSingle();
  if (!row) notFound();
  if (!maySeeContact(me, row)) {
    return <NotForYourRole message="You can only change your own leads." />;
  }
  // Their own lead, or Keenan: its phone and email come from lead_contacts,
  // its notes from lead_notes (round 6).
  const [contact, leadNotes] = await Promise.all([contactFor(supabase, me, row.id), notesFor(supabase, me, row.id)]);
  const lead = { ...row, ...contact };

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Edit lead</h1>
      {/* Book now, finish later (2026-11-10): an item still to finish links
          here with the field's id (#lead-phone, #q-owns_home and so on), and
          lands on that field, mid-screen, with the focus. */}
      <ScrollToHash block="center" focus />
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
          setter_read: lead.setter_read,
          hot_buttons: lead.hot_buttons ?? [],
          questions: questionDefaults(lead),
          phone_not_collected: (lead.not_collected ?? []).includes("phone") && !lead.phone,
          soffit_note: lead.soffit_note ?? "",
          soffit_colour_2: lead.soffit_colour_2,
          answer_notes: leadNotes.answerNotes,
          notes: leadNotes.notes ?? "",
          source: lead.source,
          name_to_come: lead.name_to_come,
          address_to_come: lead.address_to_come,
          address: {
            addressLine: lead.address_line,
            city: lead.city,
            postalCode: lead.postal_code,
            lat: lead.lat,
            lng: lead.lng,
            placeId: lead.place_id,
            positionSource: lead.position_source,
            accuracy: lead.position_accuracy_m,
          },
        }}
      />
    </div>
  );
}
