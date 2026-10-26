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
import { roleLabel } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { AddPersonForm } from "./add-person-form";
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
          Everyone with a login. Deactivated people cannot sign in and do not
          appear in pickers.
        </p>
      </div>

      <AddPersonForm />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {people.map((person) => (
            <TableRow key={person.id} className={person.active ? undefined : "text-muted-foreground"}>
              <TableCell className="font-semibold text-foreground">
                {person.full_name}
                {person.id === me.id ? <span className="ml-2 text-xs font-normal text-muted-foreground">you</span> : null}
              </TableCell>
              <TableCell>{person.email}</TableCell>
              <TableCell>{person.phone ?? ""}</TableCell>
              <TableCell>{roleLabel(person.role)}</TableCell>
              <TableCell>{person.active ? "Active" : "Deactivated"}</TableCell>
              <TableCell className="text-right">
                {person.role === "owner" ? null : (
                  <PersonActions id={person.id} active={person.active} />
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
