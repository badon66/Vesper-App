"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NotOwnerError, requireOwnerForAction } from "@/lib/auth/profile";
import { generatePassword } from "@/lib/people/password";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type CreatePersonState = {
  error?: string;
  errors?: { full_name?: string; email?: string; phone?: string; role?: string };
  created?: { fullName: string; email: string; password: string };
};

export type ResetPasswordState = {
  error?: string;
  reset?: { id: string; fullName: string; password: string };
};

export type SetActiveState = {
  error?: string;
};

const createSchema = z.object({
  full_name: z.string().trim().min(1, { error: "Enter their name." }).max(80),
  email: z.email({ error: "Enter a valid email address." }),
  phone: z.string().trim().max(40, { error: "That phone number is too long." }),
  role: z.enum(ASSIGNABLE_ROLES, { error: "Pick a role from the list." }),
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

// Loads a person the owner may act on: exists, is not the owner, is not me.
async function targetPerson(id: string, meId: string) {
  if (id === meId) return { error: "You cannot do that to your own account." };
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, role, active, full_name")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { error: "That person was not found." };
  if (data.role === "owner") return { error: "The admin account cannot be changed here." };
  return { person: data };
}

// Creates a member's login. The app generates the password, shows it once,
// and the owner texts it. The profile row is created by the database trigger,
// which honours the chosen role. The email is marked confirmed at creation.
export async function createPerson(
  _previous: CreatePersonState,
  formData: FormData,
): Promise<CreatePersonState> {
  if (!(await owner())) return { error: "Not for your role." };

  const parsed = createSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    role: formData.get("role") ?? ASSIGNABLE_ROLES[0],
  });
  if (!parsed.success) {
    const errors: CreatePersonState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as keyof NonNullable<CreatePersonState["errors"]>;
      errors[field] ??= issue.message;
    }
    return { errors };
  }

  const password = generatePassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: parsed.data.full_name,
      phone: parsed.data.phone || null,
      role: parsed.data.role,
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
      password,
    },
  };
}

const idSchema = z.object({ id: z.uuid() });

// Generates a new password for a member, shows it once, and ends every open
// session they have so the old password stops working everywhere at once.
export async function resetPassword(
  _previous: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const me = await owner();
  if (!me) return { error: "Not for your role." };

  const parsed = idSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "That request did not make sense." };
  const target = await targetPerson(parsed.data.id, me.id);
  if ("error" in target) return { error: target.error };

  const password = generatePassword();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(target.person.id, {
    password,
  });
  if (error) return { error: "The password could not be reset. Try again." };

  const { error: endError } = await admin.rpc("end_user_sessions", {
    target_user: target.person.id,
  });
  if (endError) {
    return {
      error:
        "The password changed, but their open sessions could not be ended. Reset again to retry.",
    };
  }

  revalidatePath("/app/people");
  return {
    reset: {
      id: target.person.id,
      fullName: target.person.full_name,
      password,
    },
  };
}

const setActiveSchema = z.object({
  id: z.uuid(),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});

// Deactivating bans the auth user so sign-in is refused, ends their open
// sessions, and flags the profile. Reactivating lifts the ban and the flag.
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
  const target = await targetPerson(id, me.id);
  if ("error" in target) return { error: target.error };
  if (target.person.active === active) return {};

  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : BAN_FOREVER,
  });
  if (banError) return { error: "The change could not be saved. Try again." };

  const supabase = await createClient();
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

  if (!active) {
    // Best effort: the profile flag already signs them out on their next
    // request if this fails.
    await admin.rpc("end_user_sessions", { target_user: id });
  }

  revalidatePath("/app/people");
  return {};
}
