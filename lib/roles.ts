import type { Database } from "@/types/database";

export type UserRole = Database["public"]["Enums"]["user_role"];

// Enum values stay owner | sales | crew. These are the words people see.
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Admin",
  sales: "Sales associate",
  crew: "Crew",
};

// Roles the People screen can give out. The owner role is never assignable:
// there is exactly one owner and the database enforces it. Crew arrives
// with V2.
export const ASSIGNABLE_ROLES = ["sales"] as const satisfies readonly UserRole[];

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}
