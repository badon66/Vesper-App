"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, requireOwnerForAction } from "@/lib/auth/profile";
import { generateTempPassword } from "@/lib/people/temp-password";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CreatePersonState = {
  error?: string;
  errors?: { full_name?: string; email?: string; phone?: string };
  created?: { fullName: string; email: string; tempPassword: string };
};

export type SetActiveState = {
  error?: string;
};

const createSchema = z.object({
  full_name: z.string().trim().min(1, { error: "Enter their name." }).max(80),
  email: z.email({ error: "Enter a valid email address." }),
  phone: z.string().trim().max(40, { error: "That phone number is too long." }),
});

// A long ban is how Supabase Auth refuses sign-in for a deactivated account.
const BAN_FOREVER = "876600h";

async function owner() {
  try {
    return await requireOwnerForAction();
  } catch (e) {
    if (e instanceof NotOwnerError) return null;
    throw e;
  }
}

// Creates a sales associate's login with a one-time temporary password. The
// profile row is created by the database trigger; the role is always sales.
export async function createPerson(
  _previous: CreatePersonState,
  formData: FormData,
): Promise<CreatePersonState> {
  if (!(await owner())) return { error: "Not for your role." };

  const parsed = createSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
  });
  if (!parsed.success) {
    const errors: CreatePersonState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof NonNullable<CreatePersonState["errors"]>;
      errors[field] ??= issue.message;
    }
    return { errors };
  }

  const tempPassword = generateTempPassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
      must_set_password: true,
    },
  });
  if (error) {
    if (error.code === "email_exists") {
      return { errors: { email: "Someone already has a login with that email." } };
    }
    return { error: "The login could not be created. Try again." };
  }

  revalidatePath("/app/people");
  return {
    created: {
      fullName: parsed.data.full_name,
      email: parsed.data.email,
      tempPassword,
    },
  };
}

const setActiveSchema = z.object({
  id: z.uuid(),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

// Deactivating bans the auth user so sign-in is refused, then flags the
// profile so an existing session is signed out on its next request.
// Reactivating reverses both.
export async function setPersonActive(
  _previous: SetActiveState,
  formData: FormData,
): Promise<SetActiveState> {
  const me = await owner();
  if (!me) return { error: "Not for your role." };

  const parsed = setActiveSchema.safeParse({
    id: formData.get("id"),
    active: formData.get("active"),
  });
  if (!parsed.success) return { error: "That request did not make sense." };
  const { id, active } = parsed.data;

  if (id === me.id) return { error: "You cannot deactivate yourself." };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("profiles")
    .select("id, role, active")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { error: "That person was not found." };
  if (target.role === "owner") return { error: "The admin account cannot be changed here." };
  if (target.active === active) return {};

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : BAN_FOREVER,
  });
  if (banError) return { error: "The change could not be saved. Try again." };

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ active })
    .eq("id", id);
  if (updateError) {
    // Put the auth side back so the two never disagree.
    await admin.auth.admin.updateUserById(id, {
      ban_duration: active ? BAN_FOREVER : "none",
    });
    return { error: "The change could not be saved. Try again." };
  }

  revalidatePath("/app/people");
  return {};
}
