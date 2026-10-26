import { describe, expect, it } from "vitest";
import { ASSIGNABLE_ROLES, roleLabel } from "@/lib/roles";

describe("roles", () => {
  it("labels the enum values the way people see them", () => {
    expect(roleLabel("owner")).toBe("Admin");
    expect(roleLabel("sales")).toBe("Sales associate");
    expect(roleLabel("crew")).toBe("Crew");
  });

  it("never lets the People screen hand out the owner role", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("owner");
  });
});
