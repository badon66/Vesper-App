"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth";
import { NotOwnerError, requireOwnerForAction } from "@/lib/auth/profile";
import {
  parseSettingsForm,
  settingsFormDataToInput,
  settingsUpdateFromValues,
  type SettingsFormErrors,
} from "@/lib/settings/schema";
import { createClient } from "@/lib/supabase/server";

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
    if (e instanceof NotOwnerError) return { error: "Not for your role." };
    throw e;
  }

  const parsed = parseSettingsForm(settingsFormDataToInput(formData));
  if (!parsed.ok) {
    return { error: "Some fields need a look.", errors: parsed.errors };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update(settingsUpdateFromValues(parsed.values))
    .eq("id", 1);
  if (error) {
    return { error: "Settings could not be saved. Try again." };
  }

  revalidatePath("/app/settings");
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
