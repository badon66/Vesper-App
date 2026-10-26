"use server";

import { revalidatePath } from "next/cache";
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
