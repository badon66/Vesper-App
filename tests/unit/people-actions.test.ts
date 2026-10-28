import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPerson,
  resetPassword,
  setPersonActive,
} from "@/app/(app)/app/(owner)/admin/people/actions";
import { PASSWORD_PATTERN } from "@/lib/people/password";

// The People server actions with Supabase replaced by fakes, so the tests
// see exactly what each action asks the Auth admin API and the database to
// do. The live walk-through and the RLS suite cover the real services.

const mocks = vi.hoisted(() => {
  class NotOwnerError extends Error {}
  class ReadOnlyError extends Error {}
  return {
    NotOwnerError,
    ReadOnlyError,
    ownerId: "0b6f6f0e-2c1a-4e8b-9a7d-5c3e2f1a0b9c",
    isOwner: { value: true },
    target: {
      value: null as null | { id: string; role: string; active: boolean; full_name: string },
    },
    createUser: vi.fn(),
    updateUserById: vi.fn(),
    rpc: vi.fn(),
    updateProfile: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/profile", () => ({
  NotOwnerError: mocks.NotOwnerError,
  ReadOnlyError: mocks.ReadOnlyError,
  requireOwnerForAction: async () => {
    if (!mocks.isOwner.value) throw new mocks.NotOwnerError("Not for your role");
    return {
      id: mocks.ownerId,
      email: "info@vesperlighting.ca",
      full_name: "Keenan Huber",
      phone: null,
      role: "owner",
      active: true,
    };
  },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: { createUser: mocks.createUser, updateUserById: mocks.updateUserById },
    },
    rpc: mocks.rpc,
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.target.value }) }),
      }),
      update: (values: Record<string, unknown>) => ({
        eq: async () => {
          mocks.updateProfile(values);
          return { error: null };
        },
      }),
    }),
  }),
}));

const MEMBER_ID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  mocks.isOwner.value = true;
  mocks.target.value = null;
  mocks.createUser.mockReset().mockResolvedValue({ data: { user: { id: MEMBER_ID } }, error: null });
  mocks.updateUserById.mockReset().mockResolvedValue({ data: {}, error: null });
  mocks.rpc.mockReset().mockResolvedValue({ data: 1, error: null });
  mocks.updateProfile.mockReset();
});

describe("createPerson", () => {
  it("puts the role in app_metadata only, confirms the email, and returns the generated password once", async () => {
    const result = await createPerson(
      {},
      form({ full_name: "Zed Example", email: "zed@example.com", phone: "", role: "sales" }),
    );
    expect(mocks.createUser).toHaveBeenCalledTimes(1);
    const arg = mocks.createUser.mock.calls[0][0];
    expect(arg.email).toBe("zed@example.com");
    expect(arg.email_confirm).toBe(true);
    expect(arg.app_metadata).toEqual({ role: "sales" });
    expect(arg.user_metadata).not.toHaveProperty("role");
    expect(arg.user_metadata).toMatchObject({ full_name: "Zed Example" });
    expect(arg.password).toMatch(PASSWORD_PATTERN);
    expect(result.created).toEqual({
      fullName: "Zed Example",
      email: "zed@example.com",
      password: arg.password,
    });
  });

  it("refuses a missing role or one the People screen does not hand out", async () => {
    for (const role of ["owner", "crew", "nonsense", null]) {
      const fields: Record<string, string> = { full_name: "Zed", email: "zed@example.com", phone: "" };
      if (role) fields.role = role;
      const result = await createPerson({}, form(fields));
      expect(result.errors?.role, String(role)).toBeDefined();
    }
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("does nothing for someone who is not the owner", async () => {
    mocks.isOwner.value = false;
    const result = await createPerson(
      {},
      form({ full_name: "Zed", email: "zed@example.com", phone: "", role: "sales" }),
    );
    expect(result.error).toBe("Not for your role.");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });
});

describe("resetPassword", () => {
  it("sets a newly generated password and ends every open session", async () => {
    mocks.target.value = { id: MEMBER_ID, role: "sales", active: true, full_name: "Zed Example" };
    const result = await resetPassword({}, form({ id: MEMBER_ID }));
    expect(mocks.updateUserById).toHaveBeenCalledTimes(1);
    const [id, attrs] = mocks.updateUserById.mock.calls[0];
    expect(id).toBe(MEMBER_ID);
    expect(attrs.password).toMatch(PASSWORD_PATTERN);
    expect(mocks.rpc).toHaveBeenCalledWith("end_user_sessions", { target_user: MEMBER_ID });
    expect(result.reset).toEqual({ id: MEMBER_ID, fullName: "Zed Example", password: attrs.password });
  });

  it("never touches the admin account or the caller's own", async () => {
    mocks.target.value = { id: MEMBER_ID, role: "owner", active: true, full_name: "Keenan Huber" };
    expect((await resetPassword({}, form({ id: MEMBER_ID }))).error).toMatch(/admin account/);
    expect((await resetPassword({}, form({ id: mocks.ownerId }))).error).toMatch(/your own account/);
    expect(mocks.updateUserById).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("setPersonActive", () => {
  it("deactivating bans the login, flags the profile, and ends open sessions", async () => {
    mocks.target.value = { id: MEMBER_ID, role: "sales", active: true, full_name: "Zed Example" };
    const result = await setPersonActive({}, form({ id: MEMBER_ID, active: "false" }));
    expect(result).toEqual({});
    expect(mocks.updateUserById).toHaveBeenCalledWith(MEMBER_ID, { ban_duration: "876600h" });
    expect(mocks.updateProfile).toHaveBeenCalledWith({ active: false });
    expect(mocks.rpc).toHaveBeenCalledWith("end_user_sessions", { target_user: MEMBER_ID });
  });

  it("reactivating lifts the ban and clears the flag", async () => {
    mocks.target.value = { id: MEMBER_ID, role: "sales", active: false, full_name: "Zed Example" };
    const result = await setPersonActive({}, form({ id: MEMBER_ID, active: "true" }));
    expect(result).toEqual({});
    expect(mocks.updateUserById).toHaveBeenCalledWith(MEMBER_ID, { ban_duration: "none" });
    expect(mocks.updateProfile).toHaveBeenCalledWith({ active: true });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
