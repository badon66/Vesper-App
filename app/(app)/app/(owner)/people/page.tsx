import type { Metadata } from "next";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireProfile } from "@/lib/auth/profile";
import { assignableRoleOptions, roleLabel } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { AddMember } from "./add-member";
import { PersonActions } from "./person-actions";

export const metadata: Metadata = {
  title: "People",
};

export default async function PeoplePage() {
  const me = await requireProfile();
  const supabase = await createClient();
  const { data: people, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, phone, role, active, created_at")
    .order("role", { ascending: true })
    .order("active", { ascending: false })
    .order("full_name", { ascending: true });

  if (error || !people) {
    throw new Error("People could not be loaded.");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">People</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everyone with a Vesper login. Deactivated people cannot sign in and
          do not appear in pickers.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((person) => (
            <TableRow key={person.id} className={person.active ? undefined : "text-muted-foreground"}>
              <TableCell>
                <div className="font-semibold text-foreground">
                  {person.full_name}
                  {person.id === me.id ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">you</span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground">{person.email}</div>
              </TableCell>
              <TableCell>{roleLabel(person.role)}</TableCell>
              <TableCell>{person.active ? "Active" : "Deactivated"}</TableCell>
              <TableCell className="text-right">
                {person.role === "owner" ? (
                  <span className="text-xs text-muted-foreground">Change your password in Settings</span>
                ) : (
                  <PersonActions id={person.id} name={person.full_name} active={person.active} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <AddMember roles={assignableRoleOptions()} />
    </div>
  );
}
