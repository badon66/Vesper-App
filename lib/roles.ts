import type { Database } from "@/types/database";

export type UserRole = Database["public"]["Enums"]["user_role"];

// Enum values stay owner | sales | crew. These are the words people see.
export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Admin",
  sales: "Sales associate",
  crew: "Crew",
};

// Roles the People screen can give out. Add "crew" here when V2 arrives and
// the picker and the sign-up trigger both accept it; nothing else changes.
// The owner role is never assignable: there is exactly one owner and the
// database enforces it.
export const ASSIGNABLE_ROLES = ["sales"] as const satisfies readonly UserRole[];
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role];
}

export function assignableRoleOptions(): { value: AssignableRole; label: string }[] {
  return ASSIGNABLE_ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }));
}
