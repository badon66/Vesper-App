"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SetPasswordState = {
  error?: string;
};

const schema = z
  .object({
    password: z.string().min(PASSWORD_MIN_LENGTH),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"] });

export async function setPassword(
  _previous: SetPasswordState,
  formData: FormData,
): Promise<SetPasswordState> {
  const parsed = schema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) {
    const confirmProblem = parsed.error.issues.some((i) => i.path[0] === "confirm");
    return {
      error: confirmProblem
        ? "The two passwords do not match."
        : `Choose a password of at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
    data: { must_set_password: false },
  });
  if (error) {
    if (error.code === "same_password") {
      return { error: "Choose a password you have not used here before." };
    }
    if (error.code === "weak_password") {
      return { error: "That password is too easy to guess. Try a longer one." };
    }
    return { error: "The password could not be saved. Try again." };
  }

  // The session token carries the must_set_password flag, so refresh it now
  // or proxy.ts would send the person straight back here.
  await supabase.auth.refreshSession();
  redirect("/app");
}
