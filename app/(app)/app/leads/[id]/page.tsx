import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NoteForm } from "@/components/leads/note-form";
import { PhotoPicker } from "@/components/leads/photo-picker";
import { StatusBadge } from "@/components/leads/status-badge";
import { StatusControl } from "@/components/leads/status-control";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireProfile } from "@/lib/auth/profile";
import { lostReasons, namesById } from "@/lib/leads/queries";
import {
  HOUSE_TYPE_OPTIONS,
  labelFor,
  leadName,
  SOFFIT_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_LABELS,
  statusChoices,
} from "@/lib/leads/status";
import { describeEvent } from "@/lib/leads/timeline";
import { formatPhone } from "@/lib/phone";
import { PHOTO_BUCKET } from "@/lib/photos";
import { mapsLink } from "@/lib/places";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/time";

export const metadata: Metadata = {
  title: "Lead",
};

export default async function LeadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photos?: string | string[] }>;
}) {
  const me = await requireProfile();
  const { id } = await params;
  const { photos: photosParam } = await searchParams;
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!lead) notFound();

  const canEdit = me.role === "owner" || lead.created_by === me.id || lead.assigned_to === me.id;
  const [{ data: photoRows }, { data: events }, reasons, sessionResult] = await Promise.all([
    supabase.from("lead_photos").select("id, storage_path").eq("lead_id", id).order("created_at"),
    supabase
      .from("lead_events")
      .select("id, type, from_status, to_status, payload, actor_id, created_at")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    lostReasons(supabase),
    lead.knock_session_id
      ? supabase.from("knock_sessions").select("neighbourhood").eq("id", lead.knock_session_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const paths = (photoRows ?? []).map((photo) => photo.storage_path);
  const signed =
    paths.length > 0
      ? ((await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600)).data ?? [])
      : [];
  const photoUrls = signed.flatMap((item) => (item.signedUrl ? [item.signedUrl] : []));
  const names = await namesById(supabase, [
    lead.created_by,
    lead.assigned_to,
    ...(events ?? []).map((event) => event.actor_id),
  ]);
  const owner = names.get(lead.created_by) ?? "someone";
  const choices = canEdit ? statusChoices(me.role, lead.status) : [];
  const session = sessionResult.data;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Link
          href="/app/leads"
          className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-semibold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          Leads
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{leadName(lead)}</h1>
          <StatusBadge status={lead.status} />
        </div>
        <p className="text-sm text-muted-foreground">
          Added by {owner} on {formatDate(lead.created_at)}
          {session ? `, while knocking in ${session.neighbourhood}` : ""}.
        </p>
        {!canEdit ? (
          <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">
            Read only. This is {owner}&apos;s lead.
          </p>
        ) : null}
        {photosParam === "failed" ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            The lead saved, but its photos didn&apos;t attach. Add them again below.
          </p>
        ) : null}
        {canEdit ? (
          <Button asChild variant="outline" className="w-fit">
            <Link href={`/app/leads/${lead.id}/edit`}>Edit lead</Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {lead.phone ? (
            <Button asChild size="lg" className="w-full sm:w-fit">
              <a href={`tel:${lead.phone}`}>Call {formatPhone(lead.phone)}</a>
            </Button>
          ) : (
            <p className="text-muted-foreground">No phone yet. Booking a meeting will need one.</p>
          )}
          {lead.email ? (
            <a
              href={`mailto:${lead.email}`}
              className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-4"
            >
              {lead.email}
            </a>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <p className="text-base font-semibold">{lead.address_line}</p>
          <p className="text-muted-foreground">
            {[lead.neighbourhood, lead.city, lead.postal_code].filter(Boolean).join(", ")}
          </p>
          <a
            href={mapsLink(lead)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-fit items-center font-semibold underline underline-offset-4"
          >
            Open in Google Maps
          </a>
          {lead.lat === null ? (
            <p className="text-muted-foreground">
              No map position yet.
              {canEdit ? " Edit the lead and pick the address from the suggestions to add one." : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>House</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">House type</dt>
            <dd>{labelFor(HOUSE_TYPE_OPTIONS, lead.house_type) || "Not noted"}</dd>
            <dt className="text-muted-foreground">Soffit colour</dt>
            <dd>
              {labelFor(SOFFIT_OPTIONS, lead.soffit_colour) || "Not noted"}
              {lead.soffit_note ? `: ${lead.soffit_note}` : ""}
            </dd>
            <dt className="text-muted-foreground">Came from</dt>
            <dd>{labelFor(SOURCE_OPTIONS, lead.source)}</dd>
          </dl>
          {lead.notes ? <p className="mt-4 text-sm whitespace-pre-wrap">{lead.notes}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Photos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {photoUrls.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {photoUrls.map((url, index) => (
                <li key={url} className="overflow-hidden rounded-md border">
                  <a href={url} target="_blank" rel="noopener noreferrer" className="block outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {/* eslint-disable-next-line @next/next/no-img-element -- private photos behind short-lived signed links must not go through the image cache */}
                    <img src={url} alt={`Photo ${index + 1} of the house`} className="aspect-square w-full object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No photos yet.</p>
          )}
          {canEdit ? <PhotoPicker userId={me.id} mode="attach" leadId={lead.id} /> : null}
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Status</CardTitle>
          </CardHeader>
          <CardContent>
            {choices.length > 0 ? (
              <StatusControl
                key={lead.status}
                leadId={lead.id}
                current={lead.status}
                choices={choices}
                lostReasons={reasons}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                This lead is at {STATUS_LABELS[lead.status]}. From here Keenan moves it along.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <NoteForm leadId={lead.id} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-4" aria-label="Timeline">
            {(events ?? []).map((event) => (
              <li key={event.id} className="flex flex-col gap-1 border-l-2 border-border pl-3">
                <p className={event.type === "note" ? "text-sm whitespace-pre-wrap" : "text-sm font-semibold"}>
                  {describeEvent(event)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {event.actor_id ? (names.get(event.actor_id) ?? "Someone") : "Vesper"},{" "}
                  {formatDateTime(event.created_at)}
                </p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
