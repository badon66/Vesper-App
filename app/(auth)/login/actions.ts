"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  error?: string;
};

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function signIn(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Enter your email address and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "user_banned") {
      return { error: "This account has been deactivated. Talk to Keenan." };
    }
    return { error: "That email and password did not match. Try again." };
  }

  // The client follows a server action's redirect without a fresh pass
  // through proxy.ts, so the first-sign-in hold has to be decided here too.
  const mustSetPassword = data.user?.user_metadata?.must_set_password === true;
  redirect(mustSetPassword ? "/set-password" : safeNextPath(parsed.data.next));
}
