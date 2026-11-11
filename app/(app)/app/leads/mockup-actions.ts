"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction } from "@/lib/auth/profile";
import { MOCKUP_NAME_MAX, MOCKUP_OFFERS_MAX, onePerHouse, type MockupRole } from "@/lib/leads/mockup-roles";
import { isOwnPhotoPath } from "@/lib/photos";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

// Mockups per house (round 10, Keenan, 2026-11-10): Keenan's alone. He adds
// as many as he likes, names each one and marks what each is for: Main,
// Day, Night, a scene for the phone page, or the picture for particular
// offers. Owner only, refused under View as and for everyone else, and the
// database refuses them too (owner-only policies on lead_mockups). Rows are
// never deleted: Remove sets removed_at and clears the roles.

export type MockupResult = { ok: true } | { ok: false; message: string };

const ROLE_COLUMN = { main: "is_main", day: "is_day", night: "is_night", scene: "is_scene" } as const;

function roleChange(role: MockupRole, on: boolean) {
  switch (role) {
    case "main":
      return { is_main: on };
    case "day":
      return { is_day: on };
    case "night":
      return { is_night: on };
    case "scene":
      return { is_scene: on };
  }
}
const MAX_ADD = 12;
const FAILED = "That didn't save. Check your signal and try again.";

async function owner(): Promise<{ id: string } | { ok: false; message: string }> {
  try {
    return await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, message: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, message: "Only Keenan adds and changes mockups." };
    throw e;
  }
}

function refused(me: { id: string } | { ok: false; message: string }): me is { ok: false; message: string } {
  return "ok" in me;
}

const nameSchema = z.string().trim().max(MOCKUP_NAME_MAX);
const offerSchema = z.string().trim().min(1).max(64);

// Takes an offer off every picture that has it, except one. True when every
// change saved.
async function takeOfferOff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: { id: string; offer_ids: string[] | null }[],
  offerId: string,
  except: string | null,
): Promise<boolean> {
  const had = rows.filter((row) => row.id !== except && (row.offer_ids ?? []).includes(offerId));
  const results = await Promise.all(
    had.map((row) =>
      supabase
        .from("lead_mockups")
        .update({ offer_ids: (row.offer_ids ?? []).filter((id) => id !== offerId) })
        .eq("id", row.id),
    ),
  );
  return results.every((result) => !result.error);
}

async function done(leadId: string): Promise<MockupResult> {
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath(`/app/meetings/prep/${leadId}`);
  return { ok: true };
}

// The mockup's lead, for the checks and the page to refresh. Removed ones
// are left alone.
async function liveMockup(supabase: Awaited<ReturnType<typeof createClient>>, mockupId: string) {
  const id = z.uuid().safeParse(mockupId);
  if (!id.success) return null;
  const { data } = await supabase
    .from("lead_mockups")
    .select("id, lead_id, offer_ids")
    .eq("id", id.data)
    .is("removed_at", null)
    .maybeSingle();
  return data;
}

// Pictures already uploaded to Keenan's own folder in lead-photos. The
// first one on a house with no Main becomes its Main; asMain makes the
// first one the Main whatever (the prep list's "Replace the mockup").
// forOffer (round 13): the one picture is that offer's own from the start
// (the offer card's Upload), taking the offer off the picture that had it,
// in this one call instead of three.
export async function addLeadMockups(
  leadId: string,
  items: { path: string; name?: string }[],
  options: { asMain?: boolean; forOffer?: string } = {},
): Promise<MockupResult> {
  const me = await owner();
  if (refused(me)) return me;
  const id = z.uuid().safeParse(leadId);
  if (!id.success) return { ok: false, message: "That lead was not found." };
  if (
    !Array.isArray(items) ||
    items.length === 0 ||
    items.length > MAX_ADD ||
    items.some((item) => typeof item?.path !== "string" || !isOwnPhotoPath(item.path, me.id))
  ) {
    return { ok: false, message: "A picture did not upload properly. Try it again." };
  }
  const names = items.map((item) => nameSchema.safeParse(item.name ?? ""));
  if (names.some((name) => !name.success)) return { ok: false, message: "Keep each name to 40 characters." };
  const forOffer = options.forOffer === undefined ? null : offerSchema.safeParse(options.forOffer);
  if (forOffer && (!forOffer.success || items.length !== 1)) return { ok: false, message: FAILED };

  const supabase = await createClient();
  const { data: rows, error: readError } = await supabase
    .from("lead_mockups")
    .select("id, is_main, position, offer_ids")
    .eq("lead_id", id.data)
    .is("removed_at", null);
  if (readError) return { ok: false, message: FAILED };
  const current = rows ?? [];
  // One picture per offer: the offer comes off the picture that had it.
  if (forOffer?.success) {
    const cleared = await takeOfferOff(supabase, current, forOffer.data, null);
    if (!cleared) return { ok: false, message: FAILED };
  }
  const hasMain = current.some((row) => row.is_main);
  if (options.asMain && hasMain) {
    const { error } = await supabase
      .from("lead_mockups")
      .update({ is_main: false })
      .eq("lead_id", id.data)
      .eq("is_main", true)
      .is("removed_at", null);
    if (error) return { ok: false, message: FAILED };
  }
  const start = current.reduce((most, row) => Math.max(most, row.position), -1) + 1;
  const { error } = await supabase.from("lead_mockups").insert(
    items.map((item, at) => ({
      lead_id: id.data,
      storage_path: item.path,
      name: names[at].success ? names[at].data : "",
      is_main: at === 0 && (options.asMain === true || !hasMain),
      position: start + at,
      ...(forOffer?.success ? { offer_ids: [forOffer.data] } : {}),
    })),
  );
  if (error) return { ok: false, message: error.code === "42501" ? "Only Keenan adds mockups." : FAILED };
  return done(id.data);
}

export async function renameLeadMockup(mockupId: string, name: string): Promise<MockupResult> {
  const me = await owner();
  if (refused(me)) return me;
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, message: "Keep the name to 40 characters." };
  const supabase = await createClient();
  const mockup = await liveMockup(supabase, mockupId);
  if (!mockup) return { ok: false, message: "That mockup was not found." };
  const { error } = await supabase.from("lead_mockups").update({ name: parsed.data }).eq("id", mockup.id);
  if (error) return { ok: false, message: FAILED };
  return done(mockup.lead_id);
}

// Main, Day and Night are one per house: turning one on takes it off the
// picture that had it first (cleared first, then set, for the unique index).
export async function setLeadMockupRole(mockupId: string, role: MockupRole, on: boolean): Promise<MockupResult> {
  const me = await owner();
  if (refused(me)) return me;
  if (typeof role !== "string" || !Object.hasOwn(ROLE_COLUMN, role) || typeof on !== "boolean") return { ok: false, message: FAILED };
  const column = ROLE_COLUMN[role];
  const supabase = await createClient();
  const mockup = await liveMockup(supabase, mockupId);
  if (!mockup) return { ok: false, message: "That mockup was not found." };
  if (on && onePerHouse(role)) {
    const { error } = await supabase
      .from("lead_mockups")
      .update(roleChange(role, false))
      .eq("lead_id", mockup.lead_id)
      .eq(column, true)
      .neq("id", mockup.id)
      .is("removed_at", null);
    if (error) return { ok: false, message: FAILED };
  }
  const { error } = await supabase.from("lead_mockups").update(roleChange(role, on)).eq("id", mockup.id);
  if (error) return { ok: false, message: FAILED };
  return done(mockup.lead_id);
}

// The offers (quotes.offers ids) a picture shows, one tap per offer.
// The offer card's photo spot (round 13: the only place an offer gets its
// picture): this picture for that offer, or none (mockupId null: back to
// the Main). One picture per offer, so the offer comes off any other
// picture of the house, all in one call.
export async function setOfferPicture(leadId: string, offerId: string, mockupId: string | null): Promise<MockupResult> {
  const me = await owner();
  if (refused(me)) return me;
  const lead = z.uuid().safeParse(leadId);
  const offer = offerSchema.safeParse(offerId);
  const picked = mockupId === null ? null : z.uuid().safeParse(mockupId);
  if (!lead.success || !offer.success || (picked && !picked.success)) return { ok: false, message: FAILED };
  const supabase = await createClient();
  const { data: rows, error: readError } = await supabase
    .from("lead_mockups")
    .select("id, offer_ids")
    .eq("lead_id", lead.data)
    .is("removed_at", null);
  if (readError) return { ok: false, message: FAILED };
  const current = rows ?? [];
  const target = picked ? current.find((row) => row.id === picked.data) : null;
  if (picked && !target) return { ok: false, message: "That mockup was not found." };
  if (target && !(target.offer_ids ?? []).includes(offer.data)) {
    const next = [...(target.offer_ids ?? []), offer.data];
    if (next.length > MOCKUP_OFFERS_MAX) return { ok: false, message: `A picture can show ${MOCKUP_OFFERS_MAX} offers at most.` };
  }
  const [cleared, marked] = await Promise.all([
    takeOfferOff(supabase, current, offer.data, target?.id ?? null),
    target && !(target.offer_ids ?? []).includes(offer.data)
      ? supabase
          .from("lead_mockups")
          .update({ offer_ids: [...(target.offer_ids ?? []), offer.data] })
          .eq("id", target.id)
          .then(({ error }) => !error)
      : Promise.resolve(true),
  ]);
  if (!cleared || !marked) return { ok: false, message: FAILED };
  return done(lead.data);
}

// Off the lead page, kept in the database, its jobs cleared.
export async function removeLeadMockup(mockupId: string): Promise<MockupResult> {
  const me = await owner();
  if (refused(me)) return me;
  const supabase = await createClient();
  const mockup = await liveMockup(supabase, mockupId);
  if (!mockup) return { ok: false, message: "That mockup was not found." };
  const { error } = await supabase
    .from("lead_mockups")
    .update({
      removed_at: new Date().toISOString(),
      is_main: false,
      is_day: false,
      is_night: false,
      is_scene: false,
      offer_ids: [],
    })
    .eq("id", mockup.id);
  if (error) return { ok: false, message: FAILED };
  return done(mockup.lead_id);
}
