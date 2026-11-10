import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { NotForYourRole } from "@/components/not-for-your-role";
import type { TracerPhoto } from "@/components/roofline/photo-menu";
import { RooflineTracer, type TracerStart } from "@/components/roofline/roofline-tracer";
import { quoteRunFeet } from "@/components/roofline/trace-save";
import { requireProfile } from "@/lib/auth/profile";
import { parseLooks, parseTrace } from "@/lib/deck";
import { leadName } from "@/lib/leads/status";
import { warmWhiteOf } from "@/lib/lights/looks";
import { rooflineState } from "@/lib/meetings/prep";
import { PHOTO_BUCKET } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Trace the roofline",
};

// Prep item 6 (round 7, light_picker.tracing): trace the roofline on one of
// the lead's photos for meeting mode's light picker. Owner only: the owner
// group's layout refuses everyone else, View as included, and the page
// checks again before it reads anything. Reached from the prep list and
// from the lead page (?from=lead, so Back and Save go back there).

const GUIDED = [
  { slot: "front", label: "Front" },
  { slot: "left_corner", label: "Left corner" },
  { slot: "right_corner", label: "Right corner" },
] as const;

export default async function RooflinePage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const me = await requireProfile();
  if (me.role !== "owner") return <NotForYourRole />;
  const { leadId } = await params;
  const { from } = await searchParams;
  if (!z.uuid().safeParse(leadId).success) notFound();

  const supabase = await createClient();
  const [{ data: lead }, { data: photoRows }, { data: traceRow }, { data: quoteRows }, { data: settingsRow }] = await Promise.all([
    supabase.from("leads").select("id, first_name, last_name, address_line").eq("id", leadId).maybeSingle(),
    supabase.from("lead_photos").select("id, storage_path, slot, created_at").eq("lead_id", leadId).order("created_at"),
    supabase
      .from("roofline_traces")
      .select("photo_id, photo_slot, lines, line_feet, scale, dusk_brightness, light_count")
      .eq("lead_id", leadId)
      .maybeSingle(),
    supabase.from("quotes").select("runs, updated_at").eq("lead_id", leadId).order("updated_at", { ascending: false }),
    supabase.from("settings").select("light_looks").eq("id", 1).maybeSingle(),
  ]);
  if (!lead) notFound();

  const allPhotos = photoRows ?? [];
  const state = rooflineState(traceRow, allPhotos);
  const trace = traceRow && state === "traced" ? parseTrace(traceRow) : null;

  // The photos it can be traced on: the Front, Left corner and Right corner
  // photos, and the extra photo the trace was drawn on (Keenan's own
  // upload), if that's where it is.
  const offered = [
    ...GUIDED.flatMap(({ slot, label }) => {
      const row = allPhotos.find((photo) => photo.slot === slot);
      return row ? [{ id: row.id, label, path: row.storage_path }] : [];
    }),
    ...allPhotos
      .filter((photo) => photo.slot === null && trace && photo.id === traceRow?.photo_id)
      .map((photo) => ({ id: photo.id, label: "Your photo", path: photo.storage_path })),
  ];
  const signed =
    offered.length > 0 ? ((await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(offered.map((photo) => photo.path), 3600)).data ?? []) : [];
  const urlByPath = new Map(signed.flatMap((item) => (item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [])));
  const photos: TracerPhoto[] = offered.flatMap((photo) => {
    const url = urlByPath.get(photo.path);
    return url ? [{ id: photo.id, label: photo.label, url }] : [];
  });

  // It opens on the photo the trace was drawn on, else the Front photo,
  // with the light count the save stored (prep shows the same one).
  const start: TracerStart =
    trace && traceRow && photos.some((photo) => photo.id === traceRow.photo_id)
      ? { photoId: traceRow.photo_id, lines: trace.lines, lineFeet: trace.lineFeet, scale: trace.scale, lightCount: trace.lightCount }
      : { photoId: photos[0]?.id ?? null, lines: [], lineFeet: [], scale: null, lightCount: null };

  const quoteWithRuns = (quoteRows ?? []).find((quote) => quoteRunFeet(quote.runs) > 0) ?? null;
  const quoteFeet = quoteWithRuns ? quoteRunFeet(quoteWithRuns.runs) : null;
  const fromLead = (Array.isArray(from) ? from[0] : from) === "lead";

  return (
    <RooflineTracer
      leadId={leadId}
      userId={me.id}
      heading={[leadName(lead), lead.address_line].filter(Boolean).join(", ")}
      photos={photos}
      start={start}
      photoChanged={state === "photo_changed"}
      quoteFeet={quoteFeet}
      look={warmWhiteOf(parseLooks(settingsRow?.light_looks))}
      backHref={fromLead ? `/app/leads/${leadId}` : `/app/meetings/prep/${leadId}`}
      backLabel={fromLead ? "Lead" : "Prep"}
    />
  );
}
