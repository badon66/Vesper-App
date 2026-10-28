import type { Metadata } from "next";
import { OwnerHome } from "@/components/home/owner-home";
import { SalesHome } from "@/components/home/sales-home";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/profile";
import { roleLabel } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Home",
};

// Home depends on who the screen is for: the owner's dashboard, a setter's
// knock session and follow-ups, or a placeholder for crew until V2. While
// the owner views the app as someone, this is that person's Home, read only.
export default async function HomePage() {
  const { profile, viewingAs } = await getViewer();
  if (profile.role === "owner") return <OwnerHome profile={profile} />;
  if (profile.role === "sales") return <SalesHome profile={profile} readOnly={viewingAs} />;

  const firstName = profile.full_name.split(" ")[0] || profile.full_name;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {roleLabel(profile.role)}. Signed in as {profile.email}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nothing here yet</CardTitle>
          <CardDescription>
            Crew job sheets and timesheets arrive with the next version of Vesper.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
