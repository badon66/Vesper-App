"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNextPath } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { VIEW_AS_COOKIE } from "@/lib/view-as";

export type LoginState = {
  error?: string;
  // Counts failed attempts so the form can clear the password field, and
  // only that field, after each one.
  attempt?: number;
};

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  next: z.string().optional(),
});

export async function signIn(
  previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const attempt = (previous.attempt ?? 0) + 1;
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Enter your email address and password.", attempt };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  if (error) {
    if (error.code === "user_banned") {
      return { error: "This account has been deactivated. Talk to Keenan.", attempt };
    }
    return { error: "That email and password did not match. Try again.", attempt };
  }

  // A View as left behind on this device never carries over to a new sign-in.
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect(safeNextPath(parsed.data.next));
}
