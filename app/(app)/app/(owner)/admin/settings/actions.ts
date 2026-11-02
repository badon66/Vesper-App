"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth";
import { NotOwnerError, ReadOnlyError, requireOwnerForAction } from "@/lib/auth/profile";
import {
  PAGE_IMAGE_SLOTS,
  PRESENTATION_KINDS,
  mergePresentationText,
  withPresentationImage,
  withoutPresentationImage,
} from "@/lib/presentation";
import {
  parseSettingsForm,
  settingsFormDataToInput,
  settingsUpdateFromValues,
  type SettingsFormErrors,
} from "@/lib/settings/schema";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_READ_ONLY } from "@/lib/view-as";

export type SettingsState = {
  ok?: boolean;
  savedAt?: string;
  error?: string;
  errors?: SettingsFormErrors;
};

export async function updateSettings(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  try {
    await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { error: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { error: "Not for your role." };
    throw e;
  }

  const parsed = parseSettingsForm(settingsFormDataToInput(formData));
  if (!parsed.ok) {
    return { error: "Some fields need a look.", errors: parsed.errors };
  }

  const supabase = await createClient();
  // The presentation's titles and bodies merge over the stored image paths,
  // which only uploads change (M5).
  const { data: current } = await supabase.from("settings").select("presentation").eq("id", 1).single();
  const update = {
    ...settingsUpdateFromValues(parsed.values),
    presentation: mergePresentationText(current?.presentation ?? [], parsed.values.presentation_pages),
  };
  const { error } = await supabase.from("settings").update(update).eq("id", 1);
  if (error) {
    return { error: "Settings could not be saved. Try again." };
  }

  revalidatePath("/app/admin/settings");
  return { ok: true, savedAt: new Date().toISOString() };
}

export type ChangePasswordState = {
  ok?: boolean;
  error?: string;
};

const passwordSchema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

// The owner is the only person who changes their own password in the app.
// Everyone else gets theirs from the owner, who can reset it from People.
export async function changeOwnPassword(
  _previous: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  try {
    await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { error: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { error: "Not for your role." };
    throw e;
  }

  const parsed = passwordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((i) => i.path[0] === "confirm");
    return {
      error: mismatch
        ? "The two passwords do not match."
        : `Choose a password of at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") {
      return { error: "That is already your password." };
    }
    if (error.code === "weak_password") {
      return { error: "That password is too easy to guess. Try a longer one." };
    }
    return { error: "The password could not be changed. Try again." };
  }
  return { ok: true };
}


// ---------------------------------------------------------------- presentation images (M5)

export type PresentationImageResult = { ok: true } | { ok: false; error: string };

const kindSchema = z.enum(PRESENTATION_KINDS);

// Records an upload that already landed in the presentation bucket.
export async function addPresentationImage(
  kind: string,
  path: string,
  slotIndex: number | null,
): Promise<PresentationImageResult> {
  try {
    await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, error: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, error: "Not for your role." };
    throw e;
  }
  const kindParsed = kindSchema.safeParse(kind);
  const pathParsed = z.string().trim().min(1).max(300).safeParse(path);
  if (!kindParsed.success || !pathParsed.success || !PAGE_IMAGE_SLOTS[kindParsed.data]) {
    return { ok: false, error: "That image could not be added." };
  }
  const slots = PAGE_IMAGE_SLOTS[kindParsed.data];
  const slot =
    slots?.slots === null
      ? null
      : typeof slotIndex === "number" && Number.isInteger(slotIndex) && slotIndex >= 0 && slotIndex < (slots?.max ?? 0)
        ? slotIndex
        : 0;

  const supabase = await createClient();
  const { data: current } = await supabase.from("settings").select("presentation").eq("id", 1).single();
  const pages = withPresentationImage(current?.presentation ?? [], kindParsed.data, pathParsed.data, slot);
  const { error } = await supabase.from("settings").update({ presentation: pages }).eq("id", 1);
  if (error) return { ok: false, error: "The image could not be saved. Try again." };
  revalidatePath("/app/admin/settings");
  return { ok: true };
}

// Takes an image off a page and out of the bucket.
export async function removePresentationImage(kind: string, path: string): Promise<PresentationImageResult> {
  try {
    await requireOwnerForAction();
  } catch (e) {
    if (e instanceof ReadOnlyError) return { ok: false, error: VIEW_AS_READ_ONLY };
    if (e instanceof NotOwnerError) return { ok: false, error: "Not for your role." };
    throw e;
  }
  const kindParsed = kindSchema.safeParse(kind);
  const pathParsed = z.string().trim().min(1).max(300).safeParse(path);
  if (!kindParsed.success || !pathParsed.success) return { ok: false, error: "That image was not found." };

  const supabase = await createClient();
  const { data: current } = await supabase.from("settings").select("presentation").eq("id", 1).single();
  const pages = withoutPresentationImage(current?.presentation ?? [], kindParsed.data, pathParsed.data);
  const { error } = await supabase.from("settings").update({ presentation: pages }).eq("id", 1);
  if (error) return { ok: false, error: "The image could not be removed. Try again." };
  await supabase.storage.from("presentation").remove([pathParsed.data]);
  revalidatePath("/app/admin/settings");
  return { ok: true };
}
